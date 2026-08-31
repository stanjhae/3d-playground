import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { FabricPanel } from '../components/editor/FabricPanel'
import { ModeToggle } from '../components/editor/ModeToggle'
import {
  PublishBar,
  PublishThumbnailSync,
} from '../components/editor/PublishBar'
import { AtelierScene } from '../components/scene/AtelierScene'
import { useEditorStore } from '../lib/editor-store'

export const Route = createFileRoute('/')({
  component: AtelierHome,
})

function AtelierHome() {
  const navigate = useNavigate()
  const mode = useEditorStore((state) => state.mode)

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-16">
      <p className="font-display text-xs tracking-[0.32em] text-brass uppercase">
        Fashion Leader Vote
      </p>
      <h1 className="max-w-xl font-display text-5xl leading-tight text-ivory">
        Design a look. Publish it. Name a Leader.
      </h1>
      <p className="max-w-lg text-base leading-relaxed text-ivory-muted">
        The atelier opens on a garment, not a campus tour. Click a panel, then
        a cloth name. Walk mode stays optional.
      </p>
      <ModeToggle mode={mode} />
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="h-[min(72vh,44rem)] overflow-hidden border border-atelier-line bg-atelier-raised">
          <AtelierScene>
            <PublishThumbnailSync />
          </AtelierScene>
        </section>
        <FabricPanel />
      </section>
      <PublishBar
        onPublish={({ design }) => {
          useEditorStore.getState().publishLook({ design })
          void navigate({ to: '/vote' })
        }}
      />
    </section>
  )
}
