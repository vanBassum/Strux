#include "WebSocketHandler.h"
#include "CommandManager.h"
#include "JsonHelpers.h"
#include "BufferStream.h"
#include "JsonWriter.h"
#include "esp_log.h"

#include <cstring>

static constexpr const char* TAG = "WebSocketHandler";

void WebSocketHandler::SetCommandManager(CommandManager& commandManager)
{
    commandManager_ = &commandManager;
}

void WebSocketHandler::RegisterRoute(httpd_handle_t server)
{
    const httpd_uri_t ws_route = {
        .uri = "/ws",
        .method = HTTP_GET,
        .handler = HandleWs,
        .user_ctx = this,
        .is_websocket = true,
        .handle_ws_control_frames = false,
        .supported_subprotocol = nullptr,
    };
    httpd_register_uri_handler(server, &ws_route);
}

// ──────────────────────────────────────────────────────────────
// Client tracking
// ──────────────────────────────────────────────────────────────

void WebSocketHandler::AddWsClient(int fd)
{
    LOCK(wsMutex_);

    for (int i = 0; i < MAX_WS_CLIENTS; i++)
    {
        if (wsClients_[i] == fd) return;
    }

    for (int i = 0; i < MAX_WS_CLIENTS; i++)
    {
        if (wsClients_[i] == 0)
        {
            wsClients_[i] = fd;
            ESP_LOGI(TAG, "WS client added: fd=%d slot=%d", fd, i);
            return;
        }
    }
    ESP_LOGW(TAG, "WS client rejected (max reached): fd=%d", fd);
}

void WebSocketHandler::RemoveWsClient(int fd)
{
    LOCK(wsMutex_);
    for (int i = 0; i < MAX_WS_CLIENTS; i++)
    {
        if (wsClients_[i] == fd)
        {
            wsClients_[i] = 0;
            ESP_LOGI(TAG, "WS client removed: fd=%d slot=%d", fd, i);
            return;
        }
    }
}

void WebSocketHandler::OnClientDisconnected(int fd)
{
    RemoveWsClient(fd);
}

void WebSocketHandler::Broadcast(httpd_handle_t server, const char* json, int len)
{
    LOCK(wsMutex_);

    httpd_ws_frame_t frame = {};
    frame.type = HTTPD_WS_TYPE_TEXT;
    frame.payload = reinterpret_cast<uint8_t*>(const_cast<char*>(json));
    frame.len = len;

    for (int i = 0; i < MAX_WS_CLIENTS; i++)
    {
        if (wsClients_[i] != 0)
        {
            if (httpd_ws_send_frame_async(server, wsClients_[i], &frame) != ESP_OK)
            {
                ESP_LOGW(TAG, "Broadcast failed to fd=%d, removing", wsClients_[i]);
                wsClients_[i] = 0;
            }
        }
    }
}

// ──────────────────────────────────────────────────────────────
// WebSocket frame handling
// ──────────────────────────────────────────────────────────────

esp_err_t WebSocketHandler::HandleWs(httpd_req_t* req)
{
    auto* self = static_cast<WebSocketHandler*>(req->user_ctx);

    if (req->method == HTTP_GET)
    {
        self->AddWsClient(httpd_req_to_sockfd(req));
        return ESP_OK;
    }

    httpd_ws_frame_t frame = {};
    uint8_t buf[512] = {};
    frame.payload = buf;
    esp_err_t ret = httpd_ws_recv_frame(req, &frame, sizeof(buf) - 1);
    if (ret != ESP_OK)
    {
        ESP_LOGW(TAG, "WS recv failed: %s", esp_err_to_name(ret));
        self->RemoveWsClient(httpd_req_to_sockfd(req));
        return ret;
    }

    if (frame.type == HTTPD_WS_TYPE_CLOSE)
    {
        self->RemoveWsClient(httpd_req_to_sockfd(req));
        return ESP_OK;
    }

    if (frame.type != HTTPD_WS_TYPE_TEXT || frame.len == 0)
        return ESP_OK;

    buf[frame.len] = '\0';
    const char* json = reinterpret_cast<const char*>(buf);

    int32_t id = ExtractJsonInt(json, "id");
    char type[32] = {};
    ExtractJsonString(json, "type", type, sizeof(type));

    if (id <= 0 || type[0] == '\0')
        return ESP_OK;

    self->DispatchMessage(req, id, type, json);
    return ESP_OK;
}

void WebSocketHandler::DispatchMessage(httpd_req_t* req, int32_t id, const char* type, const char* json)
{
    BufferStream stream(wsBuf_, sizeof(wsBuf_));
    JsonWriter resp(stream);

    resp.beginObject();
    resp.field("id", id);

    if (commandManager_ && commandManager_->Execute(type, json, resp))
    {
        // Command wrote its fields
    }
    else
    {
        resp.field("error", type);
    }

    resp.endObject();

    httpd_ws_frame_t frame = {};
    frame.type = HTTPD_WS_TYPE_TEXT;
    frame.payload = reinterpret_cast<uint8_t*>(const_cast<char*>(stream.data()));
    frame.len = stream.length();
    httpd_ws_send_frame(req, &frame);
}
