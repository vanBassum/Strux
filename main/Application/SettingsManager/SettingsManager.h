#pragma once

#include "ServiceProvider.h"
#include "InitState.h"
#include <nvs_handle.hpp>

class JsonWriter;

// ──────────────────────────────────────────────────────────────
// Setting definition table
// ──────────────────────────────────────────────────────────────

enum class SettingType : uint8_t { String, Int, Bool };

struct SettingDef {
    const char* key;
    SettingType type;
    const char* label;       // human-readable name for the frontend
    const char* strDefault;  // default for String (also "true"/"false" for Bool, number string for Int)
};

// ──────────────────────────────────────────────────────────────
// Manager
// ──────────────────────────────────────────────────────────────

class SettingsManager {
    static constexpr const char* TAG = "SettingsManager";
    static constexpr const char* NVS_NAMESPACE = "settings";

public:
    explicit SettingsManager(ServiceProvider& serviceProvider);

    SettingsManager(const SettingsManager&) = delete;
    SettingsManager& operator=(const SettingsManager&) = delete;

    void Init();

    // ── Typed access ─────────────────────────────────────────

    bool getString(const char* key, char* out, size_t maxLen) const;
    bool setString(const char* key, const char* value);

    int32_t getInt(const char* key, int32_t defaultVal = 0) const;
    bool setInt(const char* key, int32_t value);

    bool getBool(const char* key, bool defaultVal = false) const;
    bool setBool(const char* key, bool value);

    // ── Persistence ──────────────────────────────────────────

    bool Save();
    bool ResetToDefaults();

    // ── Enumeration ──────────────────────────────────────────

    const SettingDef* GetDefinitions() const;
    int GetDefinitionCount() const;

    void WriteAllSettings(JsonWriter& writer) const;

private:
    ServiceProvider& serviceProvider_;
    InitState initState_;
    std::unique_ptr<nvs::NVSHandle> handle_;

    void ApplyDefaults();
};
