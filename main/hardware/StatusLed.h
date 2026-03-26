#pragma once

#include "BoardConfig.h"
#include "Timer.h"
#include "driver/gpio.h"

// ──────────────────────────────────────────────────────────────
// Status LED driver — visual feedback for device state.
//
// Example usage (in main.cpp):
//
//   StatusLed statusLed;
//   statusLed.Init();
//   statusLed.SetPattern(StatusLed::Pattern::FastBlink);   // Booting
//   // ... initialize managers ...
//   statusLed.SetPattern(StatusLed::Pattern::Solid);       // Ready
//
// Pin and polarity are configured in BoardConfig.h.
// Set STATUS_LED_PIN to -1 to compile out all LED code.
// ──────────────────────────────────────────────────────────────

class StatusLed
{
public:
    enum class Pattern { Off, Solid, SlowBlink, FastBlink };

    void Init()
    {
        if constexpr (BoardConfig::STATUS_LED_PIN < 0) return;

        gpio_config_t cfg = {};
        cfg.pin_bit_mask = 1ULL << BoardConfig::STATUS_LED_PIN;
        cfg.mode = GPIO_MODE_OUTPUT;
        gpio_config(&cfg);

        SetGpio(false);

        blinkTimer_.Init("status_led", true, 500);
        blinkTimer_.SetHandler([this]() { Toggle(); });
    }

    void SetPattern(Pattern p)
    {
        if constexpr (BoardConfig::STATUS_LED_PIN < 0) return;

        blinkTimer_.Stop();

        switch (p)
        {
        case Pattern::Off:
            SetGpio(false);
            break;
        case Pattern::Solid:
            SetGpio(true);
            break;
        case Pattern::SlowBlink:
            blinkTimer_.ChangePeriod(500);
            blinkTimer_.Start();
            break;
        case Pattern::FastBlink:
            blinkTimer_.ChangePeriod(100);
            blinkTimer_.Start();
            break;
        }
    }

private:
    Timer blinkTimer_;
    bool state_ = false;

    void SetGpio(bool on)
    {
        state_ = on;
        gpio_set_level(static_cast<gpio_num_t>(BoardConfig::STATUS_LED_PIN),
                       on == BoardConfig::STATUS_LED_ACTIVE_HIGH ? 1 : 0);
    }

    void Toggle()
    {
        SetGpio(!state_);
    }
};
