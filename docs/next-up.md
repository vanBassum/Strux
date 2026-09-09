# Next up

**Active work only.** Rewritten constantly, kept tiny, and an item is *removed* when it
lands or is dropped — never ticked off in place. Everything else lives in
`docs/backlog/` (work for later) or `docs/reasoning/` (why things are the way they are).
If a fact wants to survive, it does not belong in this file.

Last updated 2026-09-09.

## Now

**Device-hosted UI modules, steps 1-4 done** on `ui-modules`: the auth fix, `UiManager`
and `ui modules`, the shell contract and seam, and `ModuleHost` with the LED shipping as
the first real module. The device frontend now learns its feature UI from the firmware —
there is no string "led" left in `frontend/src`. Steps 5 and 6 are the relay's half:
`DeviceCommand` on the hub, the cache warmer asking `ui modules` instead of scraping, and
the relay shell consuming the same bundles.
→ [`backlog/2026-09-08-device-hosted-ui-modules.md`](backlog/2026-09-08-device-hosted-ui-modules.md)

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
