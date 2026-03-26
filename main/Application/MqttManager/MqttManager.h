#pragma once

#include "ServiceProvider.h"
#include "InitState.h"
#include "Timer.h"
#include "mqtt_client.h"

class MqttManager
{
    static constexpr const char *TAG = "MqttManager";

public:
    explicit MqttManager(ServiceProvider &serviceProvider);

    MqttManager(const MqttManager &) = delete;
    MqttManager &operator=(const MqttManager &) = delete;
    MqttManager(MqttManager &&) = delete;
    MqttManager &operator=(MqttManager &&) = delete;

    void Init();

    bool IsConnected() const { return connected_; }

    /// Publish a message to {baseTopic}/{subtopic}.
    /// Projects can use this to publish custom state alongside the built-in diagnostics.
    void Publish(const char *subtopic, const char *payload, bool retain = false);

private:
    ServiceProvider &serviceProvider_;
    InitState initState_;

    esp_mqtt_client_handle_t client_ = nullptr;
    volatile bool connected_ = false;
    bool enabled_ = false;

    char deviceId_[16] = {};   // Last 4 bytes of MAC, hex (e.g. "a1b2c3d4")
    char baseTopic_[96] = {};  // "{prefix}/{deviceId}"

    Timer publishTimer_;

    void BuildDeviceId();
    void StartClient();
    void PublishDiscovery();
    void PublishState();
    void Subscribe();
    void HandleCommand(const char *topic, int topicLen, const char *data, int dataLen);

    static void EventHandler(void *handlerArgs, esp_event_base_t base,
                             int32_t eventId, void *eventData);
    void OnEvent(esp_mqtt_event_handle_t event);
};
