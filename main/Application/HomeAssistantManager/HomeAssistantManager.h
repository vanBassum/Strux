#pragma once

#include "ServiceProvider.h"
#include "InitState.h"

class HomeAssistantManager
{
    static constexpr const char *TAG = "HomeAssistantManager";

public:
    explicit HomeAssistantManager(ServiceProvider &serviceProvider);

    HomeAssistantManager(const HomeAssistantManager &) = delete;
    HomeAssistantManager &operator=(const HomeAssistantManager &) = delete;
    HomeAssistantManager(HomeAssistantManager &&) = delete;
    HomeAssistantManager &operator=(HomeAssistantManager &&) = delete;

    void Init();

private:
    ServiceProvider &serviceProvider_;
    InitState initState_;

    void PublishLedState();
};
