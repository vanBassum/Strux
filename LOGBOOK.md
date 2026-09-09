# Logbook — Wi-Fi packet-loss investigation

Append-only. Newest at the bottom. Each entry is a timestamp, a title, and the
short version. **Never rewrite an entry** — a wrong one gets a later entry saying so.

## The test environment

Fixed for every experiment below, so results are comparable:

- **Device** ESP32-C3 SuperMini, MAC `e8:3d:c1:9e:a8:50`, DHCP `192.168.11.22`,
  serial on COM6. Same physical position throughout.
- **AP** SSID `vanBassum`, 2.4 GHz channel 1, RSSI −66 to −77 dBm. ~18 BSSIDs in
  range, five each on channels 1, 5 and 11.
- **PC** wired Ethernet `192.168.11.10`, 1 Gbps. Gateway and 8.8.8.8 both 0 % loss —
  the PC's own path is never the variable.
- **Relay** local dev API on `ws://192.168.11.10:8080/device`, device id
  `esp32-e83dc19ea850`. Plain `ws://`, **no TLS**.
- **Instrument** `wifiprobe/pc/udpecho.py` — sequenced UDP echo, 200 B payload,
  10 ms gap. UDP not TCP: TCP retransmission hid the loss from us for a day. The
  device echoes on port 7777 (`wifiprobe` natively, Strux via `main/diag_udpecho.c`),
  so both firmwares are measured by the same thing.
- **Control** `C:\Workspace\wifiprobe` — minimal ESP-IDF STA + UDP echo, no Strux
  code at all.
- **Branch** `diag/packet-loss`. `main/DiagConfig.h` holds the kill switches.

---

### 2026-09-09 15:02 — First measurement: Strux loses 78 % of ICMP
109 of 139 pings lost, size-independent (65–90 % at 8/32/200/1000 B). Association
never dropped, RSSI −66…−73. Strux's own command counters were all clean: 23 frames
in, 23 dispatched, 23 returned, every drop counter zero.

### 2026-09-09 15:10 — Wrong conclusion: blamed the RF environment
Reasoned "the loss is below every layer I instrumented, therefore below the
firmware". That bounds the fault from above and says nothing about where it is.

### 2026-09-09 15:20 — Two measurement faults found, both mine
`cmd.mjs` used `console.log` + `process.exit()`; on Windows that truncates piped
stdout, so successful replies were recorded as "empty reply". That failure mode
never existed. Also: one 20-argument `esp_rom_printf` produced numbers that did not
reconcile — split into short lines.

### 2026-09-09 15:35 — Control built: wifiprobe is clean
Same board, position, AP, channel, RSSI. **0/40 ICMP, 0/2500 UDP**, p50 2.7 ms, zero
disconnects, 222 KB free heap. So the RF link is fine and the fault is in Strux.
Supersedes the 15:10 conclusion.

### 2026-09-09 16:05 — Strux baseline came up clean, so the fault is not static
Full Strux + the same instrument: **0/2500 lost**. Then 0/1500 under concurrent
WebSocket load (60/60 commands OK), and 0/1500 during repeated 131 KB HTTP transfers.
Load alone degrades latency (p99 62 ms) but loses nothing. Reproduction became the
blocker.

### 2026-09-09 16:20 — Ruled out: power save reset by stop/start
Theory: Strux's reconnect calls `esp_wifi_stop()`/`start()` and never re-asserts
`WIFI_PS_NONE`. Tested in wifiprobe by doing exactly that cycle:
`ps before stop = 0`, `ps after start = 0`, p50 RTT unchanged at 2.6 ms. Power save
is **not** reset by a stop/start cycle. Disproven.

### 2026-09-09 16:35 — Ruled out: CONFIG_PM_ENABLE / DFS
Strux sets `CONFIG_PM_ENABLE=y` + `CONFIG_PM_DFS_INIT_AUTO=y`; wifiprobe did not.
Added both to wifiprobe as the single variable: **0/2500 lost**. Reason it is inert —
the reported CPU clock never left 160 MHz, because Wi-Fi holds an `APB_FREQ_MAX`
lock. Disproven, with the mechanism.

### 2026-09-09 16:45 — Ruled out: IP conflict / second board
ARP shows one host on `.22` with the expected MAC. No duplicate.

### 2026-09-09 17:00 — REPRODUCED: reboot churn
Rebooting the device repeatedly (what I was actually doing when the failure first
appeared) makes it come back. 8 boots: one at **90.8 %** loss, four more at 2.7–6.8 %,
tail RTT up to 1571 ms.

### 2026-09-09 17:20 — Reproduction is now reliable: 10/10 boots bad
Added `DIAG_AUTO_REBOOT_S=75` so the device reboots itself and the harness needs
nothing from the firmware. Full Strux, 10 self-reboots: **every boot bad**, 14 % to
97 % loss, p50 RTT 156–2387 ms.

Note the shape: p50 of 350–430 ms on a 2 ms link is *queueing or sleeping*, not RF
loss. Next step is to read `esp_wifi_get_ps()` in Strux itself — the 16:20 experiment
only proved a stop/start cycle does not reset it, never that Strux's call (made
*before* `esp_wifi_start()`) takes effect at all.

### 2026-09-09 17:35 — Ruled out: power save, measured inside Strux
`esp_wifi_get_ps()` reported from Strux itself: **ps=0** on every report line, across
boots. Strux does set `WIFI_PS_NONE` before `esp_wifi_start()` and it does take
effect. Power save is out for good.

Also withdrawing the CPU-clock reading from the 16:35 entry: it used
`ESP_CLK_TREE_SRC_FREQ_PRECISION_CACHED`, which returns a cached value, not the live
frequency. That measurement said nothing.

### 2026-09-09 17:45 — Ruled out: the relay (bisection step 1)
`DIAG_ENABLE_RELAY=0`, everything else on, 8 self-reboots: still bad, 1.8 %–94.3 %.
So the cache warmer pulling 131 KB after every reconnect is not the cause.

### 2026-09-09 17:55 — Ruled out: the whole upper half (bisection step 2)
Off: webserver (and its FAT mount), telemetry, UI, update, SNTP, the LED app, mDNS.
Left: console, settings, system, network, command. 8 boots: **42 %–100 % loss** —
worse, not better. The fault is in the core, not in any application or service.

### 2026-09-09 18:05 — Ruled out: CONFIG_PM_ENABLE, properly this time
Minimal Strux with PM compiled out entirely (deleted `sdkconfig.c3` so the defaults
actually took): 8 boots, **33.8 %–99.5 % loss**. Latency dropped a lot (p50 17–82 ms
vs 156–2387 ms) but loss rose. PM was adding delay, not causing loss.

### 2026-09-09 18:15 — The measurement that names the resource
`rx=160 tx=137 seqhigh=600 rxerr=0 txerr=23 txeno=12 heap=148456 minheap=82128`

- 600 sent by the PC, **160 arrived** — 73 % lost *inbound*, before any Strux code.
- Of those 160, 23 replies failed to send with **errno 12 = ENOMEM**.
- Free heap 148 KB, minimum 82 KB — so this is a **fixed pool**, not the heap.
- `STA disconnected (reason 4)` = ASSOC_EXPIRE mid-run.

Dominant failure is inbound drop with a simultaneous TX allocation failure. With
webserver and relay off, Strux holds no sockets at all — so nothing of Strux's is
holding receive buffers. Remaining differences from wifiprobe are all inside
`WiFiInterface`: the second (AP) netif, `WIFI_ALL_CHANNEL_SCAN` +
`WIFI_CONNECT_AP_BY_SIGNAL`, and `pmf_cfg.capable = true`.

### 2026-09-09 18:20 — Environment caveat: VPN active on the PC
Bas started a VPN on the measuring PC around this time. It can re-route even
LAN-bound traffic, so results in this window are suspect. The decisive comparison
gets re-run with the VPN off before anything is concluded from it.

### 2026-09-09 18:30 — Ruled out: sdkconfig for Wi-Fi and lwIP is identical
Diffed every `CONFIG_ESP_WIFI*` / `CONFIG_LWIP*` / `CONFIG_ESP_COEX*` key between the
two projects: **120 keys each, zero differences.** Driver buffers, pbuf pools,
lwIP task settings and coexistence are all off the table.

### 2026-09-09 18:40 — Ruled out: the AP netif, all-channel scan, PMF
Guarded each behind a switch and turned all three off, making Strux's Wi-Fi setup
match wifiprobe's: 8 boots, **83.7 %–98.8 % loss**. None of them.

### 2026-09-09 18:55 — ROOT CAUSE: USB Serial/JTAG as the PRIMARY console
Full sdkconfig diff turned up the real difference. Strux's C3 board overlay set
`CONFIG_ESP_CONSOLE_USB_SERIAL_JTAG=y`, which makes USB the **primary** console
(`SECONDARY_NONE`, `UART_NUM=-1`). wifiprobe used the UART primary with USB as
**secondary**.

The primary console is a full VFS driver whose write **blocks waiting for FIFO
space**; the secondary is a best-effort ROM path that drops instead of waiting. So
every log line stalls whichever task emitted it — including the Wi-Fi and lwIP
tasks, which is why the damage is indiscriminate inbound frame loss plus `ENOMEM`
on transmit.

A→B→A in the minimal control, one variable, nothing else touched:

| Config | Loss | p50 RTT | late |
|---|---|---|---|
| A UART primary | 0/2400 (0 %) | 2.7 ms | 3–6 |
| B USB **primary** | up to 5.5 % | 55–81 ms | 659–758 |
| C back to UART primary | 0/2400 (0 %) | 2.6 ms | 3–6 |

Draining the port from the host helps but does not fix it (p50 12–37 ms), so it is
the blocking write path, not merely an absent reader.

### 2026-09-09 19:05 — Fix verified in Strux
Board overlay changed to `CONFIG_ESP_CONSOLE_UART_DEFAULT=y` +
`CONFIG_ESP_CONSOLE_SECONDARY_USB_SERIAL_JTAG=y` — USB output is kept, just as
secondary. The overlay's old comment was wrong: the secondary console reaches USB
too, so nothing is lost by not claiming the primary slot.

- Minimal Strux + fix: **8/8 boots 0.0 % loss**, p50 2.7 ms.
- Full Strux, every manager on, + fix: **9/10 boots 0.0 % loss**, p50 2.7 ms.

Why wifiprobe never suffered: it logged one line per 5 s through a non-blocking
path. Strux logs on every manager init and captures stdout, so it blocked far more —
and it explains the observation that long-connected devices seem stable: once boot
logging stops, so does the stalling.

### 2026-09-09 19:10 — Residual: one boot in ten drops a burst
Boot 5 of the full-Strux run lost 195/600 (32.5 %) but with **p50 2.8 ms, p99
14 ms** — latency perfect. That is a short outage, not the console fault, and needs
its own investigation.

### 2026-09-09 19:30 — Fix holds under full concurrent load
Steady state, no reboots, everything enabled, three loads at once (UDP measurement +
WebSocket command loop + bulk HTTP off port 80 + relay-proxied fetches):

- UDP: **20/20 batches, 0.0 % loss**, `late` 5–18 per 600.
- WebSocket: **321/321 commands OK**, 53–71 ms each. Before the fix the same test
  produced 8-second timeouts and 11 failures in 30.
- Device counters: `rx=2400 tx=2400 txerr=0 txeno=0`, `ws frm/in/out/fin` all equal,
  `relay txf=0`.

Also verified the fix costs no observability: with UART primary + USB secondary,
both `ESP_LOGx` **and** `esp_rom_printf` still arrive over the USB-C port. The
overlay comment that justified the primary slot was simply wrong.

`CONFIG_PM_ENABLE` re-enabled and now harmless — p50 2.7 ms, p90 5.0 ms. The
multi-second latency previously blamed on PM was the console all along.

### 2026-09-09 19:40 — Fixed a second instance of the same class
`ConsoleManager::WriteHistory` held the log mutex across writes to `resp`, which go
to the transport on every value — so a `log list` (the frontend's Console page) held
that mutex for the length of a 40 KB network reply, while `StoreLine` takes the same
mutex from whatever task just logged, Wi-Fi and lwIP included.

Same defect as the root cause: a network-speed operation blocking a task that only
wanted to log. Now snapshots the ring bounds, then copies one line at a time and
releases between lines. A wrap mid-reply can show a newer line in a slot; a log dump
can live with that.
