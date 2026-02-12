'use client';

import { RankEntry, HighlightEvent } from '@/lib/types';

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

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
      <h3 className="font-bold text-sm mb-3 flex items-center gap-1">
        <span>🏆</span> 上届英雄榜
      </h3>
      <div className="space-y-1">
        {entries.map((entry, i) => (
          <div key={entry.heroId} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm ${
            i === 0 ? 'bg-gradient-to-r from-yellow-600/20 to-transparent border-l-2 border-l-yellow-500' :
            i === 1 ? 'bg-gradient-to-r from-gray-400/10 to-transparent border-l-2 border-l-gray-400' :
            i === 2 ? 'bg-gradient-to-r from-orange-600/10 to-transparent border-l-2 border-l-orange-500' : ''
          }`}>
            <span className="w-6 text-center flex-shrink-0">
              {i < 3 ? RANK_MEDALS[i] : <span className="text-[--text-secondary] text-xs font-mono">{i + 1}</span>}
            </span>
            <span className={`flex-1 truncate ${i === 0 ? 'font-bold text-[--accent-gold]' : 'font-medium'}`}>
              {entry.heroName}
            </span>
            <span className="text-xs text-[--text-secondary]">[{entry.faction}]</span>
            <span className={`font-mono w-10 text-right text-xs ${i === 0 ? 'text-[--accent-gold] font-bold' : 'text-[--text-secondary]'}`}>
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
      <h3 className="font-bold text-sm mb-3 flex items-center gap-1">
        <span>📜</span> 上届大事记
      </h3>
      <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
        {events.map((event, i) => (
          <div key={i} className={`px-2 py-1.5 rounded-lg text-sm ${
            event.priority >= 7
              ? 'bg-red-900/15 border-l-2 border-l-red-500/60'
              : 'bg-[#1a1a2e]/50 border-l-2 border-l-[--accent-gold]/20'
          }`}>
            <div className="flex items-start gap-1.5">
              <span className="flex-shrink-0">{HIGHLIGHT_ICONS[event.eventType] || '📋'}</span>
              <span className="text-[--text-primary] leading-relaxed">{event.narrative}</span>
            </div>
            <div className="text-xs text-[--text-secondary] mt-0.5 pl-5">
              第{event.round}回合
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
