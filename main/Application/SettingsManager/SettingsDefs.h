#pragma once

#include "SettingsManager.h"

// ──────────────────────────────────────────────────────────────
// Setting definitions — add new settings here
// ──────────────────────────────────────────────────────────────

inline const SettingDef SETTINGS_DEFS[] = {
    // WiFi
    { "wifi.ssid",     SettingType::String, "WiFi SSID",     "" },
    { "wifi.password", SettingType::String, "WiFi Password", "" },

    // Device
    { "device.name",   SettingType::String, "Device Name",   "Skeleton" },
};

inline constexpr int SETTINGS_DEFS_COUNT = sizeof(SETTINGS_DEFS) / sizeof(SETTINGS_DEFS[0]);
