'use client';

import { useRef, useEffect } from 'react';
import { RankEntry } from '@/lib/types';

const RANK_LABELS = ['壹', '贰', '叁'];
const RANK_STYLES = [
  'rank-1 rounded-lg',
  'rank-2 rounded-lg',
  'rank-3 rounded-lg',
];

export function RankingPanel({ title, icon, entries, highlight }: {
  title: string;
  icon: string;
  entries: RankEntry[];
  highlight?: number;
}) {
  const prevValuesRef = useRef<Map<string, { value: number; rank: number }>>(new Map());
  const flashSetRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const newFlash = new Set<string>();
    for (const entry of entries) {
      const prev = prevValuesRef.current.get(entry.heroId);
      if (prev && prev.value !== entry.value) {
        newFlash.add(entry.heroId);
      }
    }
    flashSetRef.current = newFlash;

    const newMap = new Map<string, { value: number; rank: number }>();
    for (const entry of entries) {
      newMap.set(entry.heroId, { value: entry.value, rank: entry.rank });
    }
    prevValuesRef.current = newMap;
  }, [entries]);

  function getRankDelta(entry: RankEntry): number | null {
    const prev = prevValuesRef.current.get(entry.heroId);
    if (!prev) return null;
    return prev.rank - entry.rank; // positive = moved up
  }

  return (
    <div className="card-wuxia p-4 overflow-hidden h-full">
      {/* Header with brush stroke underline */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">{icon}</span>
        <h3 className="font-display font-bold text-sm tracking-wide brush-underline">{title}</h3>
        {highlight && (
          <span className="text-[10px] text-[--text-dim] ml-auto tracking-wider">
            前{highlight}进四强
          </span>
        )}
      </div>

      <div className="space-y-1">
        {entries.slice(0, 8).map((entry, i) => {
          const shouldFlash = flashSetRef.current.has(entry.heroId);
          const delta = getRankDelta(entry);
          return (
            <div key={entry.heroId} className={`flex items-center gap-2 px-2.5 py-2 text-sm transition-all ${
              i < 3 ? RANK_STYLES[i] :
              highlight && i < highlight ? 'bg-gold/[0.03] border-l-2 border-l-gold/25 rounded-lg' : 'rounded-lg'
            }`}>
              {/* Rank indicator */}
              <span className="w-6 text-center flex-shrink-0">
                {i < 3 ? (
                  <span className="seal-stamp text-[10px]" style={{ width: '1.4rem', height: '1.4rem' }}>
                    {RANK_LABELS[i]}
                  </span>
                ) : (
                  <span className="text-[--text-dim] text-xs font-mono tabular-nums">{i + 1}</span>
                )}
              </span>

              {/* Rank delta arrow */}
              {delta !== null && delta !== 0 && (
                <span className={`text-[10px] w-3 flex-shrink-0 ${delta > 0 ? 'text-jade' : 'text-vermillion'}`}>
                  {delta > 0 ? '▲' : '▼'}
                </span>
              )}
              {(delta === null || delta === 0) && <span className="w-3 flex-shrink-0" />}

              {/* Name */}
              <span className={`flex-1 truncate ${
                i === 0 ? 'font-bold text-gold font-display' : 'font-medium'
              }`}>
                {entry.heroName}
              </span>

              {/* Faction */}
              <span className="text-[10px] text-[--text-dim] tracking-wider">{entry.faction}</span>

              {/* Value */}
              <span className={`font-mono w-10 text-right tabular-nums ${
                i === 0 ? 'text-gold font-bold' : 'text-[--text-secondary]'
              } ${shouldFlash ? 'value-flash' : ''}`}>
                {entry.value}
              </span>
            </div>
          );
        })}
        {entries.length === 0 && (
          <div className="text-center text-[--text-dim] text-sm py-6 font-display">暂无数据</div>
        )}
      </div>
    </div>
  );
}
