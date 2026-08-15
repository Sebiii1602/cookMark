import { useId, type ReactNode } from 'react'

/**
 * Beschrifteter Datei-Knopf.
 *
 * Ein nacktes `<input type="file">` rendert je nach Browser als grauer Kasten
 * mit „Datei auswählen“ oder — mit `file:`-Klassen gestylt — als Knopf ganz
 * ohne lesbaren Text. Deshalb: Input verstecken, Label als Knopf.
 */
export function FilePick({
  onPick,
  disabled = false,
  tone = 'herb',
  children,
}: {
  onPick: (file: File) => void
  disabled?: boolean
  tone?: 'herb' | 'clay'
  children: ReactNode
}) {
  const id = useId()
  const styles =
    tone === 'clay'
      ? 'border-clay bg-clay text-white hover:bg-clay-deep'
      : 'border-line bg-card text-ink hover:border-herb'

  return (
    <>
      <input
        id={id}
        type="file"
        accept="image/*"
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPick(file)
          // Zurücksetzen, damit dasselbe Bild direkt noch einmal gewählt werden kann
          e.target.value = ''
        }}
      />
      <label
        htmlFor={id}
        className={`inline-flex cursor-pointer items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${styles} ${
          disabled ? 'pointer-events-none opacity-60' : ''
        }`}
      >
        {children}
      </label>
    </>
  )
}
