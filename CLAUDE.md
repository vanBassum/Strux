# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Strux is a template/foundation for ESP32 firmware (ESP-IDF v6.0, C++, FreeRTOS) with a React web UI. It is meant to be copied and renamed into new projects, so keep the core generic — several downstream forks (e.g. the KC1245 Thermostat) backport improvements from and to this repo.

## Build commands

Firmware (requires ESP-IDF v6.0+ environment):

```bash
idf.py set-target esp32
idf.py build                          # also builds the frontend if pnpm is installed
idf.py -p <PORT> flash monitor
idf.py -DBOARD=<name> build           # select a board from main/hardware/boards/ (default: esp32_devkit)
```

Boards today: `esp32_devkit` (ESP32-WROOM-32) and `esp32c3_supermini` (ESP32-C3, USB-C, LED on GPIO8 active low). A non-default chip needs *both* halves — `idf.py -DBOARD=esp32c3_supermini set-target esp32c3`, then build — because `set-target` picks the chip and `-DBOARD` picks the pinout, and a board's `sdkconfig.defaults` cannot supply the chip (see the note below). Add `-B build_c3 -D SDKCONFIG=sdkconfig.c3` to keep a second board's tree beside the default one instead of overwriting it.

**A new line in `sdkconfig.defaults` does not reach an existing build — but the build now refuses instead of lying.** Generated `sdkconfig` files are loaded *after* the defaults and win every conflict, and an option left at its default is still recorded there — as `# CONFIG_FOO is not set` — so adding `CONFIG_FOO=y` to the defaults changes nothing in a tree that already has one. That used to fail silently, exactly like the `CONFIG_IDF_TARGET` case below. A guard in the root [CMakeLists.txt](CMakeLists.txt) now checks every assertion in the composed defaults against what was generated and stops the build naming the options that did not take, with the fix in the message: delete the generated file (`sdkconfig` and `sdkconfig.*` are gitignored and reproducible) and re-run `set-target`. So pulling a commit that changes the defaults gives you a build error, not a wrong binary. A deliberate local override of something the defaults assert needs `-DSTRUX_ALLOW_SDKCONFIG_DRIFT=ON`.

Frontend (React 19 + TypeScript + Vite + Tailwind + shadcn/ui, package manager is pnpm):

```bash
cd frontend
pnpm dev          # hot-reload dev server, proxies WebSocket to a running device
pnpm build        # tsc -b && vite build && gzip into ../www (embedded in flash as FAT image)
pnpm typecheck    # tsc --noEmit
```

There are no automated tests; verification is building, flashing, and driving the device over its own wire:

1. `idf.py build`, `idf.py -p <PORT> flash` — find the port, don't trust a number in a doc.
2. Open a WebSocket to `ws://<device>/ws`, or `ws://<relay>/devices/<deviceId>/ws` through the relay. **No login step** — auth is three ordinary commands (`auth hello|login|resume`) and is off entirely while `web.password` is empty, which is the default.
3. Send a chunk: `[sid u16 LE][flags u8][payload]`, payload starting with the envelope line `{"type":"<category> <command>", …args}\n`, body after it — same chunk or further chunks sharing the sid. `FLAG_FINAL` (0x01) on the last.
4. Read chunks with your sid until one carries `FLAG_FINAL` (or `FLAG_REJECT` 0x02, payload = reason). **Skip session 0** — those are log broadcasts, not your reply. Non-final chunks are reply data, or progress on a long write.
5. Keep each payload inside the transport's inbound window (4096 on both) — a larger frame is refused, not split.

`help list` enumerates every category and command off the device, and `help list -category X -command Y` returns that command's declared arguments, so a probe script needs no source to know what to send.

### Where docs go — three places, nothing else

- **[docs/next-up.md](docs/next-up.md) — what is being worked on *right now*.** Read it first. It is rewritten constantly and deliberately kept tiny: an item is **removed** the moment it lands or is dropped, never annotated, never ticked off in place. Only active work belongs here. If something wants to persist, it does not go in this file — it goes to the backlog (if it is work) or to a note (if it is understanding).
- **`docs/backlog/` — work for later.** One file per topic. A resolved item is **deleted**, not left with a DONE banner; what mattered about it lives in a note by then.
- **`docs/reasoning/` — why things are the way they are.** Append-only, immutable once written, one understanding-delta per note, dated. Never edited: a new understanding is a new note, related to the old one via `builds-on` or `supersedes`. This is the durable record — prefer it over prose documentation anywhere.

Design documents, implementation plans and an ideas folder were all removed on 2026-08-05: they asserted the present tense, so they rotted faster than they were read (see `docs/reasoning/2026-08-05-15h29-a-document-asserts-the-present-tense-so-it-rots.md`). A plan goes in the backlog; the reasoning behind it goes in a note; how to operate something goes in this file. Deleting a doc is not losing it — git has it.

## Architecture

### Three layers, each with a context and a provider

Dependencies run one way only, bottom to top:

Every layer is the same pair: a **context** owning the layer's instances, and a **provider** saying what the layer above may reach for. A manager takes exactly one reference — its own layer's provider — and finds everything through it.

| Layer | Context (owns) | Provider (exposes) |
|---|---|---|
| `main/hardware/` — the **board** | `BoardContext` — driver instances, bus hosts | `BoardProvider` ([hardware/interfaces/BoardProvider.h](main/hardware/interfaces/BoardProvider.h)) — the roles a board owes |
| `main/strux/` — the **framework** | `StruxContext` — the ten Strux managers | `StruxProvider` ([main/strux/StruxProvider.h](main/strux/StruxProvider.h)) |
| `main/app/` — the **application** | `AppContext` — this product's managers | `AppProvider` ([main/app/AppProvider.h](main/app/AppProvider.h)) |

[main.cpp](main/main.cpp) is four calls: `board.Init()`, `strux.Init()`, `application.Init()`, then the OTA validity mark. **The order *within* a layer lives in that layer's context**, not here — `StruxContext::Init()` carries Strux's ordering and its constraints (Relay after WebServer, whose `Authenticator` it shares; Telemetry after Relay, down whose pipe it leaves), so a fork pulling a new framework manager gets its position along with it.

Two rules keep the graph acyclic, and both matter more than they look:

- **Strux never reaches up, and never sideways into hardware.** `StruxProvider` has no `getBoard()` and no way to see `AppProvider`. Hardware belongs to the application: a framework that called `GetLed()` would put that role on `BoardProvider` and oblige every board in every fork to bind one.
- **Anything the framework needs from the application is *registered*, not fetched.** The app registers commands, settings and telemetry points into Strux from its own `Init()`. A Strux manager wanting `AppProvider&` is a design error, not a missing accessor.

`BoardProvider` declares **roles only** (`Led&` today), and that boundary is what keeps it from becoming the union of every board's peripherals: concrete driver accessors — the escape hatch for when the application needs a driver's full API — stay on `BoardContext` itself, checked at compile time. So the day one board grows a display, no other board owes a `MockDisplay`. `AppProvider::getBoard()` returns `BoardContext&`, not `BoardProvider&`, precisely so that escape hatch stays reachable.

What the provider buys over the older duck-typed `Board` is where the failure lands: a board that forgets a role now fails *in the board*, leaving a pure virtual unimplemented, instead of failing later at a call site in application code. What it costs is that a board must bind every role even if this product never uses it — which was already the discipline (`MockLed` exists for exactly that), so the trade is cheap.

Every manager, in either managed layer:

- takes its layer's provider (`StruxProvider&` or `AppProvider&`) in its constructor and reaches everything through it, never directly,
- has copy/move deleted,
- initializes in `Init()` guarded by an `InitState` (`lib/rtos/InitState.h`), not in the constructor.

Adding a **framework** manager: create the class, add it to `StruxProvider`, `StruxContext` (member *and* the ordered `Init()`), and `STRUX_SOURCES` + `INCLUDE_DIRS_LIST` in [main/CMakeLists.txt](main/CMakeLists.txt). Adding an **application** manager: the same, against `AppProvider`, `AppContext` and `APP_SOURCES` — and nothing in `strux/` is touched. [main/app/LedManager/](main/app/LedManager/) is the worked example: it owns the board LED and uses it to say whether the device is connected to its relay server — lit while `RelayManager::IsConnected()`, dark otherwise, polled every 250 ms on a `Timer`. Along the way it registers a setting, two commands, a telemetry point **and a UI contribution** without a single edit to the framework — the link state needed no new accessor, because `IsConnected()` was already the framework's own answer. Its browser half is not in the shell at all: it ships as a UI module ([frontend/modules/led/](frontend/modules/led/), see *Device-hosted UI modules* below), so deleting the example when the product has real features means deleting one manager and one module folder and nothing else.

Note: the two source lists are separated so a fork does not fight the template over one file, but they are still *one* file and still one ESP-IDF component. Making `strux/` a real component is the step that would make syncing a pull rather than a merge; it has not been taken.

### Layer separation within the board

- `main/hardware/` — changes when you swap the board. Depends on nothing above it: `BoardContext` takes no provider (drivers take their pins and buses as constructor arguments, so nothing here needs one to find a peer) and no layer above is visible from it. Split into:
  - `boards/<name>/` — one folder per target board: `BoardConfig.h` (pins/constants), `BoardContext.h`/`BoardContext.cpp` (the board's `BoardContext : BoardProvider` — owns every driver instance and bus host; `BoardContext.cpp` is added via `BOARD_SOURCES` in the `board.cmake` fragment), and an optional `sdkconfig.defaults` overlaying the common root one. Selected with `-DBOARD=<name>`; only the chosen board folder is on the include path, so `#include "BoardConfig.h"` and `#include "BoardContext.h"` resolve to it.
  - `interfaces/` — the role interfaces in application vocabulary (`Led`), 1–3 pure-virtual methods each, never chip or GPIO vocabulary — plus `BoardProvider`, which assembles them into the list every board owes. Drivers implement the roles (`GpioLed : Led`); a board without the hardware binds a mock (`MockLed`). Adding a role to `BoardProvider` obliges every board to bind it, so add one only when application code speaks in that role; when the application needs a driver's full API, expose a concrete accessor from `BoardContext` instead and leave `BoardProvider` alone (escape hatch). Multi-instance roles get a semantic enum (`Sensor::Ambient`, never `Sensor_2`) mapped by the board — introduce it with the first multi-instance role.
  - `drivers/` — board-independent chip/peripheral drivers shared by boards (e.g. `GpioLed.h`), taking pins/buses as constructor parameters (passed by the board from its `BoardConfig` constants).
- `main/strux/` — the framework: the ten managers. Changes when the template improves.
- `main/app/` — changes when you add a feature to *this* product. Hardware driver *instances* live in the board's `BoardContext` class, reached via `AppProvider::getBoard()`.
- `main/lib/` — the substrate all three layers stand on, and **not** part of any of them: RTOS wrappers (`Task`, `Mutex`, `Timer`), `Stream`/`MemoryStream`/`BufferStream`, `JsonWriter`/`JsonReader`, `DateTime`/`TimeSpan`. Rarely changes. The request/reply seam (`CommandContext`, `ArgReader`, `ReplyWriter`) lives in `lib/protocol/`. It sits beside the layers rather than inside `strux/` because the board layer uses `InitState` and the application uses `Timer` — under `strux/` both would be reaching into the framework for them, which is exactly what the layering forbids. The test for whether something belongs here: it names no layer.

Every folder is on the include path, so headers are included by name alone (`#include "Stream.h"`) and moving one between layers does not touch its callers.

Note: ESP-IDF runs an early expansion pass *without* the `BOARD` cache var, and two things a board would like to own are resolved there, so neither can come from the board folder:

- **Component `REQUIRES`** — `board.cmake` fragments cannot change them. IDF built-in deps go in `COMPONENT_REQUIRES` in [main/CMakeLists.txt](main/CMakeLists.txt); managed components go in [main/idf_component.yml](main/idf_component.yml).
- **The chip.** A `CONFIG_IDF_TARGET` line in a board's `sdkconfig.defaults` is read too late and loses silently to whatever the existing `sdkconfig` says — the build then runs with the *wrong toolchain* rather than failing. The chip is selected with `idf.py set-target`, never from a board file.

### Commands (the device's RPC surface)

`CommandManager` is a pure dispatcher — it knows no commands and no other managers. Each command lives in the manager that owns its domain:

- Handlers have the signature `void Handler(Stream& in, Stream& out)`: `in` carries the request payload, the handler writes its complete reply to `out`. Streams are the contract; JSON is a dialect the handler opts into by constructing `JsonReader`/`JsonObject` on line one. Binary payloads (e.g. firmware chunks) use the same contract.
- Owners declare an `inline static CommandEntry commands_[]` table ([CommandEntry.h](main/strux/CommandManager/CommandEntry.h)) with `InvokeCommand<&Owner::Method>` trampolines, and hand it to `CommandManager::Register()` from their `Init()`. Tables must have static storage duration — a registered entry that dies aborts with `FATAL`.
- `help list` is the registry describing itself and the one command `CommandManager` owns: categories and names come off the chain, and a command's *arguments* come from the command itself, by re-dispatching it with a `DescribeArgReader` that prints the declarations instead of filling them and stops the handler at its own `RETURN_IF_ERROR`. So calling `ctx.readArgs(...)` is not optional — a handler that skips it has no `help` and, worse, runs its body when described (logged as an error).
- Two transports reach `Execute()`, and they differ *only* below `SessionLink` ([SessionLink.h](main/lib/protocol/SessionLink.h) — the protocol layer lives in `lib/protocol/`, not under a transport, because the transports depend on it and not the reverse): the local browser WebSocket (`WsSessionLink`, frames read on the httpd task) and the outbound relay pipe (`RelaySessionLink`, frames read on the relay's own task via [RelaySocket](main/strux/RelayManager/RelaySocket.h), a WebSocket driven at the transport layer rather than through `esp_websocket_client` — a callback-delivered frame cannot be the bottom of a streaming handler, and going one layer down is what removed the queue, the per-frame `malloc` and the dropped chunks). Both transports therefore *read* on the task that runs the command. Above that seam everything is shared — `Session` (the stream), `protocol::RunCommandSession` in [CommandEnvelope.h](main/lib/protocol/CommandEnvelope.h) (names the request, dispatches it, closes or refuses the reply), and `AuthGate` — so no handler knows or cares which transport it is serving. There is no HTTP command route; HTTP serves static files only. Wire format is binary session chunks `[session:u16 LE][flags:u8][payload]`, not a JSON envelope.
- Remote access works: `RelayManager` dials out to a server so the device is reachable off-LAN, and the server pulls the device's own frontend with the ordinary `getWebFile` command. Server in its own repository ([vanBassum/strux-relay](https://github.com/vanBassum/strux-relay)); what is proven and what is left in [docs/backlog/2026-07-03-remote-access.md](docs/backlog/2026-07-03-remote-access.md). Off by default (`relay.enabled`).

Log lines broadcast to all WebSocket clients via `ConsoleManager`. The frontend side is a singleton `BackendService` ([frontend/src/lib/backend.ts](frontend/src/lib/backend.ts)) that matches replies to requests by id and auto-reconnects.

`UpdateManager`'s entire external surface is its command table: session-based updates addressed by partition label (`updateBegin`/`updateWrite`/`updateEnd`), pull OTA from URL, and partition download. App partitions go through `esp_ota_*` (image validation, running slot refused); data partitions are raw erase+write. The built frontend is gzipped into `www/` and flashed as a FAT partition, updatable independently of the app.

### Settings

Settings are typed leaf objects (`lib`-style, [TypedSettings.h](main/strux/SettingsManager/TypedSettings.h)) declared in the manager that owns them and registered at runtime:

```cpp
inline static UInt32Setting port_{ "myfeature.port", "My Feature Port", 1883 };
// in Init():  settings.Register({ &port_ });
uint32_t p = port_.Get();   // NVS value or the typed default
```

`SettingsManager` is the NVS link; the settings UI is generated dynamically from the registered definitions.

**A key is at most 15 characters** — NVS's limit, asserted in `Register()` at *runtime*, so an over-long key compiles fine and then boot-loops the device on the assert. Nothing catches it earlier. `telemetry.enabled` (17) does not fit; `telem.enabled` does.

### Device-hosted UI modules

**Neither shell contributes anything to a device's navigation.** Every page comes from
the firmware's manifest, and the first page it declares is the landing page — so a
device decides both what its UI is and which part of it is the front screen. A shell is
the frame, the router, the transport and the theme. Nothing else.

That is not where this started. Console, Settings and Firmware were pages compiled into
each shell, which meant two implementations of each and, worse, a shell that knew
`settings list` and `partition status` by name. Both shells now know the name of no
device command at all.

- **The manifest is a command, not a file.** `ui modules` ([UiManager](main/strux/UiManager/))
  answers with `hostApi` plus the modules and their pages. Nothing about a module
  travels over HTTP except the bundle itself, and device HTTP still serves only static
  files to a LAN browser.
- **The manager that owns the commands owns the page.** A `UiModule` handed to
  `UiManager::Register()` from the manager's own `Init()`, exactly like a command table
  or a setting: [ConsoleManager](main/strux/ConsoleManager/) declares `console`,
  [SettingsManager](main/strux/SettingsManager/) `settings`,
  [UpdateManager](main/strux/UpdateManager/) `firmware`, and the app's own
  [LedManager](main/app/LedManager/) declares `led`. `UiManager::Register` only takes a
  mutex and links a chain, so it may be called before `UiManager::Init()` — which the
  framework managers do, since they initialise first.
- **Declaration order is the landing page.** `UiManager` head-inserts, and the app's
  managers initialise after the framework's, so a product's own page ends up first and
  is what a shell opens. A device with no modules has no page, says so, and leaves
  nothing else broken.
- **Pages only.** There were briefly cards too, rendered into a shell-owned home
  screen; they went when the shell stopped owning any page under a device, because
  nothing was left to host them.
- **The contract is one file with no imports** ([frontend/shell-contract/contract.ts](frontend/shell-contract/contract.ts)),
  because it gets vendored into the relay. `HOST_API` is **2**. Beyond `request` it
  offers `upload` (a command whose request has a body — a firmware image is not an
  argument), `download` (the same in reverse), and `logs` (the device's session-0
  broadcast, the one device-initiated stream there is). There is still no
  `subscribe(topic)`: `logs` is named after the one thing it carries so it does not
  become a framework with a single user.
- **One React, via an import map.** A module builds `react` and `react/jsx-runtime` as
  external; the shell publishes them at `assets/host-react.js` and
  `assets/host-jsx-runtime.js` (see [frontend/src/shell/host-react.js](frontend/src/shell/host-react.js))
  and names them in an import map in `index.html`. Two React copies is the one thing
  that genuinely breaks — every hook throws — so `pnpm build` runs
  `scripts/check-modules.mjs`, which fails the build if a module imports a bare
  specifier the map does not declare or a name the facade does not export. That check
  exists because the first version of the facade used `export * from "react"`, which
  compiles, emits, ships, and silently exports nothing usable: React is CommonJS. In
  dev the map's targets do not exist — they are build artefacts — so `vite.config.ts`
  redirects them to source; without it the seam worked only in a build.
- **A module ships its own primitives** ([frontend/modules/_ui/](frontend/modules/_ui/)).
  It cannot use either shell's components: this shell is radix-ui and the relay's is
  `@base-ui/react`, so importing either would run on exactly one of them. `_ui` is
  plain elements over the shells' design tokens, compiled into each bundle.
- **A module bundles its own CSS.** Imported as a string and adopted as a `<style>` on
  `activate()`, because Vite injects no `<link>` for a chunk pulled in by `import()` —
  the styles would simply never apply. It imports Tailwind's theme and utilities but
  **not preflight** (a second reset would restyle the shell) and scopes `@source` to
  itself and `_ui`.
- **Adding a module:** a folder under `frontend/modules/<id>/` whose `vite.config.ts`
  is one call to `moduleConfig(import.meta.dirname, "<id>")`, a line in
  `frontend/package.json`'s `build:modules` and `typecheck`, and a `UiModule`
  registration in the manager that owns the feature.
- **Mixed fleets are the normal case.** Firmware without `ui modules` refuses the
  command, and a refusal means "no modules" rather than an error; a `hostApi` outside
  the shell's range says so and leaves the rest working.
- **The relay composes the same bundles**
  ([vanBassum/strux-relay](https://github.com/vanBassum/strux-relay)). It reads the
  manifest with a hub method of its own rather than a generic command call, because
  only the relay can tell a device that *refused* `ui modules` from one that went
  silent — the first is the mixed-fleet case, the second is a fault. `request` becomes
  a hub call; `upload` and `download` become HTTP routes, because a body is a body. The
  contract is vendored there byte-identical with a lock file, and its build fails if
  the copy drifts. Its module registry is **per device**, because two boards can
  declare the same page id drawn by different bundles.

### Deliberately out of scope

MQTT and Home Assistant integration were removed 2026-07-06 (last present at tag-time commit `4a41d74`): devices that exist to live in Home Assistant are better served by ESPHome; Strux is for product firmware with its own UI and (planned) relay-based remote access (`docs/backlog/remote-access.md`). Do not reintroduce an MQTT/HA layer in the template — a fork that truly needs it can resurrect the old managers from git history.

## Conventions

- C++17, no exceptions/RTTI-heavy patterns; `snprintf` with `sizeof` bounds, no `strcpy`/`strcat`.
- A command's reply is written through `ctx.reply`, never by naming a format: `ReplyWriter` ([main/lib/protocol/ReplyWriter.h](main/lib/protocol/ReplyWriter.h)) is the mirror of `ArgReader`, and `JsonReplyWriter` is the only implementation today. Every scope comes from a factory — the root from `ctx.reply.object()`/`.array()`, children from their parent — so a call site never spells a type (`auto` is enough) and the methods on offer are exactly the enclosing scope's. Scopes are RAII and close on every return path; writing to a closed one is `FATAL`. It is not a builder: bytes go to the transport on every field, so a scope must close before anything else touches `ctx.out` (see `getWebFile`'s header line, and `updateWrite`'s progress records).
- Elsewhere, JSON is generated with `lib/json/JsonWriter.h` and parsed with `JsonReader` (no external JSON lib). `JsonWriter` is now only the log broadcast, which is not a reply.
- Firmware version derives from the latest git tag (`v0.1.0` → `0.1.0`) in the root CMakeLists.
