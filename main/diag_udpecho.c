// TEMPORARY DIAGNOSTIC — the measuring instrument, copied in shape from wifiprobe so
// the two firmwares are measured by the same thing.
//
// C, not C++, and reaching for nothing in Strux on purpose: it must not be able to be
// part of what it is measuring. Blocking recvfrom on one task, no logging on the
// packet path, counters read by whoever asks over serial.

#include "DiagConfig.h"

#if DIAG_ENABLE_UDP_ECHO

#include <stdio.h>
#include <inttypes.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_rom_sys.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "esp_system.h"
#include "lwip/sockets.h"

static const char* DTAG = "diagecho";

static volatile uint32_t d_rx;
static volatile uint32_t d_tx;
static volatile uint32_t d_rx_err;
static volatile uint32_t d_tx_err;
static volatile uint32_t d_seq_high;
static volatile int      d_tx_errno;   // errno of the last failed sendto

static void diag_echo_task(void* arg)
{
    (void)arg;
    static uint8_t buf[1500];

    for (;;)
    {
        int sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
        if (sock < 0) { vTaskDelay(pdMS_TO_TICKS(1000)); continue; }

        struct sockaddr_in addr = {
            .sin_family = AF_INET,
            .sin_port = htons(DIAG_UDP_PORT),
            .sin_addr.s_addr = htonl(INADDR_ANY),
        };
        if (bind(sock, (struct sockaddr*)&addr, sizeof(addr)) < 0)
        {
            ESP_LOGE(DTAG, "bind failed errno=%d", errno);
            close(sock);
            vTaskDelay(pdMS_TO_TICKS(1000));
            continue;
        }
        ESP_LOGI(DTAG, "udp echo on :%d", DIAG_UDP_PORT);

        for (;;)
        {
            struct sockaddr_storage from;
            socklen_t from_len = sizeof(from);
            int n = recvfrom(sock, buf, sizeof(buf), 0, (struct sockaddr*)&from, &from_len);
            if (n < 0) { d_rx_err++; break; }

            d_rx++;
            if (n >= 4)
            {
                uint32_t seq = (uint32_t)buf[0] | ((uint32_t)buf[1] << 8) |
                               ((uint32_t)buf[2] << 16) | ((uint32_t)buf[3] << 24);
                if (seq + 1 > d_seq_high) d_seq_high = seq + 1;
            }

            if (sendto(sock, buf, n, 0, (struct sockaddr*)&from, from_len) != n)
            {
                // Names the failing resource. ENOMEM(12)/ENOBUFS(105) = a pool is
                // empty, not the heap; the heap is reported on the same line.
                d_tx_errno = errno;
                d_tx_err++;
            }
            else d_tx++;
        }
        close(sock);
    }
}

// esp_rom_printf, not ESP_LOGx: ConsoleManager hooks the log vprintf and broadcasts
// every line to WebSocket clients and down the relay pipe, which would put the
// reporter inside the thing being measured.
static void diag_report_task(void* arg)
{
    (void)arg;
    for (;;)
    {
        wifi_ap_record_t ap;
        const int assoc = (esp_wifi_sta_get_ap_info(&ap) == ESP_OK);

        // Read, not assumed. Strux calls esp_wifi_set_ps(WIFI_PS_NONE) in
        // WiFiInterface::Init(), which runs BEFORE esp_wifi_start(). Whether that
        // takes effect is the question; 400 ms round trips are what DTIM buffering
        // looks like. 0 = NONE, 1 = MIN_MODEM, 2 = MAX_MODEM.
        wifi_ps_type_t ps = WIFI_PS_NONE;
        esp_wifi_get_ps(&ps);
        esp_rom_printf("DIAG up=%llus rssi=%d ch=%d ps=%d rx=%u tx=%u seqhigh=%u rxerr=%u txerr=%u txeno=%d heap=%u minheap=%u\n",
                       esp_timer_get_time() / 1000000ULL,
                       assoc ? ap.rssi : 0, assoc ? ap.primary : 0, (int)ps,
                       (unsigned)d_rx, (unsigned)d_tx, (unsigned)d_seq_high,
                       (unsigned)d_rx_err, (unsigned)d_tx_err, d_tx_errno,
                       (unsigned)esp_get_free_heap_size(),
                       (unsigned)esp_get_minimum_free_heap_size());
        vTaskDelay(pdMS_TO_TICKS(5000));
    }
}

#if DIAG_AUTO_REBOOT_S > 0
static void diag_reboot_task(void* arg)
{
    (void)arg;
    vTaskDelay(pdMS_TO_TICKS(DIAG_AUTO_REBOOT_S * 1000));
    esp_rom_printf("DIAG rebooting (churn)\n");
    esp_restart();
}
#endif

void diag_udpecho_start(void)
{
    xTaskCreate(diag_echo_task, "diagecho", 4096, NULL, 5, NULL);
    xTaskCreate(diag_report_task, "diagrep", 3072, NULL, 4, NULL);
#if DIAG_AUTO_REBOOT_S > 0
    xTaskCreate(diag_reboot_task, "diagreb", 2560, NULL, 4, NULL);
#endif
}

#else
void diag_udpecho_start(void) {}
#endif
