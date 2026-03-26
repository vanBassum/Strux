#include <stdio.h>
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "ApplicationContext.h"
#include "StatusLed.h"

static const char* TAG = "main";

ApplicationContext g_appContext;
StatusLed g_statusLed;

extern "C" void app_main(void)
{
    ESP_LOGI(TAG, "Starting up...");

    // Status LED: fast blink while booting
    g_statusLed.Init();
    g_statusLed.SetPattern(StatusLed::Pattern::FastBlink);

    // Core services
    g_appContext.getLogManager().Init();
    g_appContext.getSettingsManager().Init();
    g_appContext.getNetworkManager().Init();
    g_appContext.getTimeManager().Init();

    // Application services
    g_appContext.getCommandManager().Init();
    g_appContext.getMqttManager().Init();
    g_appContext.getUpdateManager().Init();
    g_appContext.getWebServerManager().Init();

    // Boot complete — LED indicates WiFi state
    if (g_appContext.getNetworkManager().IsAccessPoint())
        g_statusLed.SetPattern(StatusLed::Pattern::SlowBlink);
    else
        g_statusLed.SetPattern(StatusLed::Pattern::Solid);
}
