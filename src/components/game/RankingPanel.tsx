'use client';

import { RankEntry } from '@/lib/types';

const RANK_MEDALS = ['🥇', '🥈', '🥉'];
const RANK_COLORS = [
  'bg-gradient-to-r from-yellow-600/20 to-transparent border-l-2 border-l-yellow-500',
  'bg-gradient-to-r from-gray-400/10 to-transparent border-l-2 border-l-gray-400',
  'bg-gradient-to-r from-orange-600/10 to-transparent border-l-2 border-l-orange-500',
];

export function RankingPanel({ title, icon, entries, highlight }: {
  title: string;
  icon: string;
  entries: RankEntry[];
  highlight?: number;
}) {
  return (
    <div className="card-wuxia p-4">
      <h3 className="font-bold text-sm mb-3 flex items-center gap-1">
        <span>{icon}</span> {title}
        {highlight && <span className="text-xs text-[--text-secondary] ml-auto">前{highlight}进四强</span>}
      </h3>
      <div className="space-y-1">
        {entries.slice(0, 8).map((entry, i) => (
          <div key={entry.heroId} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-all ${
            i < 3 ? RANK_COLORS[i] :
            highlight && i < highlight ? 'bg-[--accent-gold]/5 border-l-2 border-l-[--accent-gold]/40' : ''
          }`}>
            <span className="w-6 text-center flex-shrink-0">
              {i < 3 ? RANK_MEDALS[i] : <span className="text-[--text-secondary] text-xs font-mono">{i + 1}</span>}
            </span>
            <span className={`flex-1 truncate ${i === 0 ? 'font-bold text-[--accent-gold]' : 'font-medium'}`}>
              {entry.heroName}
            </span>
            <span className="text-xs text-[--text-secondary]">[{entry.faction}]</span>
            <span className={`font-mono w-10 text-right ${i === 0 ? 'text-[--accent-gold] font-bold' : 'text-[--text-secondary]'}`}>
              {entry.value}
            </span>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="text-center text-[--text-secondary] text-sm py-4">暂无数据</div>
        )}
      </div>
    </div>
  );
}
