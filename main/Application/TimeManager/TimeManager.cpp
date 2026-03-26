#include "TimeManager.h"
#include "SettingsManager/SettingsManager.h"
#include "esp_log.h"
#include "esp_netif_sntp.h"
#include <ctime>

TimeManager *TimeManager::instance = nullptr;

TimeManager::TimeManager(ServiceProvider &ctx)
    : settingsManager(ctx.getSettingsManager())
{
}

void TimeManager::Init()
{
    auto init = initState.TryBeginInit();
    if (!init)
        return;

    instance = this;

    ApplyTimezone();
    LoadServerName();
    StartSntp();

    init.SetReady();
    ESP_LOGI(TAG, "Initialized");
}

void TimeManager::ApplyTimezone()
{
    char tz[64] = {};
    settingsManager.getString("ntp.timezone", tz, sizeof(tz));

    if (tz[0] != '\0')
    {
        setenv("TZ", tz, 1);
        tzset();
        ESP_LOGI(TAG, "Timezone set to: %s", tz);
    }
    else
    {
        setenv("TZ", "UTC0", 1);
        tzset();
        ESP_LOGI(TAG, "No timezone configured, using UTC");
    }
}

void TimeManager::LoadServerName()
{
    if (!settingsManager.getString("ntp.server", ntpServer, sizeof(ntpServer)) || ntpServer[0] == '\0')
        snprintf(ntpServer, sizeof(ntpServer), "pool.ntp.org");
}

void TimeManager::StartSntp()
{
    ESP_LOGI(TAG, "Starting SNTP with server: %s", ntpServer);

    // ntpServer is a member - pointer stays valid for the lifetime of the object
    esp_sntp_config_t config = ESP_NETIF_SNTP_DEFAULT_CONFIG(ntpServer);
    config.sync_cb = TimeSyncCallback;
    config.start = true;
    ESP_ERROR_CHECK(esp_netif_sntp_init(&config));
}

void TimeManager::TimeSyncCallback(struct timeval *tv)
{
    if (!instance)
        return;

    instance->synced = true;

    char buf[32];
    DateTime now = DateTime::Now();
    now.ToStringLocal(buf, sizeof(buf), "%F %T");
    ESP_LOGI(TAG, "Time synchronized: %s", buf);
}

bool TimeManager::IsTimeValid() const
{
    time_t now = time(nullptr);
    struct tm t;
    gmtime_r(&now, &t);
    return t.tm_year >= (2020 - 1900);
}
