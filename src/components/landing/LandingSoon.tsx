import { useEffect, useMemo, useState } from 'react'

import { ConceptPreviewBadge } from '../ui/ConceptPreviewBadge'
import { cn } from '../../lib/cn'
import { FLV_COPY } from '../../lib/flv-copy'
import {
  CANNED_STILLS,
  SHOOT_CONFIG_FIELDS,
  SHOOT_PRESETS,
  VIDEO_EXPORT_PRESETS,
  VIDEO_SCENES,
  VIDEO_SETTINGS,
  pickCannedStillGrid,
  videoStillForScene,
  type ShootPresetId,
} from '../../lib/landing-demo'

export function LandingSoon() {
  return (
    <section className="flex flex-col gap-12 border-b border-flv-line px-6 py-12 sm:px-10">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display text-xs tracking-[0.22em] text-flv-accent uppercase">
            {FLV_COPY.soonBadge}
          </p>
          <ConceptPreviewBadge />
        </div>
        <h2 className="font-display text-3xl text-flv-ink">
          {FLV_COPY.soonTitle}
        </h2>
      </div>
      <ShootDemo />
      <VideoDemo />
    </section>
  )
}

type ShootChoice = ShootPresetId | `custom-${number}`

function ShootDemo() {
  const [preset, setPreset] = useState<ShootChoice>('streetwear')
  const [customPresets, setCustomPresets] = useState<
    { id: ShootChoice; label: string }[]
  >([])
  const [config, setConfig] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      SHOOT_CONFIG_FIELDS.map((field) => [field.id, field.options[0]!]),
    ),
  )
  const [generated, setGenerated] = useState(false)
  const [selectedResult, setSelectedResult] = useState(0)
  const [seedBump, setSeedBump] = useState(0)
  const results = useMemo(
    () =>
      pickCannedStillGrid({
        seed: `${preset}-${Object.values(config).join('-')}-${seedBump}`,
        count: 4,
      }),
    [config, preset, seedBump],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-2xl text-flv-ink">
            {FLV_COPY.soonAiShoot}
          </h3>
          <p className="max-w-2xl font-body text-sm text-flv-muted">
            {FLV_COPY.soonAiShootLead}
          </p>
        </div>
        <ConceptPreviewBadge />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem_minmax(0,1fr)]">
        <div className="flv-panel flex flex-col gap-3 p-4">
          <p className="font-body text-xs tracking-[0.14em] text-flv-accent uppercase">
            1 {FLV_COPY.shootPresets}
          </p>
          <p className="font-body text-sm text-flv-muted">
            {FLV_COPY.shootPresetsLead}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[...SHOOT_PRESETS, ...customPresets].map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={preset === entry.id}
                onClick={() => {
                  setPreset(entry.id)
                  setGenerated(false)
                }}
                className={cn(
                  'relative flex min-h-20 items-end rounded-xl border p-2 font-body text-xs uppercase',
                  {
                    'border-flv-accent text-flv-accent': preset === entry.id,
                    'border-flv-line text-flv-muted': preset !== entry.id,
                  },
                )}
              >
                {preset === entry.id ? (
                  <span className="absolute top-2 right-2 text-flv-accent">
                    ✓
                  </span>
                ) : null}
                {entry.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                const nextId = `custom-${customPresets.length + 1}` as const
                const next = {
                  id: nextId,
                  label: `Custom ${customPresets.length + 1}`,
                }
                setCustomPresets((current) => [...current, next])
                setPreset(nextId)
                setGenerated(false)
              }}
              className="flex min-h-20 items-center justify-center rounded-xl border border-dashed border-flv-line font-body text-xs text-flv-muted uppercase hover:border-flv-accent hover:text-flv-accent"
            >
              + {FLV_COPY.shootCustom}
            </button>
          </div>
        </div>
        <div className="flv-panel flex flex-col gap-3 p-4">
          <p className="font-body text-xs tracking-[0.14em] text-flv-accent uppercase">
            3 {FLV_COPY.shootConfig}
          </p>
          <div className="flex flex-col gap-2">
            {SHOOT_CONFIG_FIELDS.map((field) => (
              <label
                key={field.id}
                className="flex flex-col gap-1"
              >
                <span className="font-body text-[0.65rem] tracking-[0.1em] text-flv-muted uppercase">
                  {field.label}
                </span>
                <select
                  value={config[field.id]}
                  onChange={(event) => {
                    setConfig((current) => ({
                      ...current,
                      [field.id]: event.target.value,
                    }))
                    setGenerated(false)
                  }}
                  className="min-h-10 rounded-xl border border-flv-line bg-flv-paper px-3 font-body text-sm text-flv-ink"
                >
                  {field.options.map((option) => (
                    <option
                      key={option}
                      value={option}
                    >
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setSeedBump((current) => current + 1)
              setSelectedResult(0)
              setGenerated(true)
            }}
            className="flv-cta mt-auto min-h-11 px-4 font-body text-xs tracking-[0.1em] uppercase"
          >
            {FLV_COPY.shootGenerate}
          </button>
        </div>
        <div className="flv-panel flex flex-col gap-3 p-4">
          <p className="font-body text-xs tracking-[0.14em] text-flv-accent uppercase">
            4 {FLV_COPY.shootResults}
          </p>
          <p className="font-body text-sm text-flv-muted">
            {FLV_COPY.shootResultsLead}
          </p>
          {generated ? (
            <>
              <img
                src={results[selectedResult] ?? results[0]}
                alt=""
                className="aspect-[4/5] rounded-xl object-cover"
              />
              <div className="grid grid-cols-4 gap-2">
                {results.map((src, index) => (
                  <button
                    key={`${src}-${index}`}
                    type="button"
                    aria-pressed={selectedResult === index}
                    onClick={() => {
                      setSelectedResult(index)
                    }}
                    className={cn('overflow-hidden rounded-lg border', {
                      'border-flv-accent': selectedResult === index,
                      'border-flv-line': selectedResult !== index,
                    })}
                  >
                    <img
                      src={src}
                      alt=""
                      className="aspect-square object-cover"
                    />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setGenerated(true)
              }}
              className="grid grid-cols-2 gap-2 text-left"
            >
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="aspect-[4/5] rounded-xl border border-dashed border-flv-line bg-flv-line/20"
                />
              ))}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

type DemoScene = {
  id: string
  label: string
  duration: string
  still: string
}

function VideoDemo() {
  const [scenes, setScenes] = useState<DemoScene[]>(() =>
    VIDEO_SCENES.map((scene) => ({
      id: scene.id,
      label: scene.label,
      duration: scene.duration,
      still: videoStillForScene({ sceneId: scene.id }),
    })),
  )
  const [sceneId, setSceneId] = useState(scenes[0]?.id ?? 'front')
  const [settings, setSettings] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      VIDEO_SETTINGS.map((field) => [field.id, field.options[0]!]),
    ),
  )
  const [exportId, setExportId] = useState<
    (typeof VIDEO_EXPORT_PRESETS)[number]['id']
  >(VIDEO_EXPORT_PRESETS[0]!.id)
  const [scrub, setScrub] = useState(2)
  const [generated, setGenerated] = useState(false)
  const [playing, setPlaying] = useState(false)
  const activeScene =
    scenes.find((scene) => scene.id === sceneId) ?? scenes[0]
  const preview = activeScene?.still ?? CANNED_STILLS[0]!

  useEffect(() => {
    if (!playing) {
      return
    }

    const timer = window.setInterval(() => {
      setScrub((current) => {
        const next = current >= 15 ? 0 : current + 1
        return next
      })
    }, 400)

    return () => {
      window.clearInterval(timer)
    }
  }, [playing])

  useEffect(() => {
    if (scenes.length === 0) {
      return
    }

    const span = Math.max(1, Math.floor(15 / scenes.length))
    const sceneIndex = Math.min(scenes.length - 1, Math.floor(scrub / span))
    const nextScene = scenes[sceneIndex]

    if (nextScene && nextScene.id !== sceneId) {
      setSceneId(nextScene.id)
    }
  }, [scrub, scenes, sceneId])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-2xl text-flv-ink">
            {FLV_COPY.soonAiVideo}
          </h3>
          <p className="max-w-2xl font-body text-sm text-flv-muted">
            {FLV_COPY.soonAiVideoLead}
          </p>
        </div>
        <ConceptPreviewBadge />
      </div>
      <div className="grid gap-4 xl:grid-cols-[14rem_minmax(0,1fr)_16rem]">
        <aside className="flv-panel flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="font-body text-xs tracking-[0.14em] text-flv-accent uppercase">
              {FLV_COPY.videoScenes}
            </p>
            <button
              type="button"
              onClick={() => {
                const index = scenes.length + 1
                const still =
                  CANNED_STILLS[index % CANNED_STILLS.length]!
                const next: DemoScene = {
                  id: `scene-${index}`,
                  label: `Scene ${index}`,
                  duration: '0:03',
                  still,
                }
                setScenes((current) => [...current, next])
                setSceneId(next.id)
                setScrub(Math.min(15, (index - 1) * 3))
                setGenerated(false)
              }}
              className="font-body text-[0.65rem] text-flv-muted uppercase hover:text-flv-accent"
            >
              + {FLV_COPY.videoAddScene}
            </button>
          </div>
          {scenes.map((scene, index) => (
            <button
              key={scene.id}
              type="button"
              aria-pressed={sceneId === scene.id}
              onClick={() => {
                setSceneId(scene.id)
                setScrub(Math.min(15, index * 3))
                setGenerated(false)
                setPlaying(false)
              }}
              className={cn(
                'flex items-center gap-2 rounded-xl border p-2 text-left',
                {
                  'border-flv-accent': sceneId === scene.id,
                  'border-flv-line': sceneId !== scene.id,
                },
              )}
            >
              <img
                src={scene.still}
                alt=""
                className="size-10 rounded-lg object-cover"
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-body text-xs text-flv-ink">
                  {String(index + 1).padStart(2, '0')} {scene.label}
                </span>
                <span className="font-body text-[0.65rem] text-flv-muted">
                  {scene.duration}
                </span>
              </span>
            </button>
          ))}
        </aside>
        <div className="flv-panel flex flex-col gap-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="font-display text-xl text-flv-ink">
                {FLV_COPY.videoTitle}
              </h4>
              <p className="font-body text-sm text-flv-muted">
                {FLV_COPY.videoLead}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPlaying((current) => !current)
                setGenerated(true)
              }}
              className="flv-cta min-h-10 px-4 font-body text-xs tracking-[0.1em] uppercase"
            >
              {playing ? 'Pause' : 'Play'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setPlaying((current) => !current)
              setGenerated(true)
            }}
            className="relative mx-auto aspect-[9/16] w-full max-w-xs overflow-hidden rounded-2xl border border-flv-line bg-flv-ink"
          >
            <img
              src={preview}
              alt=""
              className="size-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
              <div className="h-1 overflow-hidden rounded-full bg-white/30">
                <div
                  className="h-full rounded-full bg-flv-accent"
                  style={{ width: `${(scrub / 15) * 100}%` }}
                />
              </div>
              <p className="mt-1 font-body text-[0.65rem] text-white">
                0:{String(scrub).padStart(2, '0')} / 0:15 ·{' '}
                {settings.format ?? exportId}
              </p>
            </div>
          </button>
          <label className="flex flex-col gap-2">
            <span className="font-body text-xs tracking-[0.1em] text-flv-muted uppercase">
              Timeline
            </span>
            <input
              type="range"
              min={0}
              max={15}
              value={scrub}
              onChange={(event) => {
                const next = Number(event.target.value)
                setScrub(next)
                setPlaying(false)
                const sceneIndex = Math.min(
                  scenes.length - 1,
                  Math.floor(
                    next / Math.max(1, Math.floor(15 / Math.max(1, scenes.length))),
                  ),
                )
                const nextScene = scenes[sceneIndex]
                if (nextScene) {
                  setSceneId(nextScene.id)
                }
              }}
              className="w-full accent-[var(--color-flv-accent)]"
            />
            <div className="flex gap-2 overflow-x-auto">
              {scenes.map((scene, index) => (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => {
                    setSceneId(scene.id)
                    setScrub(Math.min(15, index * 3))
                    setPlaying(false)
                  }}
                  className={cn('shrink-0 overflow-hidden rounded-lg border', {
                    'border-flv-accent': sceneId === scene.id,
                    'border-flv-line': sceneId !== scene.id,
                  })}
                >
                  <img
                    src={scene.still}
                    alt=""
                    className="h-14 w-10 object-cover"
                  />
                </button>
              ))}
            </div>
          </label>
        </div>
        <aside className="flex flex-col gap-4">
          <div className="flv-panel flex flex-col gap-3 p-4">
            <p className="font-body text-xs tracking-[0.14em] text-flv-accent uppercase">
              {FLV_COPY.videoSettings}
            </p>
            {VIDEO_SETTINGS.map((field) => (
              <label
                key={field.id}
                className="flex flex-col gap-1"
              >
                <span className="font-body text-[0.65rem] tracking-[0.1em] text-flv-muted uppercase">
                  {field.label}
                </span>
                <select
                  value={settings[field.id]}
                  onChange={(event) => {
                    setSettings((current) => ({
                      ...current,
                      [field.id]: event.target.value,
                    }))
                  }}
                  className="min-h-10 rounded-xl border border-flv-line bg-flv-paper px-3 font-body text-sm"
                >
                  {field.options.map((option) => (
                    <option
                      key={option}
                      value={option}
                    >
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="flv-panel flex flex-col gap-3 p-4">
            <p className="font-body text-xs tracking-[0.14em] text-flv-accent uppercase">
              {FLV_COPY.videoExport}
            </p>
            <div className="flex flex-col gap-2">
              {VIDEO_EXPORT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={exportId === preset.id}
                  onClick={() => {
                    setExportId(preset.id)
                  }}
                  className={cn(
                    'min-h-10 rounded-xl border px-3 text-left font-body text-xs uppercase',
                    {
                      'border-flv-accent text-flv-accent':
                        exportId === preset.id,
                      'border-flv-line text-flv-muted': exportId !== preset.id,
                    },
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setGenerated(true)
                setPlaying(true)
              }}
              className="flv-cta min-h-11 px-4 font-body text-xs tracking-[0.1em] uppercase"
            >
              {FLV_COPY.videoGenerate}
            </button>
            {generated ? (
              <p className="font-body text-xs text-flv-muted">
                Preview ready for {exportId}. {FLV_COPY.conceptPreview} — no
                motion export yet.
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  )
}
