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
    // Node positions in a circle
    const pos = new Map<string, { x: number; y: number }>();
    heroes.forEach((h, i) => {
      const angle = (2 * Math.PI * i) / heroes.length - Math.PI / 2;
      pos.set(h.heroId, {
        x: CX + RADIUS * Math.cos(angle),
        y: CY + RADIUS * Math.sin(angle),
      });
    });

    // Edges from alliances
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

    // Edges from recent events
    for (const evt of events) {
      if (!evt.heroId || !evt.targetHeroId) continue;
      if (evt.eventType === 'betray') addEdge(evt.heroId, evt.targetHeroId, 'betray');
      else if (evt.eventType === 'fight' || evt.eventType === 'gang_up') addEdge(evt.heroId, evt.targetHeroId, 'fight');
    }

    return { positions: pos, edges: edgeList };
  }, [heroes, events]);

  if (heroes.length === 0) return null;

  return (
    <details className="card-wuxia rounded-xl overflow-hidden">
      <summary className="px-4 py-3 cursor-pointer text-sm font-bold text-[--text-secondary] hover:text-[--accent-gold] transition select-none">
        🕸️ 关系网络
      </summary>
      <div className="px-2 pb-3">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-h-[350px]">
          {/* Edges */}
          {edges.map((e, i) => {
            const p1 = positions.get(e.from);
            const p2 = positions.get(e.to);
            if (!p1 || !p2) return null;
            const styles: Record<Edge['type'], { stroke: string; dasharray?: string; width: number }> = {
              ally: { stroke: '#d4a843', width: 2 },
              betray: { stroke: '#c0392b', dasharray: '4 3', width: 2 },
              fight: { stroke: '#555', width: 1 },
            };
            const s = styles[e.type];
            return (
              <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                stroke={s.stroke} strokeWidth={s.width}
                strokeDasharray={s.dasharray} opacity={0.7} />
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
                  fill={eliminated ? '#333' : '#1a1a2e'}
                  stroke={eliminated ? '#555' : '#d4a843'}
                  strokeWidth={eliminated ? 1 : 2}
                  opacity={eliminated ? 0.5 : 1}
                />
                <text x={p.x} y={p.y + 1} textAnchor="middle" dominantBaseline="middle"
                  fontSize="9" fill={eliminated ? '#777' : '#e8e0d0'} fontWeight="bold">
                  {h.heroName.slice(0, 2)}
                </text>
                {/* Name label below */}
                <text x={p.x} y={p.y + NODE_R + 12} textAnchor="middle"
                  fontSize="8" fill={eliminated ? '#555' : '#a09880'}>
                  {h.heroName.length > 4 ? h.heroName.slice(0, 4) : h.heroName}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Legend */}
        <div className="flex justify-center gap-4 text-[10px] text-[--text-secondary] mt-1">
          <span><span className="inline-block w-3 h-0.5 bg-[--accent-gold] mr-1 align-middle" />联盟</span>
          <span><span className="inline-block w-3 h-0.5 bg-[--accent-red] mr-1 align-middle border-dashed" style={{ borderBottom: '1px dashed var(--accent-red)' }} />背叛</span>
          <span><span className="inline-block w-3 h-0.5 bg-gray-500 mr-1 align-middle" />战斗</span>
        </div>
      </div>
    </details>
  );
}
