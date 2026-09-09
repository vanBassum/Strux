// The primitives a module draws with.
//
// ── Why a module cannot use the shell's components ───────────────────────────
// The contract says a module ships its own primitives, and that is not tidiness: the
// device shell is built on radix-ui and the relay shell on @base-ui/react. A module
// importing either would run on exactly one of the two shells, and the whole point of
// a module is that the same bundle runs on both. So these are plain elements with
// Tailwind classes over the shell's design tokens — no component library at all,
// which is the only thing guaranteed to work in both hosts.
//
// ── Why they are shared between modules rather than per module ───────────────
// The LED module hand-rolled a toggle, which was right when there was one module. At
// four, four hand-rolled buttons is four things to keep looking the same. This folder
// is compiled INTO each bundle rather than shared at runtime — a few KB per module,
// against a runtime shared chunk that would have to be published by a shell, and
// neither shell can publish primitives it does not own.
//
// Deliberately small. Every addition here is bytes in every module bundle and so in
// the flash partition; a module that needs something exotic should draw it itself.

import type { ReactNode } from "react"
import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
} from "react"

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ")
}

// ── Button ───────────────────────────────────────────────────────────────────

type ButtonVariant = "default" | "outline" | "ghost" | "destructive"
type ButtonSize = "sm" | "default" | "icon"

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  // EVERY variant names its own border colour, and the base names none. That is not
  // style, it is the only order-independent way to write this. Two border-colour
  // utilities on one element tie on specificity, so the winner is whichever Tailwind
  // emitted LAST — and it emits `.border-border` BEFORE `.border-transparent`, so a
  // base of `border-transparent` cannot be overridden by a variant at all. That is
  // what made every outline button here a transparent border on a transparent
  // background: the right box with no visible control, on Refresh, Upload, Download,
  // Revert, Reboot, Scan and Clear alike. One colour utility per button, no tie, no
  // dependence on emission order.
  default: "border-transparent bg-primary text-primary-foreground hover:opacity-90",
  outline: "border-border bg-background hover:bg-muted",
  ghost: "border-transparent bg-transparent hover:bg-muted",
  destructive: "border-transparent bg-destructive text-white hover:opacity-90",
}

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-7 gap-1 px-2.5 text-xs",
  default: "h-8 gap-1.5 px-3 text-sm",
  icon: "size-8",
}

export function Button({
  variant = "default",
  size = "default",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-md border font-medium whitespace-nowrap transition-colors",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className,
      )}
      {...props}
    />
  )
}

// ── Input ────────────────────────────────────────────────────────────────────

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "border-input bg-background h-8 w-full rounded-md border px-2.5 text-sm",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

// ── Switch ───────────────────────────────────────────────────────────────────
// A real <input type="checkbox"> rather than a div with a click handler, so keyboard
// focus, space-to-toggle and screen readers all work without re-implementing them.

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
}) {
  return (
    <label
      className={cx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent transition-colors",
        checked ? "bg-primary" : "bg-input",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      <input
        type="checkbox"
        className="peer absolute inset-0 h-full w-full cursor-inherit appearance-none rounded-full opacity-0"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span
        aria-hidden="true"
        className={cx(
          "peer-focus-visible:ring-ring pointer-events-none block size-5 rounded-full bg-white shadow-sm transition-transform peer-focus-visible:ring-2",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </label>
  )
}

// ── Panel ────────────────────────────────────────────────────────────────────

export function Panel({
  title,
  actions,
  className,
  children,
}: {
  title?: ReactNode
  actions?: ReactNode
  className?: string
  children?: ReactNode
}) {
  return (
    <div
      className={cx(
        "bg-card text-card-foreground rounded-xl border border-border p-4 shadow-sm",
        className,
      )}
    >
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {typeof title === "string" ? (
            <h2 className="text-sm font-medium">{title}</h2>
          ) : (
            title
          )}
          {actions}
        </div>
      )}
      {children}
    </div>
  )
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-mono">{value}</span>
    </div>
  )
}

// ── Modal ────────────────────────────────────────────────────────────────────
// The native <dialog>, which gives the top layer, the backdrop, focus trapping and
// Escape for free. A shell's own dialog component is off limits (see the note at the
// top), and re-implementing a focus trap is exactly the sort of thing that ends up
// subtly wrong.

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children?: ReactNode
  footer?: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement | null>(null)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    <dialog
      ref={dialog}
      // `cancel` is Escape. Without handling it the dialog closes but the state that
      // opened it does not change, so it cannot be reopened.
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClose={onClose}
      className="bg-card text-card-foreground m-auto w-[min(28rem,92vw)] rounded-xl border border-border p-5 shadow-lg backdrop:bg-black/50"
    >
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      <div className="text-sm">{children}</div>
      {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
    </dialog>
  )
}
