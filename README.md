# Skeleton

A clean starting point for ESP32 projects with a modern web interface. Clone it, rename it, and start building — the plumbing is already done.

Skeleton gives you WiFi management, OTA updates, a live log console, persistent settings, and a responsive web UI out of the box. It's designed for homebrew projects where you want to skip the boilerplate and get straight to the interesting part.

<img width="1096" height="591" alt="image" src="https://github.com/user-attachments/assets/cc282e06-f84b-497d-8e5a-3e04add95bac" />

## What's Included

- **WiFi** — Station mode with automatic AP fallback (`Skeleton-AP`) after failed connections
- **Web UI** — React + TypeScript dashboard served from flash, accessible from any browser
- **OTA Updates** — Dual-partition firmware updates and independent web UI updates, no USB required after initial flash
- **Live Console** — Stream device logs to the browser in real time over WebSocket
- **Settings** — Key/value store backed by NVS with a dynamic settings page in the UI
- **Modular Architecture** — Service provider pattern with isolated managers, easy to extend

## Tech Stack

| Layer | Stack |
|-------|-------|
| Firmware | C++, ESP-IDF v6.0, FreeRTOS |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Target | ESP32 (4 MB flash) |
| CI/CD | GitHub Actions — builds firmware + frontend, publishes releases |

## Key Directories

- **`main/`** — ESP-IDF firmware. Application managers live in `Application/`, reusable utilities in `lib/`. This is where your device logic goes.
- **`frontend/`** — React web UI. Built with Vite, outputs to `www/`. This is a standard Node project — `pnpm install && pnpm dev` to work on it.
- **`www/`** — Build output from the frontend, gzipped and embedded into a FAT partition on flash at build time. Don't edit files here directly.

## Getting Started

### Prerequisites

- [ESP-IDF v6.0+](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/get-started/)
- [Node.js 22+](https://nodejs.org/) and [pnpm](https://pnpm.io/)

Or use the included dev container (requires Docker + VS Code with the Dev Containers extension).

### Build & Flash

```bash
# Build the frontend
cd frontend
pnpm install
pnpm build
cd ..

# Build and flash the firmware
idf.py set-target esp32
idf.py build
idf.py -p /dev/ttyUSB0 flash monitor
```

The frontend is compiled, gzipped, and embedded into a FAT partition on flash. No SD card or external storage needed.

### Development

For frontend development with hot reload against a running device:

```bash
cd frontend
pnpm dev
```

Vite's dev server will proxy WebSocket connections to the device. Edit React components and see changes instantly.

## Architecture

All managers follow the same pattern: they receive a `ServiceProvider&` reference at construction and initialize via `Init()`. This gives you dependency injection without a framework.

```
ApplicationContext (owns everything)
├── LogManager          — Captures ESP-IDF logs, broadcasts via WebSocket
├── SettingsManager     — NVS read/write with typed accessors
├── NetworkManager      — WiFi STA/AP with retry and fallback
│   └── WiFiInterface   — ESP WiFi abstraction (swappable for Ethernet)
├── CommandManager      — Routes JSON commands to handlers
├── UpdateManager       — OTA writes to app or www partition
└── WebServerManager    — HTTP + WebSocket server, static file serving
    ├── StaticFileHandler
    └── WebSocketHandler
```

### Adding a New Manager

1. Create a new directory under `main/Application/YourManager/`
2. Implement your manager class, accepting `ServiceProvider&` in the constructor
3. Add it to `ServiceProvider.h` (forward declare + virtual getter)
4. Add it to `ApplicationContext.h` (member + getter implementation)
5. Call `Init()` from `main.cpp`
6. Register source files in `main/CMakeLists.txt`

### Adding a New Command

Commands are dispatched by `CommandManager`. Add an entry to the command table with a type string and handler function. The handler receives a JSON payload and writes its response to a `JsonWriter`. The frontend can call it via the WebSocket RPC layer in `backend.ts`.

## OTA Updates

After initial USB flash, the device can be updated entirely over the web UI:

- **Firmware > Application Firmware** — Writes to the inactive OTA slot, then reboots into it
- **Firmware > WWW Partition** — Updates the web UI independently of firmware

The CI pipeline produces three artifacts per release:

| File | Purpose |
|------|---------|
| `Skeleton-factory.bin` | Full image (bootloader + partitions + app + www) for initial flash via USB |
| `Skeleton-app.bin` | Firmware only, for OTA update via web UI |
| `Skeleton-www.bin` | Web UI only, for updating the frontend independently |

## WiFi Behavior

1. On boot, attempts to connect to the configured WiFi network (stored in NVS)
2. Retries up to 3 times on failure
3. Falls back to an open access point (`Skeleton-AP`) if all retries fail
4. Connect to the AP and access the web UI at the device's IP to configure WiFi credentials

## Making It Yours

This is a skeleton — rename it and build on top of it:

1. **Rename the project** in `CMakeLists.txt` and `.github/workflows/release.yml`
2. **Add your hardware drivers** under `main/lib/` or as ESP-IDF components
3. **Add your application logic** as a new manager (see [Adding a New Manager](#adding-a-new-manager))
4. **Extend the web UI** — add pages in `frontend/src/pages/`, register routes in the sidebar
5. **Add commands** for your features so the frontend can interact with them
6. **Customize settings** by adding entries to the settings definition table in `SettingsManager`

## License

This project is unlicensed. Use it however you want.
