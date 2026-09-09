// The module's own switch.
//
// It does not import the shell's shadcn `Switch`, and that is the contract rather than
// an oversight: a module ships its own primitives. The device shell uses radix-ui and
// the relay shell uses @base-ui/react, so a module reaching for either would run on
// exactly one of them. A native checkbox styled with the shell's design tokens runs on
// both and costs nothing.
//
// A real <input type="checkbox"> rather than a div with a click handler, so keyboard
// focus, space-to-toggle, and screen readers all work without re-implementing them.

interface ToggleProps {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
}

export function Toggle({ checked, onChange, disabled, label }: ToggleProps) {
  return (
    <label
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent transition-colors ${
        checked ? "bg-primary" : "bg-input"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        className="peer absolute inset-0 h-full w-full cursor-inherit appearance-none rounded-full opacity-0"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none block size-5 rounded-full bg-background shadow-sm transition-transform peer-focus-visible:ring-2 peer-focus-visible:ring-ring ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </label>
  )
}
