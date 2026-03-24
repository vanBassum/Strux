#pragma once

class CommandManager;
class NetworkManager;
class SettingsManager;
class UpdateManager;
class WebServerManager;

class ServiceProvider
{
public:
    virtual CommandManager& getCommandManager() = 0;
    virtual NetworkManager& getNetworkManager() = 0;
    virtual SettingsManager& getSettingsManager() = 0;
    virtual UpdateManager& getUpdateManager() = 0;
    virtual WebServerManager& getWebServerManager() = 0;
};
