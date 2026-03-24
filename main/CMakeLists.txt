set(SOURCE_FILES_LIST
    "main.cpp"
    "Application/NetworkManager/NetworkManager.cpp"
    "Application/NetworkManager/NetworkInterface.cpp"
    "Application/NetworkManager/WiFiInterface.cpp"
    "Application/NetworkManager/DnsConfiguration.cpp"
    "Application/WebServerManager/WebServerManager.cpp"
    "Application/WebServerManager/StaticFileHandler.cpp"
    "Application/WebServerManager/WebSocketHandler.cpp"
    "Application/CommandManager/CommandManager.cpp"
    "Application/UpdateManager/UpdateManager.cpp"
    "Application/SettingsManager/SettingsManager.cpp"
)

set(INCLUDE_DIRS_LIST
    .
    "Application"
    "Application/NetworkManager"
    "Application/WebServerManager"
    "Application/CommandManager"
    "Application/UpdateManager"
    "Application/SettingsManager"
    "lib"
    "lib/common"
    "lib/rtos"
    "lib/json"
)

set(COMPONENT_REQUIRES
    esp_timer
    esp_netif
    esp_event
    esp_wifi
    nvs_flash
    esp_http_server
    esp_app_format
    app_update
    esp_partition
    fatfs
    wear_levelling
)

# Register component with ESP-IDF
idf_component_register(
    SRCS ${SOURCE_FILES_LIST}
    INCLUDE_DIRS ${INCLUDE_DIRS_LIST}
    REQUIRES ${COMPONENT_REQUIRES}
)
