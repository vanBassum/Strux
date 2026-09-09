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

**Everything a device shows is now a module.** Neither shell contributes anything to a
device's navigation: Console, Settings and Firmware are framework modules registered by
the managers that own their commands, the LED is the app's, and the first page the
manifest declares is the landing page. Both shells can be read end to end without
finding the name of a device command. The contract is at `hostApi` 2 — it grew `upload`,
`download` and `logs`, because three of the four pages needed something `request`
cannot say.
→ [`reasoning/…a-shell-that-owns-no-page…`](reasoning/2026-09-09-23h10-a-shell-that-owns-no-page-is-the-only-shell-that-knows-no-commands.md)

**Known gaps**, both small and both written down where they can be acted on: an upload
does not surface the device's own flash position (only the browser's upload progress),
and the framework modules appear in the nav as Firmware, Settings, Console because
`UiManager` head-inserts and they register in `Init()` order. The LED being first is
what matters and is correct.

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
