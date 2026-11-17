import { Suspense, lazy, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'

import { AI_ASSIST } from '../../lib/ai-assist'
import { cn } from '../../lib/cn'
import { getCanonicalDocument, useEditorStore } from '../../lib/editor-store'
import {
  type SheetEdge,
  type SheetPiece,
  addPoint,
  checkEdit,
  describeEdge,
  edgePath,
  layoutSheet,
  movePoint,
  piecePath,
  quickEdit,
  quickEditsFor,
  removePoint,
  sheetEdges,
  slitChoice,
  slitEdit,
  toSheet,
} from '../../lib/pattern/editor-model'
import type { CanonicalPattern } from '../../lib/pattern/pattern-document'
import { PATTERN_OP_LIMITS, closeSlit } from '../../lib/pattern/pattern-ops'
import { patternPresetFor, patternPresetsFor, patternTemplateFor } from '../../lib/pattern/templates'
import { usePatternDrape } from '../../lib/pattern-drape-status'
import { chromeKickerClass, chromeMutedClass, chromeTextClass, railFrameClass } from '../../lib/studio-chrome'
import { patternKeyAction, patternKeyList } from '../../lib/studio-keys'

const AiAssist = lazy(() => import('./AiAssist'))

type Selection = { pieceId: string; pointId: string } | null
/** An edge by its first point's place on the outline; `seamId` follows a seam whose points shift. */
type EdgeSelection = { pieceId: string; index: number; seamId: string | null } | null
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
 * nudge the selected point 1 mm (10 with Shift). Edges are drawn by what
 * sews them: solid in the seam's colour, dashed where open. Select an
 * edge to add a point on it or open a slit in its seam. An edit is
 * committed as one undo step only if the pattern can still be sewn;
 * otherwise it snaps back and says why. The 3D garment re-drapes after
 * each commit.
 */
export default function PatternEditor() {
  const stored = useEditorStore((state) => state.document.pattern?.pattern)
  const setPattern = useEditorStore((state) => state.setPattern)
  const drapeState = usePatternDrape((status) => status.state)
  const drapeRuns = usePatternDrape((status) => status.runs)
  const [preview, setPreview] = useState<CanonicalPattern | null>(null)
  const [selected, setSelected] = useState<Selection>(null)
  const [edge, setEdge] = useState<EdgeSelection>(null)
  /** A point or edge to focus once the next render has it. */
  const pendingFocus = useRef<string | null>(null)
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

  useEffect(() => {
    const selector = pendingFocus.current

    if (selector) {
      pendingFocus.current = null
      svgRef.current?.querySelector<SVGElement>(selector)?.focus()
    }
  })

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
      return false
    }

    setMessages([])

    if (JSON.stringify(next) !== JSON.stringify(getCanonicalDocument().pattern)) {
      setPattern({ pattern: next })
      setAnnounce(what)
    }

    return true
  }

  /** Says why something can't be done, without changing anything. */
  function refuse(message: string) {
    setMessages([message])
    setAnnounce(`Not applied: ${message}`)
  }

  function selectPoint(pieceId: string, pointId: string) {
    setSelected({ pieceId, pointId })
    setEdge(null)
  }

  function selectEdge(piece: SheetPiece, entry: SheetEdge) {
    setSelected(null)
    setEdge({ pieceId: piece.id, index: entry.index, seamId: entry.seam?.id ?? null })
    setAnnounce(describeEdge({ piece, edge: entry }))
  }

  function addPointOn(pieceId: string, index: number) {
    const added = addPoint({ pattern: stored!, pieceId, index })

    if (added && commit(added.pattern, `Added point ${added.pointId} on ${labelOf(pieceId)}`)) {
      selectPoint(pieceId, added.pointId)
      pendingFocus.current = `[data-point="${pieceId}:${added.pointId}"]`
    }
  }

  function removePointOf(pieceId: string, pointId: string) {
    const removed = removePoint({ pattern: stored!, pieceId, pointId })

    if (!removed.ok) {
      refuse(removed.message)
      return
    }

    if (commit(removed.pattern, `Removed point ${pointId} from ${labelOf(pieceId)}`)) {
      setSelected(null)
    }
  }

  function onPointKey(event: KeyboardEvent<SVGElement>, piece: SheetPiece, pointId: string) {
    const action = patternKeyAction({ key: event.key, shiftKey: event.shiftKey, metaKey: event.metaKey, ctrlKey: event.ctrlKey, altKey: event.altKey, on: 'point' })

    if (!action) {
      return
    }

    event.preventDefault()

    if (action.type === 'nudge') {
      const step = Math.abs(action.dx || action.dy)
      commit(movePoint({ pattern: stored!, pieceId: piece.id, pointId, dx: action.dx, dy: action.dy }), `Nudged ${pointId} ${step} mm`)
    } else if (action.type === 'removePoint') {
      removePointOf(piece.id, pointId)
    } else if (action.type === 'deselect') {
      setSelected(null)
      ;(event.target as SVGElement).blur()
    }
  }

  function onEdgeKey(event: KeyboardEvent<SVGElement>, piece: SheetPiece, entry: SheetEdge) {
    const action = patternKeyAction({ key: event.key, shiftKey: event.shiftKey, metaKey: event.metaKey, ctrlKey: event.ctrlKey, altKey: event.altKey, on: 'edge' })

    if (!action) {
      return
    }

    event.preventDefault()

    if (action.type === 'addPoint') {
      addPointOn(piece.id, entry.index)
    } else if (action.type === 'slit') {
      const slider = document.querySelector<HTMLInputElement>('[data-testid="pattern-edge-tools"] input[name="slit-length"]')

      if (slider) {
        slider.focus()
      } else {
        refuse(entry.seam ? 'This seam is too short for a slit.' : 'This edge is open already; pick a sewn edge for a slit.')
      }
    } else if (action.type === 'deselect') {
      setEdge(null)
      ;(event.target as SVGElement).blur()
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
    selectPoint(piece.id, pointId)
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

  const edgesOf = new Map(sheet.pieces.map((piece) => [piece.id, sheetEdges({ pattern, piece })]))
  // The selected edge, following its seam if a slit moved its points: as
  // drawn (a preview may have shifted them), and as stored, for its tools.
  const edgePiece = edge ? sheet.pieces.find((piece) => piece.id === edge.pieceId) : undefined
  const drawnEdge = edge && edgePiece ? resolveEdge(edgesOf.get(edgePiece.id)!, edge) : null
  const storedPiece = edge && preview ? layoutSheet({ pattern: stored }).pieces.find((piece) => piece.id === edge.pieceId) : edgePiece
  const toolEdge = edge && storedPiece ? (preview ? resolveEdge(sheetEdges({ pattern: stored, piece: storedPiece }), edge) : drawnEdge) : null
  const selectedPoint = selected ? sheet.pieces.find((piece) => piece.id === selected.pieceId) : undefined

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
        aria-label={`Pattern pieces. ${patternKeyList()
          .map((entry) => `${entry.keys}: ${entry.does}.`)
          .join(' ')}`}
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
              <path d={piecePath(piece)} fill={colour} fillOpacity={0.12} stroke="none" />
              <text x={lx} y={ly} textAnchor="middle" fontSize={44} fill={colour} className="font-body">
                {piece.label}
              </text>
              {edgesOf.get(piece.id)!.map((entry) => {
                const d = edgePath(piece, entry.index)
                const isSelected = drawnEdge !== null && edgePiece?.id === piece.id && drawnEdge.index === entry.index

                return (
                  <g key={`edge-${entry.index}`}>
                    {/* Sewn: solid in the seam's colour. Open: dashed in the piece's. */}
                    <path
                      d={d}
                      fill="none"
                      stroke={entry.seam?.colour ?? colour}
                      strokeWidth={isSelected ? 9 : entry.seam ? 5 : 3}
                      strokeDasharray={entry.seam ? undefined : '8 6'}
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                      data-seam={entry.seam?.id ?? ''}
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={22}
                      vectorEffect="non-scaling-stroke"
                      tabIndex={0}
                      role="button"
                      aria-label={describeEdge({ piece, edge: entry })}
                      aria-pressed={isSelected}
                      className="cursor-pointer outline-none focus-visible:stroke-flv-ink/30"
                      data-edge={`${piece.id}:${entry.index}`}
                      onClick={() => selectEdge(piece, entry)}
                      onFocus={() => selectEdge(piece, entry)}
                      onKeyDown={(event) => onEdgeKey(event, piece, entry)}
                    />
                  </g>
                )
              })}
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
                      onFocus={() => selectPoint(piece.id, point.id)}
                      onKeyDown={(event) => onPointKey(event, piece, point.id)}
                    />
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>

      {toolEdge && storedPiece ? (
        <EdgeTools
          key={`${storedPiece.id}:${toolEdge.seam?.id ?? toolEdge.index}`}
          pattern={stored}
          piece={storedPiece}
          edge={toolEdge}
          onAddPoint={() => addPointOn(storedPiece.id, toolEdge.index)}
          onPreview={setPreview}
          onCommit={commit}
        />
      ) : null}

      {selected && selectedPoint ? (
        <div className={cn('flex flex-wrap items-center gap-2', chromeTextClass())} data-testid="pattern-point-tools">
          <span className={chromeMutedClass()}>
            {selectedPoint.label}, point {selected.pointId}
          </span>
          <button
            type="button"
            onClick={() => removePointOf(selected.pieceId, selected.pointId)}
            className={cn('min-h-11 border border-flv-line px-3 text-flv-ink hover:text-flv-accent', chromeTextClass())}
          >
            Remove point
          </button>
        </div>
      ) : null}

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

      <Presets pattern={stored} onCommit={commit} />

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

/**
 * Other starting patterns the template offers (the trousers' shorts): each
 * replaces the pattern, as "Reset pattern" does, with the template's frames.
 */
function Presets({ pattern, onCommit }: { pattern: CanonicalPattern; onCommit: (next: CanonicalPattern, label: string) => void }) {
  const { templateId, templateVersion } = pattern.basis
  const presets = patternPresetsFor({ templateId, templateVersion })

  if (presets.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Start from">
      <span className={chromeMutedClass()}>Start from</span>
      {presets.map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => {
            const next = patternPresetFor({ templateId, templateVersion, preset: preset.id })

            if (next) {
              onCommit(next.pattern, `Pattern set to ${preset.label.toLowerCase()}`)
            }
          }}
          className={cn('min-h-11 border border-flv-line px-3 text-flv-ink hover:text-flv-accent', chromeTextClass())}
        >
          {preset.label}
        </button>
      ))}
    </div>
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

/** The edge a selection names: its index, or, if a seam has moved, the first edge that seam sews. */
function resolveEdge(edges: SheetEdge[], selection: NonNullable<EdgeSelection>) {
  const at = edges[selection.index]

  if (selection.seamId && at?.seam?.id !== selection.seamId) {
    return edges.find((entry) => entry.seam?.id === selection.seamId) ?? null
  }

  return at ?? null
}

/** What the selected edge offers: a point halfway along, and a slit when a seam sews it. */
function EdgeTools({
  pattern,
  piece,
  edge,
  onAddPoint,
  onPreview,
  onCommit,
}: {
  pattern: CanonicalPattern
  piece: SheetPiece
  edge: SheetEdge
  onAddPoint: () => void
  onPreview: (pattern: CanonicalPattern | null) => void
  onCommit: (pattern: CanonicalPattern, what: string) => boolean
}) {
  const choice = slitChoice({ pattern, pieceId: piece.id, index: edge.index })
  const [mm, setMm] = useState(() => (choice ? choice.current || Math.min(150, choice.max) : 0))
  const buttonClass = cn('min-h-11 border border-flv-line px-3 text-flv-ink hover:text-flv-accent', chromeTextClass())

  function preview(next: number) {
    if (!choice) {
      return
    }

    const result = slitEdit({ pattern, pieceId: piece.id, seamId: choice.seamId, mm: next })
    onPreview(result.ok ? result.pattern : null)
  }

  return (
    <div className="flex flex-col gap-2 border border-flv-line px-3 py-2" data-testid="pattern-edge-tools" role="group" aria-label="Selected edge">
      <p className={chromeMutedClass()}>{describeEdge({ piece, edge })}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onAddPoint} className={buttonClass}>
          Add point
        </button>
        {choice && choice.current > 0 ? (
          <button
            type="button"
            onClick={() => onCommit(closeSlit({ pattern, seamId: choice.seamId }), `Closed the slit in seam ${choice.seamId}`)}
            className={buttonClass}
          >
            Close slit
          </button>
        ) : null}
      </div>
      {choice ? (
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className={chromeMutedClass()}>Slit length</span>
              <span className={chromeMutedClass()} data-slit-value>
                {(mm / 10).toFixed(1)} cm
              </span>
            </span>
            <input
              type="range"
              name="slit-length"
              aria-label="Slit length, millimetres up from the hem"
              min={PATTERN_OP_LIMITS.slit.min}
              max={choice.max}
              step={5}
              value={mm}
              onChange={(event) => {
                const next = Number.parseInt(event.target.value, 10)
                setMm(next)
                preview(next)
              }}
              onBlur={() => onPreview(null)}
              className="w-full accent-flv-accent"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              const result = slitEdit({ pattern, pieceId: piece.id, seamId: choice.seamId, mm })
              // A refused slit is still handed over, so the editor can say why.
              onCommit(result.ok ? result.pattern : result.attempted, `Slit of ${(mm / 10).toFixed(1)} cm in seam ${choice.seamId}`)
            }}
            className={buttonClass}
          >
            {choice.current > 0 ? 'Update slit' : 'Add slit here'}
          </button>
        </div>
      ) : edge.seam ? (
        <p className={chromeMutedClass()}>This seam is too short for a slit.</p>
      ) : null}
    </div>
  )
}
