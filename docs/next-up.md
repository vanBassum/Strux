# Next up

**Active work only.** Rewritten constantly, kept tiny, and an item is *removed* when it
lands or is dropped — never ticked off in place. Everything else lives in
GitHub issues (work for later) or `docs/reasoning/` (why things are the way they are).
If a fact wants to survive, it does not belong in this file.

Last updated 2026-09-21.

## Now

**The Connection + Channel protocol has replaced `Session`.** Plan and phases are
[issue #38](https://github.com/vanBassum/Strux/issues/38). Phases 0-3 are in.
**Phase 3 broke the wire**, deliberately.

The device and the browser are peers: a CONTROL handshake (u8 version, u64 nonce) the
moment the transport is up, nonce-decided id halves, OPEN and RESET, no reserved ids at
all. Logs and telemetry are channels the device opens and names; hello is gone and
identity is `system info`. Verified on the bench devkit: handshake settles with disjoint
halves, a command is an ordinary OPEN|FINAL channel, the device opens `log stream` on
0x8000 and records arrive, a frame without OPEN for an unknown id is dropped, a second
OPEN during an upload is RESET `busy`, an in-band RESET cancel leaves the connection
serving, and a peer claiming protocol 99 is refused.

**Blocking: the relay is written and builds but is NOT deployed.** Until it is, a device
on this firmware connects, sends CONTROL, gets no answer and sits in HANDSHAKE -- seen on
the bench as `channel 32768 before READY - dropped`. Harmless, and the relay path does
not work. The relay keeps a legacy path chosen by a device's first frame, so Lablr and
Comble need no flag day. Release process: tag `v*`, then `make up stack=strux-relay`.

**Also unverified:** the relay path end to end, and the browser UI in an actual browser
(the wire is driven by a script, not by the bundle).
→ [`reasoning/...three-reserved-ids...`](reasoning/2026-09-21-11h30-three-reserved-ids-are-one-missing-capability.md),
[`reasoning/...head-of-line-blocking...`](reasoning/2026-09-21-11h40-head-of-line-blocking-is-an-execution-choice-and-the-receiver-must-demultiplex-anyway.md),
[`reasoning/...not-a-flag-day...`](reasoning/2026-09-21-11h50-a-protocol-break-is-not-a-flag-day-when-the-first-frame-dates-the-peer.md),
[`reasoning/...one-callback-slot...`](reasoning/2026-09-21-12h40-a-fan-out-is-what-one-callback-slot-costs.md)

**A device describes itself, and an agent can drive it through the relay.** Commands
carry a one-line description and describe each argument; `help describe` returns the
whole registry in one reply and `system describe` returns the product's own description
and instructions (`main/app/DeviceDoc.h`). The relay exposes three generic tools at
`/mcp` — `devices`, `describe`, `execute` — gated by a per-device switch on its
dashboard, and knows nothing about any device. Live at `https://strux.vanbassum.com/mcp`
(relay v0.6.1), routed past Authentik: bearer tokens are managed on the relay's own MCP
page, and a client that cannot carry one -- ChatGPT -- gets its own through the relay's
OAuth 2.1 flow, whose consent page is the only step still behind Authentik. A real board
answered `system ping` through it from outside.
→ [`reasoning/…a-device-that-describes-itself…`](reasoning/2026-09-18-10h50-a-device-that-describes-itself-needs-no-tool-of-its-own.md),
[`reasoning/…forward-auth-is-for-people…`](reasoning/2026-09-18-11h15-forward-auth-is-for-people-so-a-machine-endpoint-has-to-carry-its-own-credential.md),
[`reasoning/…the-proxy-already-knows-who-the-human-is…`](reasoning/2026-09-18-12h20-the-proxy-already-knows-who-the-human-is-so-the-relay-can-run-oauth-without-users.md)

**The frontend lives in the app image, and the `www` partition is gone.** `www/` is
packed into one blob (`main/strux/WebAssets/`) and linked in with `EMBED_FILES`; the FAT
mount, the `fatfs`/`wear_levelling` components and the per-file `.gz` step are all
deleted. Both OTA slots grew to 0x1F0000 and fill the 4 MB flash exactly.
→ [`reasoning/…the-ui-was-a-second-deliverable…`](reasoning/2026-09-17-10h05-the-ui-was-a-second-deliverable-and-a-partition-is-what-made-it-one.md)

**Outstanding: two bench checks the wire cannot answer.** A devkit on COM3 is flashed
and driven (0.0.8 at 192.168.50.202): the new table boots, `partition status`/`list`
carry no `www` and both slots read 0x1F0000, the LED toggle round-trips, all three
assets serve over HTTP and `web read`, and the console backfill and the session-0 live
feed both work. What is left needs eyes and a second machine:

- **A browser at every width** — the sidebar surviving, and the redesigned Settings
  page (two-column card grid, category chip row) laying out as intended.
- **The relay path** — `relay.url` on the bench devkit points at
  `ws://192.168.50.109:8080/device`, which refuses the connection, so the relay has
  never served this build. (A *second* C3, `esp32-50787d83db6c`, has been driven through
  a local relay end to end for the MCP work, so the path itself is proven.)

**Outstanding: `system info` reports `idf` as `-128-NOTFOUND`.** Both the boot banner
and the hello field carry it, so the relay records garbage for an optional field the
`HelloField` table declares. Found on the bench 2026-09-17; wants an issue.

**Outstanding: the bench C3 needs its WiFi back.** Reflashing it to 0.0.7 left NVS
without a network, so it came up on `Strux-AP-9EA851` and the relay is disabled.
Reprovision before using it to verify anything above. The C3 also needs its own
`set-target` run before it will pick up the new table.
