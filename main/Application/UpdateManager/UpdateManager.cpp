#include "UpdateManager.h"
#include "esp_log.h"
#include "esp_system.h"

UpdateManager::UpdateManager(ServiceProvider& serviceProvider)
    : serviceProvider_(serviceProvider)
{
}

void UpdateManager::Init()
{
    auto initAttempt = initState_.TryBeginInit();
    if (!initAttempt)
    {
        ESP_LOGW(TAG, "Already initialized or initializing");
        return;
    }

    initAttempt.SetReady();
    ESP_LOGI(TAG, "Initialized");
}

// ──────────────────────────────────────────────────────────────
// App firmware OTA
// ──────────────────────────────────────────────────────────────

bool UpdateManager::BeginAppUpdate()
{
    if (otaActive_)
    {
        ESP_LOGW(TAG, "OTA already in progress");
        return false;
    }

    otaPartition_ = esp_ota_get_next_update_partition(nullptr);
    if (!otaPartition_)
    {
        ESP_LOGE(TAG, "No OTA partition available");
        return false;
    }

    esp_err_t err = esp_ota_begin(otaPartition_, OTA_WITH_SEQUENTIAL_WRITES, &otaHandle_);
    if (err != ESP_OK)
    {
        ESP_LOGE(TAG, "esp_ota_begin failed: %s", esp_err_to_name(err));
        return false;
    }

    otaActive_ = true;
    ESP_LOGI(TAG, "App OTA started on partition '%s'", otaPartition_->label);
    return true;
}

bool UpdateManager::WriteAppChunk(const void* data, size_t size)
{
    if (!otaActive_) return false;

    esp_err_t err = esp_ota_write(otaHandle_, data, size);
    if (err != ESP_OK)
    {
        ESP_LOGE(TAG, "esp_ota_write failed: %s", esp_err_to_name(err));
        AbortOta();
        return false;
    }
    return true;
}

const char* UpdateManager::FinalizeAppUpdate()
{
    if (!otaActive_) return "No OTA in progress";

    otaActive_ = false;

    esp_err_t err = esp_ota_end(otaHandle_);
    if (err != ESP_OK)
    {
        ESP_LOGE(TAG, "esp_ota_end failed: %s", esp_err_to_name(err));
        return "Image validation failed";
    }

    err = esp_ota_set_boot_partition(otaPartition_);
    if (err != ESP_OK)
    {
        ESP_LOGE(TAG, "esp_ota_set_boot_partition failed: %s", esp_err_to_name(err));
        return "Failed to set boot partition";
    }

    ESP_LOGI(TAG, "App OTA finalized, next boot from '%s'", otaPartition_->label);
    return nullptr; // success
}

void UpdateManager::AbortOta()
{
    if (otaActive_)
    {
        esp_ota_abort(otaHandle_);
        otaActive_ = false;
        ESP_LOGW(TAG, "OTA aborted");
    }
}

const char* UpdateManager::GetRunningPartition() const
{
    const esp_partition_t* p = esp_ota_get_running_partition();
    return p ? p->label : "unknown";
}

const char* UpdateManager::GetNextPartition() const
{
    const esp_partition_t* p = esp_ota_get_next_update_partition(nullptr);
    return p ? p->label : "none";
}

// ──────────────────────────────────────────────────────────────
// WWW partition update
// ──────────────────────────────────────────────────────────────

bool UpdateManager::BeginWwwUpdate()
{
    if (wwwActive_)
    {
        ESP_LOGW(TAG, "WWW update already in progress");
        return false;
    }

    wwwPartition_ = esp_partition_find_first(ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_DATA_FAT, "www");
    if (!wwwPartition_)
    {
        ESP_LOGE(TAG, "WWW partition not found");
        return false;
    }

    esp_err_t err = esp_partition_erase_range(wwwPartition_, 0, wwwPartition_->size);
    if (err != ESP_OK)
    {
        ESP_LOGE(TAG, "Failed to erase WWW partition: %s", esp_err_to_name(err));
        return false;
    }

    wwwOffset_ = 0;
    wwwActive_ = true;
    ESP_LOGI(TAG, "WWW update started (partition size: %lu)", (unsigned long)wwwPartition_->size);
    return true;
}

bool UpdateManager::WriteWwwChunk(const void* data, size_t size)
{
    if (!wwwActive_) return false;

    if (wwwOffset_ + size > wwwPartition_->size)
    {
        ESP_LOGE(TAG, "WWW data exceeds partition size");
        wwwActive_ = false;
        return false;
    }

    esp_err_t err = esp_partition_write(wwwPartition_, wwwOffset_, data, size);
    if (err != ESP_OK)
    {
        ESP_LOGE(TAG, "esp_partition_write failed: %s", esp_err_to_name(err));
        wwwActive_ = false;
        return false;
    }

    wwwOffset_ += size;
    return true;
}

const char* UpdateManager::FinalizeWwwUpdate()
{
    if (!wwwActive_) return "No WWW update in progress";

    wwwActive_ = false;
    ESP_LOGI(TAG, "WWW update finalized (%lu bytes written)", (unsigned long)wwwOffset_);
    return nullptr; // success
}
