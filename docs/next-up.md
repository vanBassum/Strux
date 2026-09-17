# Next up

**Active work only.** Rewritten constantly, kept tiny, and an item is *removed* when it
lands or is dropped — never ticked off in place. Everything else lives in
GitHub issues (work for later) or `docs/reasoning/` (why things are the way they are).
If a fact wants to survive, it does not belong in this file.

Last updated 2026-09-17.

## Now

**The frontend lives in the app image, and the `www` partition is gone.** `www/` is
packed into one blob (`main/strux/WebAssets/`) and linked in with `EMBED_FILES`; the FAT
mount, the `fatfs`/`wear_levelling` components and the per-file `.gz` step are all
deleted. Both OTA slots grew to 0x1F0000 and fill the 4 MB flash exactly.
→ [`reasoning/…the-ui-was-a-second-deliverable…`](reasoning/2026-09-17-10h05-the-ui-was-a-second-deliverable-and-a-partition-is-what-made-it-one.md)

**Outstanding: nothing has been driven on a device since the SPA revert, and now the
partition table has changed too.** The app builds (0x1312F0, 38% of a slot free, blob
143 KB in three files) and `tsc -b` is clean, but the page has not been opened over the
LAN or through the relay. The partition change means a **full flash**, not an OTA —
`idf.py -p <PORT> flash`, which also rewrites the table. Worth checking on the bench:
the sidebar survives at every width, the LED toggle round-trips, `partition status`
renders on the firmware page and no longer lists `www`, a cold load fetches all three
assets without a reset, and the relay serves the same page through `web read`.

**Outstanding: the bench C3 needs its WiFi back.** Reflashing it to 0.0.7 left NVS
without a network, so it came up on `Strux-AP-9EA851` and the relay is disabled.
Reprovision before using it to verify anything above. The C3 also needs its own
`set-target` run before it will pick up the new table.
