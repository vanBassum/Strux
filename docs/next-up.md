# Next up

**Active work only.** Rewritten constantly, kept tiny, and an item is *removed* when it
lands or is dropped — never ticked off in place. Everything else lives in
GitHub issues (work for later) or `docs/reasoning/` (why things are the way they are).
If a fact wants to survive, it does not belong in this file.

Last updated 2026-09-15.

## Now

**The frontend is one SPA again, and the module mechanism is gone.** `UiManager`,
`UiModule`, the four `UiModule` declarations, `frontend/modules/`, `shell-contract/` and
`src/shell/` were all deleted; the pages are back in `frontend/src/pages/` with the LED
demo as `HomePage`. A relay shell serves a Strux device's page whole, which is the
fallback it already had. Nine framework managers now, not ten.
→ [`reasoning/…the-seam-was-the-product…`](reasoning/2026-09-15-12h30-a-mechanism-with-no-second-consumer-is-a-seam-the-template-pays-for.md)

**Outstanding: nothing has been driven on a device since the revert.** Both halves build
(ESP32 app 0x116940, www 143 KB in three files) and `tsc -b` is clean, but the page has
not been opened over the LAN or through the relay. Worth checking on the bench: the
sidebar survives at every width, the LED toggle round-trips, `partition status` renders
on the firmware page, and a cold load fetches all three assets without a reset.

**Outstanding: the bench C3 needs its WiFi back.** Reflashing it to 0.0.7 left NVS
without a network, so it came up on `Strux-AP-9EA851` and the relay is disabled.
Reprovision before using it to verify anything above.
