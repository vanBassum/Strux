#pragma once

// TEMPORARY BISECTION HARNESS — not architecture, not staying.
// Every switch here is an experiment. 1 = the real Strux behaviour, 0 = gone.
//
// Dependency hazard worth knowing before flipping these: a manager reached through
// StruxProvider whose Init() never ran will block forever in WAIT_FOR_READY. So
// SETTINGS, SYSTEM and COMMAND stay on while NETWORK is on — NetworkManager::Init
// registers settings, asks SystemManager for the device name, and registers a
// command table.

#define DIAG_ENABLE_CONSOLE    1
#define DIAG_ENABLE_SETTINGS   1
#define DIAG_ENABLE_SYSTEM     1
#define DIAG_ENABLE_NETWORK    1
#define DIAG_ENABLE_COMMAND    1

#define DIAG_ENABLE_TIME       1
#define DIAG_ENABLE_UI         1
#define DIAG_ENABLE_UPDATE     1
#define DIAG_ENABLE_WEBSERVER  1
#define DIAG_ENABLE_RELAY      1
#define DIAG_ENABLE_TELEMETRY  1
#define DIAG_ENABLE_APP        1
#define DIAG_ENABLE_MDNS       1

// The measuring instrument: byte-for-byte the same UDP echo wifiprobe runs, on the
// same port, so every configuration below is comparable to the control and to every
// other configuration. Blocking recvfrom on its own task — no polling, no logging on
// the packet path.
// Reboot churn is the reproduction trigger, and it must not depend on the command
// surface — the whole point of the bisection is to delete that. So the device
// reboots itself, and the harness only has to watch the link come and go.
#define DIAG_AUTO_REBOOT_S     0

// The three remaining runtime differences between minimal Strux and wifiprobe.
// The sdkconfig for ESP_WIFI/LWIP is byte-identical between the two projects
// (120 keys, zero diff), so the cause has to be one of these.
// 1 = Strux's behaviour, 0 = wifiprobe's.
#define DIAG_CREATE_AP_NETIF   1   // esp_netif_create_default_wifi_ap()
#define DIAG_ALL_CHANNEL_SCAN  1   // WIFI_ALL_CHANNEL_SCAN + CONNECT_AP_BY_SIGNAL
#define DIAG_PMF_CAPABLE       1   // pmf_cfg.capable = true

#define DIAG_ENABLE_UDP_ECHO   1
#define DIAG_UDP_PORT          7777
