#pragma once
#include "ServiceProvider.h"
#include "CommandManager/CommandManager.h"
#include "DeviceManager/DeviceManager.h"
#include "HomeAssistantManager/HomeAssistantManager.h"
#include "LogManager/LogManager.h"
#include "MqttManager/MqttManager.h"
#include "NetworkManager/NetworkManager.h"
#include "SettingsManager/SettingsManager.h"
#include "TimeManager/TimeManager.h"
#include "UpdateManager/UpdateManager.h"
#include "WebServerManager/WebServerManager.h"

class ApplicationContext : public ServiceProvider
{
public:
    ApplicationContext() = default;
    ~ApplicationContext() = default;
    ApplicationContext(const ApplicationContext&) = delete;
    ApplicationContext& operator=(const ApplicationContext&) = delete;

    CommandManager& getCommandManager() override { return m_commandManager; }
    DeviceManager& getDeviceManager() override { return m_deviceManager; }
    HomeAssistantManager& getHomeAssistantManager() override { return m_homeAssistantManager; }
    LogManager& getLogManager() override { return m_logManager; }
    MqttManager& getMqttManager() override { return m_mqttManager; }
    NetworkManager& getNetworkManager() override { return m_networkManager; }
    SettingsManager& getSettingsManager() override { return m_settingsManager; }
    TimeManager& getTimeManager() override { return m_timeManager; }
    UpdateManager& getUpdateManager() override { return m_updateManager; }
    WebServerManager& getWebServerManager() override { return m_webServerManager; }

private:
    LogManager m_logManager{*this};
    SettingsManager m_settingsManager{*this};
    NetworkManager m_networkManager{*this};
    TimeManager m_timeManager{*this};
    CommandManager m_commandManager{*this};
    MqttManager m_mqttManager{*this};
    DeviceManager m_deviceManager{*this};
    HomeAssistantManager m_homeAssistantManager{*this};
    UpdateManager m_updateManager{*this};
    WebServerManager m_webServerManager{*this};
};
