import { useEditorStore } from '../../lib/editor-store'
import type { CreateStepId } from '../../lib/create-steps'

/** What this step is for, in a line, as the mockups open each screen. */
const INTROS: Record<CreateStepId, { title: string; lead: string }> = {
  select: {
    title: 'Choose your garment',
    lead: 'Pick a garment. Its front, back and sleeves are yours to design.',
  },
  color: {
    title: 'Make it yours',
    lead: 'Pick a base colour and pattern. This step is optional, and you can change it anytime.',
  },
  design: {
    title: 'Design every side',
    lead: 'Draw, add words and graphics. Every change shows on the garment straight away.',
  },
  share: {
    title: 'Preview and publish',
    lead: 'Turn the garment to check every side. Publishing shares one saved version by link.',
  },
}

export function StepIntro() {
  const step = useEditorStore((state) => state.createStep)
  const intro = INTROS[step]

  return (
    <header className="flex flex-col gap-1 px-1 pt-1 pb-1">
      <h1 className="font-display text-lg leading-none uppercase lg:text-2xl">{intro.title}</h1>
      {/* On a phone the lead folds away, leaving the room to the garment. */}
      <p className="hidden font-body text-sm text-flv-muted lg:block">{intro.lead}</p>
      <details className="font-body text-sm text-flv-muted lg:hidden">
        <summary className="min-h-9 cursor-pointer py-1">What to do here</summary>
        <p>{intro.lead}</p>
      </details>
    </header>
  )
}
