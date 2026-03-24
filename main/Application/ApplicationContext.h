#pragma once
#include "ServiceProvider.h"
#include "CommandManager/CommandManager.h"
#include "NetworkManager/NetworkManager.h"
#include "SettingsManager/SettingsManager.h"
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
    NetworkManager& getNetworkManager() override { return m_networkManager; }
    SettingsManager& getSettingsManager() override { return m_settingsManager; }
    UpdateManager& getUpdateManager() override { return m_updateManager; }
    WebServerManager& getWebServerManager() override { return m_webServerManager; }

private:
    SettingsManager m_settingsManager{*this};
    NetworkManager m_networkManager{*this};
    CommandManager m_commandManager{*this};
    UpdateManager m_updateManager{*this};
    WebServerManager m_webServerManager{*this};
};
