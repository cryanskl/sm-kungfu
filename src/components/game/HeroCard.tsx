'use client';

import { GameHeroSnapshot } from '@/lib/types';

const PERSONALITY_EMOJI: Record<string, string> = {
  aggressive: '🔥',
  cautious: '🛡️',
  cunning: '🎭',
  random: '🎲',
};

const PERSONALITY_LABEL: Record<string, string> = {
  aggressive: '好战',
  cautious: '谨慎',
  cunning: '腹黑',
  random: '随性',
};

const PERSONALITY_COLOR: Record<string, string> = {
  aggressive: 'text-red-400',
  cautious: 'text-blue-400',
  cunning: 'text-purple-400',
  random: 'text-yellow-400',
};

const FACTION_EMOJI: Record<string, string> = {
  '少林': '🏛️',
  '武当': '☯️',
  '华山': '⛰️',
  '峨眉': '🌙',
  '逍遥': '🌊',
  '丐帮': '🥢',
  '魔教': '🔮',
  '大理段氏': '👑',
  '曼陀山庄': '🌸',
  '无门无派': '🗡️',
};

export function HeroCard({ hero, compact = false }: { hero: GameHeroSnapshot; compact?: boolean }) {
  const hpPercent = Math.max(0, (hero.hp / (hero.maxHp || 100)) * 100);
  const hpColor = hpPercent > 60 ? 'bg-green-500' : hpPercent > 30 ? 'bg-yellow-500' : 'bg-red-500';
  const emoji = PERSONALITY_EMOJI[hero.personalityType] || '🎲';
  const pColor = PERSONALITY_COLOR[hero.personalityType] || 'text-yellow-400';
  const fEmoji = FACTION_EMOJI[hero.faction] || '⚔️';

  if (compact) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300 ${
        hero.isEliminated
          ? 'opacity-30 bg-gray-900/50 line-through'
          : 'card-wuxia hover:border-[--accent-gold]/40'
      }`}>
        <span className="text-base flex-shrink-0">{fEmoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className={`font-bold text-sm truncate ${hero.isEliminated ? 'text-gray-500' : ''}`}>
              {hero.heroName}
            </span>
            <span className={`text-xs ${pColor}`}>{emoji}</span>
            {hero.hasDeathPact && <span className="text-xs">📜</span>}
            {hero.allyHeroId && <span className="text-xs">🤝</span>}
          </div>
          <div className="w-full h-1.5 bg-gray-800 rounded-full mt-0.5 overflow-hidden">
            <div className={`h-full rounded-full hp-bar ${hpColor} ${hpPercent < 30 ? 'hp-low' : ''}`}
                 style={{ width: `${hpPercent}%` }} />
          </div>
        </div>
        <div className="text-right text-xs flex-shrink-0 space-y-0.5">
          <div className="text-[--accent-gold] font-mono">⚔{hero.reputation}</div>
          <div className="text-red-400 font-mono">🔥{hero.hot}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`card-wuxia p-4 transition-all duration-300 ${
      hero.isEliminated ? 'opacity-30 grayscale' : ''
    }`}>
      {/* 头部 */}
      <div className="flex items-center gap-2 mb-3">
        <div className="text-2xl">{fEmoji}</div>
        <div className="flex-1">
          <div className="font-bold text-base">{hero.heroName}</div>
          <div className="text-xs text-[--text-secondary] flex items-center gap-1">
            [{hero.faction}] · <span className={pColor}>{PERSONALITY_LABEL[hero.personalityType]}{emoji}</span>
          </div>
        </div>
        <div className="text-right">
          {hero.isEliminated && <span className="text-red-500 text-xs font-bold">💀 退场</span>}
          {hero.isNpc && !hero.isEliminated && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">NPC</span>
          )}
        </div>
      </div>

      {/* HP 条 */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-[--text-secondary]">HP</span>
          <span className={hpPercent < 30 ? 'text-red-400 font-bold' : ''}>{hero.hp}/{hero.maxHp || 100}</span>
        </div>
        <div className="w-full h-2.5 bg-gray-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full hp-bar ${hpColor} ${hpPercent < 30 ? 'hp-low' : ''}`}
               style={{ width: `${hpPercent}%` }} />
        </div>
      </div>

      {/* 声望 / Hot */}
      <div className="flex gap-4 text-sm mb-3">
        <div className="flex items-center gap-1">
          <span>⚔️</span>
          <span className="text-[--text-secondary] text-xs">声望</span>
          <span className="text-[--accent-gold] font-bold">{hero.reputation}</span>
        </div>
        <div className="flex items-center gap-1">
          <span>🔥</span>
          <span className="text-[--text-secondary] text-xs">热搜</span>
          <span className="text-red-400 font-bold">{hero.hot}</span>
        </div>
      </div>

      {/* 六维属性 */}
      <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs mb-3">
        <AttrBar label="力" value={hero.strength} color="red" />
        <AttrBar label="内" value={hero.innerForce} color="blue" />
        <AttrBar label="轻" value={hero.agility} color="green" />
        <AttrBar label="体" value={hero.constitution} color="yellow" />
        <AttrBar label="智" value={hero.wisdom} color="purple" />
        <AttrBar label="魅" value={hero.charisma} color="pink" />
      </div>

      {/* 状态标签 */}
      <div className="flex flex-wrap gap-1 mb-2">
        {hero.hasDeathPact && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/30 text-red-400 border border-red-500/20">📜 生死状</span>
        )}
        {hero.allyHeroId && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400 border border-blue-500/20">🤝 有盟友</span>
        )}
        {hero.martialArts?.length > 0 && hero.martialArts.map((ma, i) => (
          <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-[--accent-gold]/10 text-[--accent-gold] border border-[--accent-gold]/20">
            🗡️ {ma.name}
          </span>
        ))}
      </div>

      {/* 口头禅 */}
      {hero.catchphrase && (
        <div className="text-xs italic text-[--text-secondary] truncate border-t border-gray-800 pt-2 mt-1">
          「{hero.catchphrase}」
        </div>
      )}
    </div>
  );
}

function AttrBar({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    red: 'bg-red-500/60',
    blue: 'bg-blue-500/60',
    green: 'bg-green-500/60',
    yellow: 'bg-yellow-500/60',
    purple: 'bg-purple-500/60',
    pink: 'bg-pink-500/60',
  };
  const pct = Math.min(100, (value / 30) * 100);
  return (
    <div className="flex items-center gap-1">
      <span className="text-[--text-secondary] w-3">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colorMap[color] || 'bg-gray-500'}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-4 text-right font-mono text-[--text-secondary]">{value}</span>
    </div>
  );
}
