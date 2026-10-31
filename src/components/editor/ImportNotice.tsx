import { useEditorStore } from '../../lib/editor-store'
import { importNoticeLines } from '../../lib/import-notice'
import { chromeMutedClass, chromeTextClass } from '../../lib/studio-chrome'

/** Tells the person what converting an older design changed (F06 #141). */
export function ImportNotice() {
  const notes = useEditorStore((state) => state.importNotes)

  if (notes.length === 0) {
    return null
  }

  const lines = importNoticeLines({ notes })

  return (
    <div role="status" className="flex flex-col gap-1 border border-flv-line p-2">
      <p className={chromeTextClass()}>This design was opened from an older version. What changed:</p>
      <ul className={`list-disc pl-4 ${chromeMutedClass()}`}>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => useEditorStore.setState({ importNotes: [] })}
        className={`self-start min-h-9 underline-offset-4 hover:underline ${chromeTextClass()}`}
      >
        Dismiss
      </button>
    </div>
  )
}
