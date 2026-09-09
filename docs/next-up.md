# Next up

**Active work only.** Rewritten constantly, kept tiny, and an item is *removed* when it
lands or is dropped — never ticked off in place. Everything else lives in
`docs/backlog/` (work for later) or `docs/reasoning/` (why things are the way they are).
If a fact wants to survive, it does not belong in this file.

Last updated 2026-09-09.

## Now

**Device-hosted UI modules are done**, both halves — the device shell on `ui-modules`
in this repo, the relay's on `ui-modules` in
[strux-relay](https://github.com/vanBassum/strux-relay). Firmware declares its UI with
`ui modules` and ships the bundle that draws it; both shells compose the same bundle over
different transports; a home screen is contributed cards and nothing else. **Both
branches need merging, and neither has been used by anyone but me** — a second board on
older firmware is the mixed-fleet case still worth exercising on the bench.
→ [`reasoning/…the-manifest-is-a-command…`](reasoning/2026-09-09-21h50-the-manifest-is-a-command-so-a-shell-can-be-complete-before-any-module-loads.md),
[`…a-home-screen-is-the-product…`](reasoning/2026-09-09-22h00-a-home-screen-is-the-product-not-a-readout-of-the-board.md)

**Putting the relay in production** — live at `https://strux.vanbassum.com`, behind
Traefik and Authentik. A device must be approved and must present its own token, or the
upgrade is refused with a 403, and pairing is one click in the dashboard. Step 9 —
secrets out of `settings list` — is the last one before the plan calls it
production-ready.
→ [`backlog/2026-08-05-relay-in-production.md`](backlog/2026-08-05-relay-in-production.md)

**Telemetry works end to end** — a manager records a point, the relay writes it to
InfluxDB, and it queries back tagged by device. No buffering yet: a point taken while
the relay is down is dropped. That and the other open ends are listed in
→ [`backlog/2026-08-05-telemetry.md`](backlog/2026-08-05-telemetry.md)
