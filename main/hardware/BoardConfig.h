#pragma once

// ──────────────────────────────────────────────────────────────
// Board configuration — hardware-specific pin assignments and constants.
// Edit this file to match your board or target MCU.
// ──────────────────────────────────────────────────────────────

namespace BoardConfig
{
    // Status LED
    // GPIO2 is the built-in LED on most ESP32 DevKit boards.
    // Set to -1 if the board has no status LED.
    static constexpr int STATUS_LED_PIN = 2;
    static constexpr bool STATUS_LED_ACTIVE_HIGH = true;

    // Add project-specific pin definitions below.
    // Examples:
    //   static constexpr int MODBUS_TX_PIN = 17;
    //   static constexpr int MODBUS_RX_PIN = 16;
    //   static constexpr int SPI_MOSI_PIN  = 13;
}
