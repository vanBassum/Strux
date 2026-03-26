#pragma once
#include "ServiceProvider.h"
#include "InitState.h"
#include "DateTime.h"

class SettingsManager;

class TimeManager
{
    inline static constexpr const char *TAG = "TimeManager";

public:
    explicit TimeManager(ServiceProvider &ctx);

    void Init();

    bool IsTimeSynced() const { return synced; }
    bool IsTimeValid() const;

private:
    SettingsManager &settingsManager;
    InitState initState;

    volatile bool synced = false;
    char ntpServer[64] = {};

    void ApplyTimezone();
    void LoadServerName();
    void StartSntp();

    static void TimeSyncCallback(struct timeval *tv);
    static TimeManager *instance;
};
