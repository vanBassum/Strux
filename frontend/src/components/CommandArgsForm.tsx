import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { CommandArgDesc, CommandDesc } from "@/lib/backend"

/**
 * A command's arguments as controls, generated from what the device declared.
 *
 * Nothing here knows a command. The device says a value is a `bool` and gets a
 * three-state toggle; it says `string` with a `maxLength` and gets a bounded text
 * box. If a future firmware adds a type, the fallback below is a text box and the
 * device still does the validating — which is the arrangement that lets this page
 * survive commands it has never heard of.
 *
 * Values are held as TEXT for every type, and converted once when the envelope is
 * built. That is deliberate: a half-typed number is not a number, and a form that
 * insists on parsing as you type either rejects "-" or invents a value nobody
 * entered. The device is the authority on whether "0x1f" is a uint32 anyway, so
 * the console's job is to pass on what was typed, not to pre-empt the answer.
 */

/** Empty means "not supplied", for every type and both presences. A required
 *  argument left empty is therefore left OUT, and the device answers `missing
 *  required argument` — which is the device validating its own declaration, and is
 *  a better answer than anything this file could invent. */
export function initialValues(command: CommandDesc): Record<string, string> {
  const values: Record<string, string> = {}
  // A required bool has no empty state to start in: the caller must send one of
  // the two, so it starts at the one that does nothing.
  for (const arg of command.arguments)
    values[arg.name] = arg.type === "bool" && arg.required ? "false" : ""
  return values
}

/** The envelope, from the declarations and what was typed into them.
 *
 *  An absent value is left OUT rather than sent as null or "", because absent is
 *  a distinct thing on the wire — `settings set` with no `value` clears a setting,
 *  and `led set` with no `enabled` only reports. */
export function buildEnvelope(
  command: CommandDesc,
  values: Record<string, string>,
): Record<string, unknown> {
  const envelope: Record<string, unknown> = { type: command.name }

  for (const arg of command.arguments) {
    const raw = (values[arg.name] ?? "").trim()

    if (arg.type === "bool") {
      if (raw === "") continue
      envelope[arg.name] = raw === "true"
      continue
    }

    if (raw === "") continue

    if (arg.type === "string") {
      envelope[arg.name] = raw
      continue
    }

    // Numbers go out as numbers when they read as one, and as the typed text
    // when they do not — so "12abc" reaches the device and comes back as
    // `malformed number: offset` instead of being swallowed here.
    const n = Number(raw)
    envelope[arg.name] = Number.isFinite(n) && raw !== "" ? n : raw
  }

  return envelope
}

export function CommandArgsForm({
  command,
  values,
  onChange,
  disabled,
}: {
  command: CommandDesc
  values: Record<string, string>
  onChange: (name: string, value: string) => void
  disabled?: boolean
}) {
  if (command.arguments.length === 0)
    return <p className="text-sm text-muted-foreground">This command takes no arguments.</p>

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {command.arguments.map((arg) => (
        <ArgControl
          key={arg.name}
          arg={arg}
          value={values[arg.name] ?? ""}
          onChange={(v) => onChange(arg.name, v)}
          disabled={disabled}
        />
      ))}
    </div>
  )
}

function ArgControl({
  arg,
  value,
  onChange,
  disabled,
}: {
  arg: CommandArgDesc
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const id = `arg-${arg.name}`

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <Label htmlFor={id} className="font-mono text-sm">
          {arg.name}
        </Label>
        <span className="text-xs text-muted-foreground">{arg.type}</span>
        {arg.required ? (
          <span className="text-xs font-medium text-destructive">required</span>
        ) : (
          <span className="text-xs text-muted-foreground">optional</span>
        )}
        {arg.maxLength !== undefined && (
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {value.length}/{arg.maxLength}
          </span>
        )}
      </div>

      {arg.type === "bool" ? (
        <BoolControl
          id={id}
          value={value}
          required={arg.required}
          onChange={onChange}
          disabled={disabled}
        />
      ) : (
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          className="font-mono"
          // A declared limit is enforced where it is cheap to enforce, so a value
          // the device would refuse cannot be typed in the first place.
          maxLength={arg.type === "string" ? arg.maxLength : undefined}
          inputMode={arg.type === "float" ? "decimal" : arg.type === "string" ? "text" : "numeric"}
          placeholder={arg.required ? "" : "omitted"}
        />
      )}

      {/* Absent rather than empty when the device said nothing about it — the
          registry distinguishes the two, so this does as well. */}
      {arg.description ? (
        <p className="text-xs leading-snug text-muted-foreground">{arg.description}</p>
      ) : (
        <p className="text-xs leading-snug text-muted-foreground italic">
          No description declared.
        </p>
      )}
    </div>
  )
}

/**
 * A bool, with the third state the wire has and a checkbox does not.
 *
 * An optional bool is three answers — true, false, and nothing — and `led set`
 * means something different for each: light it, keep it dark, or just report.
 * A switch can only say two of those, so this says all three.
 */
function BoolControl({
  id,
  value,
  required,
  onChange,
  disabled,
}: {
  id: string
  value: string
  required: boolean
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const options = required
    ? [
        { value: "false", label: "false" },
        { value: "true", label: "true" },
      ]
    : [
        { value: "", label: "omit" },
        { value: "false", label: "false" },
        { value: "true", label: "true" },
      ]

  return (
    <div id={id} className="inline-flex w-fit gap-1 rounded-md border p-0.5">
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={value === option.value ? "default" : "ghost"}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className="h-7 px-3 font-mono text-xs"
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}
