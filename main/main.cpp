#include <stdio.h>
#include "esp_log.h"
#include "ApplicationContext.h"

static const char* TAG = "main";

ApplicationContext g_appContext;

extern "C" void app_main(void)
{
    ESP_LOGI(TAG, "Starting up...");

    g_appContext.getLogManager().Init();
    g_appContext.getSettingsManager().Init();
    g_appContext.getNetworkManager().Init();
    g_appContext.getTimeManager().Init();
    g_appContext.getCommandManager().Init();
    g_appContext.getMqttManager().Init();
    g_appContext.getDeviceManager().Init();
    g_appContext.getHomeAssistantManager().Init();
    g_appContext.getUpdateManager().Init();
    g_appContext.getWebServerManager().Init();
}
