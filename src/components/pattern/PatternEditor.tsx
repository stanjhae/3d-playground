import { Suspense, lazy, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'

import { AI_ASSIST } from '../../lib/ai-assist'
import { cn } from '../../lib/cn'
import { getCanonicalDocument, useEditorStore } from '../../lib/editor-store'
import {
  type SheetPiece,
  checkEdit,
  layoutSheet,
  movePoint,
  piecePath,
  quickEdit,
  quickEditsFor,
  toSheet,
} from '../../lib/pattern/editor-model'
import type { CanonicalPattern } from '../../lib/pattern/pattern-document'
import { patternTemplateFor } from '../../lib/pattern/templates'
import { usePatternDrape } from '../../lib/pattern-drape-status'
import { chromeKickerClass, chromeMutedClass, chromeTextClass, railFrameClass } from '../../lib/studio-chrome'

const AiAssist = lazy(() => import('./AiAssist'))

type Selection = { pieceId: string; pointId: string } | null
type Drag = {
  pieceId: string
  pointId: string
  part: 'point' | 'hi' | 'ho'
  start: CanonicalPattern
  from: { x: number; y: number }
  /** Screen pixels to sheet millimetres. */
  mmPerPx: number
}

const PIECE_COLOURS = ['#c2410c', '#1d4ed8', '#15803d', '#a16207', '#7e22ce', '#0f766e', '#be123c', '#4d7c0f']

/**
 * Pattern (beta): the garment's pieces on a sheet. Drag a point (or a
 * curve handle) to reshape a piece, or use the quick edits; arrow keys
 * nudge the selected point 1 mm (10 with Shift). An edit is committed as
 * one undo step only if the pattern can still be sewn; otherwise it snaps
 * back and says why. The 3D garment re-drapes after each commit.
 */
export default function PatternEditor() {
  const stored = useEditorStore((state) => state.document.pattern?.pattern)
  const setPattern = useEditorStore((state) => state.setPattern)
  const drapeState = usePatternDrape((status) => status.state)
  const drapeRuns = usePatternDrape((status) => status.runs)
  const [preview, setPreview] = useState<CanonicalPattern | null>(null)
  const [selected, setSelected] = useState<Selection>(null)
  const [messages, setMessages] = useState<string[]>([])
  const [announce, setAnnounce] = useState('')
  // The rail is narrow; expanded, the sheet fills the screen for fine work.
  const [expanded, setExpanded] = useState(false)
  const drag = useRef<Drag | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const pattern = preview ?? stored
  const sheet = useMemo(() => (pattern ? layoutSheet({ pattern }) : null), [pattern])

  // A stored change (undo, another tab) drops any stale preview.
  useEffect(() => setPreview(null), [stored])

  if (!pattern || !sheet || !stored) {
    return null
  }

  /** Commit if it can be sewn; else snap back and say why. */
  function commit(next: CanonicalPattern, what: string) {
    // Cloth may grow past its print frame (prints stop at the frame's edge),
    // so only whether it can be sewn decides.
    const check = checkEdit({ pattern: next })
    setPreview(null)

    if (!check.ok) {
      setMessages(check.messages)
      setAnnounce(`Not applied: ${check.messages[0]}`)
      return
    }

    setMessages([])

    if (JSON.stringify(next) !== JSON.stringify(getCanonicalDocument().pattern)) {
      setPattern({ pattern: next })
      setAnnounce(what)
    }
  }

  function startDrag(event: PointerEvent<SVGElement>, piece: SheetPiece, pointId: string, part: Drag['part']) {
    const svg = svgRef.current

    if (!svg || !event.isPrimary) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
    const rect = svg.getBoundingClientRect()
    const viewWidth = svg.viewBox.baseVal.width || sheet!.width
    drag.current = {
      pieceId: piece.id,
      pointId,
      part,
      start: stored!,
      from: { x: event.clientX, y: event.clientY },
      mmPerPx: viewWidth / Math.max(1, rect.width),
    }
    setSelected({ pieceId: piece.id, pointId })
  }

  function moveDrag(event: PointerEvent<SVGElement>) {
    const current = drag.current

    if (!current) {
      return
    }

    const dx = (event.clientX - current.from.x) * current.mmPerPx
    // The sheet's y runs down; the pattern's runs up.
    const dy = -(event.clientY - current.from.y) * current.mmPerPx
    setPreview(movePoint({ pattern: current.start, pieceId: current.pieceId, pointId: current.pointId, part: current.part, dx, dy }))
  }

  function endDrag() {
    const current = drag.current
    drag.current = null

    if (current && preview) {
      commit(preview, `Moved ${current.pointId} on ${labelOf(current.pieceId)}`)
    }
  }

  function labelOf(pieceId: string) {
    return stored!.pieces.find((piece) => piece.id === pieceId)?.label ?? 'the piece'
  }

  function nudge(event: KeyboardEvent<SVGElement>, piece: SheetPiece, pointId: string) {
    const step = event.shiftKey ? 10 : 1
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
    const move = moves[event.key]

    if (!move) {
      return
    }

    event.preventDefault()
    commit(movePoint({ pattern: stored!, pieceId: piece.id, pointId, dx: move[0], dy: move[1] }), `Nudged ${pointId} ${step} mm`)
  }

  const pad = 60
  const viewBox = `${-pad} ${-pad} ${sheet.width + pad * 2} ${sheet.height + pad * 2}`

  const editor = (
    <aside
      className={
        expanded
          ? 'flv-panel fixed inset-2 z-[100] flex flex-col gap-3 overflow-auto bg-flv-paper p-4 shadow-xl sm:inset-6'
          : cn(railFrameClass(), 'gap-3')
      }
      data-testid="pattern-editor"
      data-expanded={expanded}
      aria-label="Pattern editor"
      {...(expanded ? { role: 'dialog', 'aria-modal': true } : {})}
      onKeyDown={(event) => {
        if (expanded && event.key === 'Escape') {
          setExpanded(false)
        }
      }}
    >
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <div className="flex items-baseline justify-between gap-2">
        <p className={chromeKickerClass()}>Pieces</p>
        <span className="flex items-baseline gap-3">
          <span className={chromeMutedClass()} data-testid="pattern-drape-state" data-state={drapeState} data-runs={drapeRuns}>
            {drapeState === 'draping' ? 'Draping…' : drapeState === 'failed' ? 'Couldn’t drape' : 'Draped'}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className={cn('min-h-11 border border-flv-line px-3 text-flv-ink hover:text-flv-accent', chromeTextClass())}
          >
            {expanded ? 'Done' : 'Expand'}
          </button>
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={viewBox}
        role="group"
        aria-label="Pattern pieces. Tab to a point; arrow keys move it 1 mm, with Shift 10 mm."
        className={cn('w-full touch-none select-none rounded-sm bg-flv-paper', { 'max-h-[70vh]': expanded })}
        style={{ aspectRatio: `${sheet.width + pad * 2} / ${sheet.height + pad * 2}` }}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={() => {
          drag.current = null
          setPreview(null)
        }}
      >
        {sheet.pieces.map((piece, index) => {
          const colour = PIECE_COLOURS[index % PIECE_COLOURS.length]!
          const [lx, ly] = toSheet(piece, (piece.box.minX + piece.box.maxX) / 2, (piece.box.minY + piece.box.maxY) / 2)

          return (
            <g key={piece.id} data-piece={piece.id}>
              <path d={piecePath(piece)} fill={colour} fillOpacity={0.12} stroke={colour} strokeWidth={4} vectorEffect="non-scaling-stroke" />
              <text x={lx} y={ly} textAnchor="middle" fontSize={44} fill={colour} className="font-body">
                {piece.label}
              </text>
              {piece.outline.map((point) => {
                const [px, py] = toSheet(piece, point.x, point.y)
                const isSelected = selected?.pieceId === piece.id && selected.pointId === point.id
                const handles = isSelected
                  ? (['hi', 'ho'] as const).filter((part) => point[part]).map((part) => {
                      const [hx, hy] = toSheet(piece, point.x + point[part]![0], point.y + point[part]![1])
                      return (
                        <g key={part}>
                          <line x1={px} y1={py} x2={hx} y2={hy} stroke={colour} strokeWidth={2} vectorEffect="non-scaling-stroke" />
                          <rect
                            x={hx - 14}
                            y={hy - 14}
                            width={28}
                            height={28}
                            fill="white"
                            stroke={colour}
                            strokeWidth={3}
                            vectorEffect="non-scaling-stroke"
                            className="cursor-move"
                            data-handle={`${piece.id}:${point.id}:${part}`}
                            onPointerDown={(event) => startDrag(event, piece, point.id, part)}
                          />
                        </g>
                      )
                    })
                  : null

                return (
                  <g key={point.id}>
                    {handles}
                    <circle
                      cx={px}
                      cy={py}
                      r={isSelected ? 22 : 16}
                      fill={isSelected ? colour : 'white'}
                      stroke={colour}
                      strokeWidth={3}
                      vectorEffect="non-scaling-stroke"
                      tabIndex={0}
                      role="button"
                      aria-label={`${piece.label}, point ${point.id}`}
                      aria-pressed={isSelected}
                      className="cursor-move outline-none focus-visible:stroke-flv-ink"
                      data-point={`${piece.id}:${point.id}`}
                      onPointerDown={(event) => startDrag(event, piece, point.id, 'point')}
                      onFocus={() => setSelected({ pieceId: piece.id, pointId: point.id })}
                      onKeyDown={(event) => nudge(event, piece, point.id)}
                    />
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>

      {messages.length > 0 ? (
        <ul role="alert" className={cn('flex flex-col gap-1 border border-flv-accent px-3 py-2 text-flv-accent', chromeTextClass())} data-testid="pattern-issues">
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}

      <QuickEdits pattern={stored} onPreview={setPreview} onCommit={commit} />

      {AI_ASSIST ? (
        <Suspense fallback={null}>
          <AiAssist pattern={stored} onPreview={setPreview} onApply={commit} />
        </Suspense>
      ) : null}

      <button
        type="button"
        onClick={() => {
          const basis = stored.basis
          const fresh = patternTemplateFor({ templateId: basis.templateId, templateVersion: basis.templateVersion })

          if (fresh) {
            commit(fresh.pattern, 'Pattern reset to the template')
          }
        }}
        className={cn('min-h-11 border border-flv-line px-3 text-flv-muted hover:text-flv-accent', chromeTextClass())}
      >
        Reset pattern
      </button>
    </aside>
  )

  // Expanded, the editor sits over the whole studio (a portal, so no rail
  // or stage around it can clip or offset it).
  return expanded ? (
    <>
      <p className={chromeMutedClass()}>Editing the pattern in the expanded view.</p>
      {createPortal(editor, document.body)}
    </>
  ) : (
    editor
  )
}

/** Named, bounded edits: each slider measures from the pattern as it was picked up. */
function QuickEdits({
  pattern,
  onPreview,
  onCommit,
}: {
  pattern: CanonicalPattern
  onPreview: (pattern: CanonicalPattern | null) => void
  onCommit: (pattern: CanonicalPattern, what: string) => void
}) {
  const [active, setActive] = useState<{ id: string; mm: number; base: CanonicalPattern } | null>(null)

  return (
    <fieldset className="flex flex-col gap-2" data-testid="pattern-quick-edits">
      <legend className={chromeKickerClass()}>Quick edits</legend>
      {quickEditsFor({ pattern }).map((edit) => {
        const value = active?.id === edit.id ? active.mm : 0

        const finish = (mm: number) => {
          const base = active?.base ?? pattern
          setActive(null)
          const result = quickEdit({ pattern: base, id: edit.id, mm })

          // A refused edit is still handed over, so the editor can say why.
          onCommit(result.ok ? result.pattern : result.attempted, `${edit.label} ${mm > 0 ? '+' : ''}${mm} mm`)
        }

        return (
          <label key={edit.id} className="flex flex-col gap-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className={chromeMutedClass()}>{edit.label}</span>
              <span className={chromeMutedClass()} data-quick-value={edit.id}>
                {value === 0 ? '—' : `${value > 0 ? '+' : ''}${value / 10} cm`}
              </span>
            </span>
            <input
              type="range"
              name={edit.id}
              aria-label={`${edit.label}, change in millimetres`}
              min={edit.limits.min}
              max={edit.limits.max}
              step={5}
              value={value}
              onChange={(event) => {
                const mm = Number.parseInt(event.target.value, 10)
                const base = active?.base ?? pattern
                setActive({ id: edit.id, mm, base })
                const result = quickEdit({ pattern: base, id: edit.id, mm })
                onPreview(result.ok ? result.pattern : null)
              }}
              onPointerUp={(event) => finish(Number.parseInt((event.target as HTMLInputElement).value, 10))}
              onKeyUp={(event) => {
                if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End' || event.key.startsWith('Page')) {
                  finish(Number.parseInt((event.target as HTMLInputElement).value, 10))
                }
              }}
              className="w-full accent-flv-accent"
            />
          </label>
        )
      })}
    </fieldset>
  )
}
