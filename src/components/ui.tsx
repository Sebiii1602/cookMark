import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-card p-4 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 text-xs font-medium uppercase tracking-wider text-faint">{children}</div>
  )
}

export function PageTitle({ overline, title }: { overline?: string; title: string }) {
  return (
    <header className="mb-4">
      {overline && <div className="text-sm text-soft">{overline}</div>}
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
    </header>
  )
}

export function Wordmark({ className = 'text-lg' }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-tight ${className}`}>
      cook<span className="text-herb-deep">Mark</span>
    </span>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  full?: boolean
}

const BUTTON_STYLES: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-herb text-white hover:bg-herb-deep disabled:bg-faint',
  secondary: 'border border-line bg-card text-ink hover:border-herb',
  ghost: 'text-soft hover:text-ink',
  danger: 'border border-line bg-card text-clay-deep hover:border-clay',
}

export function Button({ variant = 'primary', full = false, className = '', ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        BUTTON_STYLES[variant]
      } ${full ? 'w-full' : ''} ${className}`}
    />
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-xl border border-line bg-card px-3 py-2.5 text-ink outline-none placeholder:text-faint focus:border-herb'

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-xs text-sm text-soft">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

type ChipTone = 'neutral' | 'herb' | 'clay' | 'guess'

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: 'border-line bg-card text-soft',
  herb: 'border-transparent bg-herb-soft text-herb-deep',
  clay: 'border-transparent bg-clay-soft text-clay-deep',
  guess: 'border-transparent bg-guess-soft text-guess-deep',
}

export function Chip({
  children,
  tone = 'neutral',
  struck = false,
  className = '',
}: {
  children: ReactNode
  tone?: ChipTone
  /** Widerlegter KI-Tag: bleibt stehen, aber durchgestrichen — das ist die Information. */
  struck?: boolean
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
        CHIP_TONES[tone]
      } ${struck ? 'line-through opacity-60' : ''} ${className}`}
    >
      {children}
    </span>
  )
}

/** Vollflächiges Sheet von unten — für Import, Kochlog, Formulare. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        aria-label="Schließen"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        type="button"
      />
      <div className="relative flex max-h-[90vh] w-full max-w-md flex-col rounded-t-3xl bg-paper shadow-xl sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            aria-label="Schließen"
            className="rounded-lg px-2 py-1 text-soft hover:text-ink"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </div>
        <div
          className="grow overflow-y-auto px-5 py-4"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
