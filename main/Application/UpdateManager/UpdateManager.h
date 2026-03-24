#pragma once

#include "ServiceProvider.h"
#include "InitState.h"
#include <esp_ota_ops.h>
#include <esp_vfs_fat.h>

class UpdateManager {
    static constexpr const char* TAG = "UpdateManager";

public:
    explicit UpdateManager(ServiceProvider& serviceProvider);

    UpdateManager(const UpdateManager&) = delete;
    UpdateManager& operator=(const UpdateManager&) = delete;

    void Init();

    // ── App firmware OTA ──────────────────────────────────────

    bool BeginAppUpdate();
    bool WriteAppChunk(const void* data, size_t size);
    const char* FinalizeAppUpdate();

    const char* GetRunningPartition() const;
    const char* GetNextPartition() const;

    // ── WWW partition update ─────────────────────────────────

    bool BeginWwwUpdate();
    bool WriteWwwChunk(const void* data, size_t size);
    const char* FinalizeWwwUpdate();

private:
    ServiceProvider& serviceProvider_;
    InitState initState_;

    // OTA state
    esp_ota_handle_t otaHandle_ = 0;
    const esp_partition_t* otaPartition_ = nullptr;
    bool otaActive_ = false;

    // WWW state
    const esp_partition_t* wwwPartition_ = nullptr;
    size_t wwwOffset_ = 0;
    bool wwwActive_ = false;

    void AbortOta();
};
