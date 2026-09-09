import type { ReactNode } from "react"

import { useModuleCards } from "@/shell/ModuleHost"
import { useManifest } from "@/shell/ModuleHost"

/**
 * The home screen, and it is the PRODUCT — nothing else.
 *
 * Every card here is contributed by firmware. The shell ships none of its own, and
 * that is the point rather than an omission: this file is in a template, so anything
 * it drew would appear on every product built from it whether or not that product
 * wanted it. What the device does is what the device says it does.
 *
 * It used to open with a Device Info card. That moved behind the sidebar's footer
 * (see DeviceInfoDialog): a chip name and a heap figure are read once when something
 * is wrong, and leading with them pushed the actual feature below the fold.
 *
 * On a device with no modules this page is empty, and it says so plainly instead of
 * inventing something to show. That is the template's own default state — a fresh
 * Strux fork has no features yet — and an honest blank is a better prompt than a
 * card of numbers.
 */
export default function HomePage() {
  const cards = useModuleCards()
  const { status } = useManifest()

  if (cards.length === 0)
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-xl border border-dashed p-8 text-center">
          <h1 className="mb-2 text-lg font-semibold">Nothing on the home screen yet</h1>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            {status === "loading"
              ? "Asking the device what it can show…"
              : status === "unsupported"
                ? "This device's UI needs a newer page than this one."
                : "This firmware contributes no home-screen cards. A manager registers " +
                  "a UiModule to put its feature here — see LedManager for the worked " +
                  "example. Settings, Console and Firmware work regardless."}
          </p>
        </div>
      </div>
    )

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {cards.map((card) => (
        <div key={`${card.moduleId}/${card.id}`}>
          {card.render ? (
            (card.render() as ReactNode)
          ) : card.failure ? (
            <div className="rounded-xl border bg-card p-6 text-sm text-card-foreground shadow-sm">
              <span className="font-mono">{card.moduleId}</span> could not be loaded:{" "}
              {card.failure}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
