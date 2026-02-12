'use client';

import { useMemo } from 'react';
import { useWulinStore } from '@/stores/gameStore';

const SIZE = 400;
const CX = SIZE / 2;
const CY = SIZE / 2;
const RADIUS = 150;
const NODE_R = 18;

interface Edge {
  from: string;
  to: string;
  type: 'ally' | 'betray' | 'fight';
}

export function RelationshipGraph() {
  const gameState = useWulinStore(s => s.gameState);
  const heroes = gameState?.heroes || [];
  const events = gameState?.recentEvents || [];

  const { positions, edges } = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    heroes.forEach((h, i) => {
      const angle = (2 * Math.PI * i) / heroes.length - Math.PI / 2;
      pos.set(h.heroId, {
        x: CX + RADIUS * Math.cos(angle),
        y: CY + RADIUS * Math.sin(angle),
      });
    });

    const edgeSet = new Set<string>();
    const edgeList: Edge[] = [];
    const addEdge = (from: string, to: string, type: Edge['type']) => {
      const key = [from, to].sort().join(':') + type;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edgeList.push({ from, to, type });
      }
    };

    for (const h of heroes) {
      if (h.allyHeroId) addEdge(h.heroId, h.allyHeroId, 'ally');
    }

    for (const evt of events) {
      if (!evt.heroId || !evt.targetHeroId) continue;
      if (evt.eventType === 'betray') addEdge(evt.heroId, evt.targetHeroId, 'betray');
      else if (evt.eventType === 'fight' || evt.eventType === 'gang_up') addEdge(evt.heroId, evt.targetHeroId, 'fight');
    }

    return { positions: pos, edges: edgeList };
  }, [heroes, events]);

  if (heroes.length === 0) return null;

  return (
    <details className="card-wuxia rounded-lg overflow-hidden">
      <summary className="px-4 py-3 cursor-pointer text-sm font-display font-bold text-[--text-dim] hover:text-gold transition select-none flex items-center gap-2">
        <span>🕸️</span>
        <span>关系网络</span>
        <span className="ml-auto text-[10px] text-[--text-dim] font-normal">点击展开</span>
      </summary>
      <div className="px-2 pb-3">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-h-[350px]">
          <defs>
            <radialGradient id="nodeGradient">
              <stop offset="0%" stopColor="#3d3a33" />
              <stop offset="100%" stopColor="#2a2722" />
            </radialGradient>
            <radialGradient id="nodeGradientDead">
              <stop offset="0%" stopColor="#2a2722" />
              <stop offset="100%" stopColor="#1c1a16" />
            </radialGradient>
          </defs>
          {/* Edges */}
          {edges.map((e, i) => {
            const p1 = positions.get(e.from);
            const p2 = positions.get(e.to);
            if (!p1 || !p2) return null;
            const styles: Record<Edge['type'], { stroke: string; dasharray?: string; width: number; opacity: number }> = {
              ally: { stroke: '#c9a84c', width: 2, opacity: 0.6 },
              betray: { stroke: '#c13c37', dasharray: '4 3', width: 2, opacity: 0.7 },
              fight: { stroke: '#4a4540', width: 1, opacity: 0.5 },
            };
            const s = styles[e.type];
            return (
              <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                stroke={s.stroke} strokeWidth={s.width}
                strokeDasharray={s.dasharray} opacity={s.opacity} />
            );
          })}

          {/* Nodes */}
          {heroes.map(h => {
            const p = positions.get(h.heroId);
            if (!p) return null;
            const eliminated = h.isEliminated;
            return (
              <g key={h.heroId}>
                <circle cx={p.x} cy={p.y} r={NODE_R}
                  fill={eliminated ? 'url(#nodeGradientDead)' : 'url(#nodeGradient)'}
                  stroke={eliminated ? '#3d3a33' : '#c9a84c'}
                  strokeWidth={eliminated ? 1 : 1.5}
                  opacity={eliminated ? 0.4 : 1}
                />
                <text x={p.x} y={p.y + 1} textAnchor="middle" dominantBaseline="middle"
                  fontSize="9" fill={eliminated ? '#6a6358' : '#e8e0d0'} fontWeight="bold">
                  {h.heroName.slice(0, 2)}
                </text>
                <text x={p.x} y={p.y + NODE_R + 12} textAnchor="middle"
                  fontSize="8" fill={eliminated ? '#4a4540' : '#9a9080'}>
                  {h.heroName.length > 4 ? h.heroName.slice(0, 4) : h.heroName}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Legend */}
        <div className="flex justify-center gap-5 text-[10px] text-[--text-dim] mt-1">
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-[2px] bg-gold rounded" />联盟
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-[2px] rounded" style={{ background: 'repeating-linear-gradient(90deg, var(--vermillion), var(--vermillion) 3px, transparent 3px, transparent 6px)' }} />背叛
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-[1px] bg-ink-faint rounded" />战斗
          </span>
        </div>
      </div>
    </details>
  );
}
