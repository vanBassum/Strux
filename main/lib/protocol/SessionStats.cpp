#include "SessionStats.h"

#include "esp_timer.h"
#include "esp_rom_sys.h"
#include "esp_wifi.h"

// The dump is deliberately NOT ESP_LOGx: ConsoleManager hooks the log vprintf and
// broadcasts every line to all WebSocket clients and down the relay pipe, so logging
// here would push bytes through the transport under investigation. esp_rom_printf
// writes straight to the UART and cannot be hooked.

namespace session_stats
{
    namespace
    {
        constexpr int PERIOD_US = 5 * 1000 * 1000;

        uint32_t g(const C& c) { return c.load(std::memory_order_relaxed); }

        // Short lines, few arguments each. A single 20-argument esp_rom_printf
        // produced numbers that did not reconcile with the requests actually made —
        // the ROM printf is a minimal implementation and is not worth trusting that
        // far. Four boring lines instead.
        void dumpBlock(const Counters& c)
        {
            esp_rom_printf("STAT %s/rx acc=%u ref=%u rxf=%u frm=%u\n",
                           c.name, g(c.accepted), g(c.refused), g(c.recvFail),
                           g(c.frameData));
            esp_rom_printf("STAT %s/rx2 shrt=%u oth=%u skp=%u noslot=%u\n",
                           c.name, g(c.frameShort), g(c.frameOther),
                           g(c.frameSkipped), g(c.noSlot));
            esp_rom_printf("STAT %s/disp route=%u auth=%u in=%u out=%u err=%u\n",
                           c.name, g(c.routeBad), g(c.authReject),
                           g(c.dispatchIn), g(c.dispatchOut), g(c.dispatchErr));
            esp_rom_printf("STAT %s/tx empty=%u tx=%u txf=%u fin=%u finf=%u rdf=%u\n",
                           c.name, g(c.replyEmpty), g(c.sendOk), g(c.sendFail),
                           g(c.finalOk), g(c.finalFail), g(c.readFail));
        }

        void onTick(void*)
        {
            dumpBlock(ws);
            dumpBlock(relay);

            wifi_ap_record_t ap = {};
            const int rssi = (esp_wifi_sta_get_ap_info(&ap) == ESP_OK) ? ap.rssi : 0;
            esp_rom_printf("STAT radio rssi=%d drops=%u reason=%d\n",
                           rssi, g(netDisconnects),
                           netLastReason.load(std::memory_order_relaxed));
        }
    }

    void StartDump()
    {
        static esp_timer_handle_t timer = nullptr;
        if (timer) return;

        const esp_timer_create_args_t args = {
            .callback = &onTick,
            .arg = nullptr,
            .dispatch_method = ESP_TIMER_TASK,
            .name = "sstat",
            .skip_unhandled_events = true,
        };
        if (esp_timer_create(&args, &timer) == ESP_OK)
            esp_timer_start_periodic(timer, PERIOD_US);
    }
}
