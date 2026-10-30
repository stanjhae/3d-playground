import { cn } from '../../lib/cn'
import {
  chromeMutedClass,
  chromeTextClass,
  railFrameClass,
} from '../../lib/studio-chrome'
import { studioKeyList } from '../../lib/studio-keys'

/** The studio's keyboard alternatives (#163), folded away until asked for. */
export function KeyboardHelp() {
  return (
    <details className={cn(railFrameClass(), 'gap-2')}>
      <summary
        className={cn(
          'flex min-h-11 cursor-pointer items-center text-flv-muted hover:text-flv-accent',
          chromeTextClass(),
        )}
      >
        Keyboard
      </summary>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {studioKeyList().map((entry) => (
          <div key={entry.keys} className="contents">
            <dt className="font-body text-xs text-flv-ink">
              <kbd className="font-body">{entry.keys}</kbd>
            </dt>
            <dd className={chromeMutedClass()}>{entry.does}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
