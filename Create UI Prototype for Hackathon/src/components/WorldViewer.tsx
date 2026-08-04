import { useEffect, useState } from 'react'
import type { EntityStatus, ScenePatch, WorldSnapshot } from '../types'

// Stands in for Member 2's 3D scene renderer, built to the prop contract described
// in the PRD (§6 Viewer contract / §15 Minimum 3D Viewer Interfaces). Every prop
// here is one Member 2's real component needs to support; internally this renders
// a flat SVG room instead of a real 3D scene, but nothing outside this file should
// need to change when the real renderer is dropped in.

export interface WorldViewerProps {
  snapshot: WorldSnapshot | null
  patch: ScenePatch | null
  selectedEntityId: string | null
  highlightedEntityIds: string[]
  showChapterChanges: boolean
  onEntitySelect: (id: string | null) => void
  onSceneReady: () => void
  onSceneError: (message: string) => void
}

const STATUS_COLOR: Record<EntityStatus, string> = {
  unchanged: '#6e6354',
  moved: '#4a7cb5',
  updated: '#9b66d4',
  added: '#c9a55a',
  removed: '#c05050',
}

export default function WorldViewer({
  snapshot, selectedEntityId, highlightedEntityIds, showChapterChanges, onEntitySelect, onSceneReady, onSceneError,
}: WorldViewerProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!snapshot) {
      onSceneError('No world snapshot is available yet.')
      return
    }
    onSceneReady()
  }, [snapshot, onSceneReady, onSceneError])

  if (!snapshot) {
    return (
      <div className="flex items-center justify-center h-full text-sm font-mono" style={{ color: '#6e6354' }}>
        No scene to display.
      </div>
    )
  }

  const entities = snapshot.entities
  const byId = (id: string) => entities.find(e => e.id === id)
  const hasFireplace = !!byId('fireplace')
  const hasPortrait = byId('portrait')
  const hasWindow = !!byId('window')
  const hasDoor = !!byId('door')

  const fireGlow = `rgba(255,${120 + Math.sin(tick / 15) * 20},20,${0.22 + Math.sin(tick / 12) * 0.06})`

  return (
    <svg
      viewBox="0 0 1200 680"
      className="w-full h-full"
      style={{ display: 'block' }}
      onClick={() => onEntitySelect(null)}
    >
      <defs>
        <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
        </filter>
        <filter id="glow-fire" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="28" />
        </filter>
        <clipPath id="floor-clip">
          <polygon points="0,680 1200,680 900,500 300,500" />
        </clipPath>
        <radialGradient id="win-light" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#8ab4d4" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#8ab4d4" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ambient" cx="50%" cy="35%" r="55%">
          <stop offset="0%" stopColor="#2a1a08" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#2a1a08" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="100%" stopColor="#06050c" stopOpacity="0.7" />
        </radialGradient>
      </defs>

      {/* ── Generic room shell ── */}
      <polygon points="0,0 1200,0 900,100 300,100" fill="#0b0918" />
      <rect x={300} y={100} width={600} height={400} fill="#13101f" />
      <polygon points="0,0 300,100 300,500 0,680" fill="#100e1c" />
      <polygon points="1200,0 900,100 900,500 1200,680" fill="#0e0c18" />
      <polygon points="0,680 1200,680 900,500 300,500" fill="#0c0a16" />

      {[520, 545, 575, 615, 660, 680].map(y => (
        <line key={y} x1={0} y1={y} x2={1200} y2={y} stroke="rgba(140,110,70,0.05)" strokeWidth={1} clipPath="url(#floor-clip)" />
      ))}
      <line x1={300} y1={100} x2={900} y2={100} stroke="rgba(201,165,90,0.08)" strokeWidth={2} />
      <line x1={300} y1={500} x2={900} y2={500} stroke="rgba(201,165,90,0.06)" strokeWidth={1} />
      <line x1={300} y1={100} x2={300} y2={500} stroke="rgba(201,165,90,0.06)" strokeWidth={1} />
      <line x1={900} y1={100} x2={900} y2={500} stroke="rgba(201,165,90,0.06)" strokeWidth={1} />

      {/* ── Fireplace, only when the current world has one ── */}
      {hasFireplace && (
        <>
          <ellipse cx={600} cy={440} rx={90} ry={60} fill={fireGlow} filter="url(#glow-fire)" />
          <path d="M 545,500 V 390 Q 545,355 560,355 H 640 Q 655,355 655,390 V 500 Z" fill="#0d0b16" stroke="rgba(201,165,90,0.2)" strokeWidth={1.5} />
          <rect x={520} y={352} width={160} height={8} fill="#1e1828" rx={1} stroke="rgba(201,165,90,0.15)" strokeWidth={1} />
          <rect x={560} y={470} width={80} height={28} fill="#331505" rx={2} />
          <ellipse cx={600} cy={470} rx={30} ry={8} fill="#ff7010" opacity={0.4} />
          <ellipse cx={600} cy={462} rx={18} ry={14} fill="#ff9030" opacity={0.25} />
          <rect x={592} y={337} width={16} height={18} fill="#14111e" rx={2} stroke="rgba(201,165,90,0.3)" strokeWidth={1} />
        </>
      )}

      {/* ── Portrait ── */}
      {hasPortrait && (
        <>
          <rect x={645} y={130} width={76} height={98} fill="#0e0c18" stroke="rgba(201,165,90,0.28)" strokeWidth={2} rx={1} />
          <rect x={653} y={138} width={60} height={82} fill="#161222" />
          <ellipse cx={683} cy={160} rx={12} ry={14} fill="#241c30" />
          <path d="M 663,200 Q 663,175 683,175 Q 703,175 703,200 V 220 H 663 Z" fill="#241c30" />
          {hasPortrait.status === 'updated' && (
            <line x1={645} y1={228} x2={721} y2={225} stroke="rgba(155,102,212,0.5)" strokeWidth={1} strokeDasharray="3,2" />
          )}
        </>
      )}

      {/* ── Window ── */}
      {hasWindow && (
        <>
          <rect x={55} y={230} width={110} height={140} fill="#0e0c1a" stroke="rgba(201,165,90,0.12)" strokeWidth={1.5} rx={1} />
          <line x1={110} y1={230} x2={110} y2={370} stroke="rgba(201,165,90,0.12)" strokeWidth={1} />
          <line x1={55} y1={300} x2={165} y2={300} stroke="rgba(201,165,90,0.12)" strokeWidth={1} />
          <ellipse cx={110} cy={300} rx={70} ry={90} fill="url(#win-light)" />
        </>
      )}

      {/* ── Main door ── */}
      {hasDoor && (
        <>
          <rect x={1010} y={220} width={88} height={190} fill="#0d0b14" stroke="rgba(201,165,90,0.12)" strokeWidth={1.5} rx={1} />
          <rect x={1018} y={228} width={32} height={80} fill="#11101a" stroke="rgba(201,165,90,0.07)" strokeWidth={1} />
          <rect x={1058} y={228} width={32} height={80} fill="#11101a" stroke="rgba(201,165,90,0.07)" strokeWidth={1} />
          <circle cx={1052} cy={320} r={4} fill="#c9a55a" opacity={0.5} />
        </>
      )}

      <ellipse cx={600} cy={300} rx={340} ry={280} fill="url(#ambient)" />

      {/* ── Scene entities ── */}
      {entities.map(entity => {
        const isSelected = selectedEntityId === entity.id
        const isHovered = hovered === entity.id
        const isHighlighted = highlightedEntityIds.includes(entity.id)
        const color = STATUS_COLOR[entity.status]
        const isNew = showChapterChanges && entity.status === 'added'

        return (
          <g
            key={entity.id}
            style={{ cursor: 'pointer' }}
            onClick={e => { e.stopPropagation(); onEntitySelect(isSelected ? null : entity.id) }}
            onMouseEnter={() => setHovered(entity.id)}
            onMouseLeave={() => setHovered(null)}
          >
            <circle cx={entity.position.x} cy={entity.position.y} r={entity.radius * 2.2}
              fill={color}
              opacity={isSelected ? 0.35 : isNew ? 0.22 : 0.1}
              filter="url(#soft)"
              style={isNew ? { animation: 'pulse-gold 2.2s ease-in-out infinite' } : undefined}
            />
            {(isSelected || isHighlighted) && (
              <circle cx={entity.position.x} cy={entity.position.y} r={entity.radius + 10}
                fill="none" stroke="white" strokeWidth={1.5} opacity={0.6} strokeDasharray="4,3" />
            )}
            {isHovered && !isSelected && (
              <circle cx={entity.position.x} cy={entity.position.y} r={entity.radius + 6}
                fill="none" stroke={color} strokeWidth={1} opacity={0.5} />
            )}
            <circle cx={entity.position.x} cy={entity.position.y} r={entity.radius}
              fill={color} opacity={isSelected ? 1 : isHovered ? 0.9 : isNew ? 0.85 : 0.55} />
            <circle cx={entity.position.x} cy={entity.position.y} r={entity.radius * 0.4}
              fill="white" opacity={isSelected ? 0.9 : 0.5} />
            <text x={entity.position.x} y={entity.position.y + entity.radius + 14} textAnchor="middle"
              fontSize={9} fontFamily="'JetBrains Mono', monospace"
              fill={isSelected ? '#e0d6c8' : color} opacity={isSelected || isHovered ? 1 : 0.7}>
              {entity.name}
            </text>
            {isNew && (
              <text x={entity.position.x + entity.radius + 2} y={entity.position.y - entity.radius + 2}
                fontSize={7} fontFamily="'JetBrains Mono', monospace" fill="#c9a55a" fontWeight="bold">
                NEW
              </text>
            )}
          </g>
        )
      })}

      <rect x={0} y={0} width={1200} height={680} fill="url(#vignette)" pointerEvents="none" />
    </svg>
  )
}
