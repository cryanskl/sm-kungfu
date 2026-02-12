'use client';

import { RankEntry, HighlightEvent } from '@/lib/types';

const RANK_LABELS = ['壹', '贰', '叁'];

const HIGHLIGHT_ICONS: Record<string, string> = {
  director_event: '📣',
  scramble: '💎',
  speech: '🎤',
  betray: '🗡️',
  ally_formed: '🤝',
  comeback: '🌟',
  hot_news: '🔥',
  eliminated: '💀',
  champion: '🏆',
  fight: '⚔️',
  gang_up: '👊',
};

export function LastGameTop8({ entries }: { entries: RankEntry[] }) {
  if (!entries || entries.length === 0) return null;

  return (
    <div className="card-wuxia p-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🏆</span>
        <h3 className="font-display font-bold text-sm tracking-wide brush-underline">上届英雄榜</h3>
      </div>
      <div className="space-y-1 stagger-children">
        {entries.map((entry, i) => (
          <div key={entry.heroId} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm ${
            i < 3 ? ['rank-1', 'rank-2', 'rank-3'][i] : ''
          }`}>
            <span className="w-6 text-center flex-shrink-0">
              {i < 3 ? (
                <span className="seal-stamp text-[10px]" style={{ width: '1.4rem', height: '1.4rem' }}>
                  {RANK_LABELS[i]}
                </span>
              ) : (
                <span className="text-[--text-dim] text-xs font-mono tabular-nums">{i + 1}</span>
              )}
            </span>
            <span className={`flex-1 truncate ${i === 0 ? 'font-bold text-gold font-display' : 'font-medium'}`}>
              {entry.heroName}
            </span>
            <span className="text-[10px] text-[--text-dim] tracking-wider">{entry.faction}</span>
            <span className={`font-mono w-10 text-right text-xs tabular-nums ${i === 0 ? 'text-gold font-bold' : 'text-[--text-secondary]'}`}>
              {entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LastGameHighlights({ events }: { events: HighlightEvent[] }) {
  if (!events || events.length === 0) return null;

  return (
    <div className="card-wuxia p-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">📜</span>
        <h3 className="font-display font-bold text-sm tracking-wide brush-underline">上届大事记</h3>
      </div>
      <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1 stagger-children scroll-fade">
        {events.map((event, i) => (
          <div key={i} className={`px-2.5 py-2 rounded-lg text-sm ${
            event.priority >= 7
              ? 'bg-vermillion/[0.06] border-l-2 border-l-vermillion/40'
              : 'bg-ink-dark/50 border-l-2 border-l-gold/15'
          }`}>
            <div className="flex items-start gap-1.5">
              <span className="flex-shrink-0 mt-0.5">{HIGHLIGHT_ICONS[event.eventType] || '📋'}</span>
              <span className="text-[--text-primary] leading-relaxed">{event.narrative}</span>
            </div>
            <div className="text-[10px] text-[--text-dim] mt-1 pl-6 tracking-wider">
              第{event.round}回合
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
