# Next up

**Active work only.** Rewritten constantly, kept tiny, and an item is *removed* when it
lands or is dropped — never ticked off in place. Everything else lives in
`docs/backlog/` (work for later) or `docs/reasoning/` (why things are the way they are).
If a fact wants to survive, it does not belong in this file.

Last updated 2026-09-09.

## Now

**Device-hosted UI modules work end to end** — device shell on `ui-modules` here, the
relay's half on `ui-modules` in [strux-relay](https://github.com/vanBassum/strux-relay).
Firmware declares its UI with `ui modules` and ships the bundle; both shells compose the
same bundle over different transports; a home screen is contributed cards and nothing
else. Proven on the bench with two boards, one of them older firmware that ships no
modules at all.

**The relay shell now gives a device Console, Settings and Firmware too**, beside the
Overview that renders its contributed cards. Not modules, deliberately: they are
framework features every Strux device has and each already describes itself, so the
pages are generated from declarations. The Firmware upload needed the one thing a
command cannot express — writing an image is a session, not one envelope and one reply
— so the relay grew a streaming path and an HTTP POST route to feed it.

Two known gaps, both named in the relay's README: the Console is **polled**, because
session-0 broadcasts fan out to browser pipes rather than hub clients and a live tail
needs a per-device hub group; and the device's own flash position is not surfaced
during an upload, only the browser's upload progress.

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
