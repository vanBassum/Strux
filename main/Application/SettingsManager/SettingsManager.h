#pragma once

#include "ServiceProvider.h"
#include "InitState.h"
#include <nvs_handle.hpp>

class JsonWriter;

// ──────────────────────────────────────────────────────────────
// Setting definition table
// ──────────────────────────────────────────────────────────────

// Opaque key type — accepts string literals directly.
// Implicit const char* conversion lets the NVS layer use it transparently.
struct SettingKey {
    const char* key;
    constexpr SettingKey(const char* k) : key(k) {}
    constexpr operator const char*() const { return key; }
};

enum class SettingType : uint8_t { String, Int, Bool };

struct SettingDef {
    SettingKey  key;
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

    bool getString(SettingKey key, char* out, size_t maxLen) const;
    bool setString(SettingKey key, const char* value);

    int32_t getInt(SettingKey key, int32_t defaultVal = 0) const;
    bool setInt(SettingKey key, int32_t value);

    bool getBool(SettingKey key, bool defaultVal = false) const;
    bool setBool(SettingKey key, bool value);

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
