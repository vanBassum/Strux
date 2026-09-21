# Next up

**Active work only.** Rewritten constantly, kept tiny, and an item is *removed* when it
lands or is dropped — never ticked off in place. Everything else lives in
GitHub issues (work for later) or `docs/reasoning/` (why things are the way they are).
If a fact wants to survive, it does not belong in this file.

Last updated 2026-09-21.

## Now

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
