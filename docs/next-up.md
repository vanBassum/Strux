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

**What is left, and it is not small.** The relay shell gives a device an Overview and
nothing else — **no Console, Settings or Firmware page**, which the device's own shell
has had all along. Those are *not* modules and must not become modules: they are
framework features every Strux device has, and `settings list` already describes itself,
so they belong in the shell (see the rule in CLAUDE.md — a declaration stays a
declaration). Three pages, three different costs:

- **Settings** — `settings list` / `set` / `save`, all single round trips. Nothing new needed.
- **Console** — `log list` works now, polled. A live tail does not: session 0 broadcasts
  fan out to *browser-pipe* clients, not to hub clients, so it needs a per-device hub
  group in `DeviceConnection`.
- **Firmware** — the real work. `CommandAsync` sends one envelope and reads one reply;
  an upload is a *streamed* session (envelope chunk, then many body chunks), so the relay
  needs a streaming sibling to it.

Until then a device's own page is one click away via *Open device UI*, so nothing is
unreachable. **Neither branch is merged**, and the relay's CI only builds `main` and
tags — so nothing of this is on `strux.vanbassum.com` yet.

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
