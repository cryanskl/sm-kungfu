'use client';

import { memo } from 'react';
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
  aggressive: 'text-vermillion-bright',
  cautious: 'text-[--accent-blue]',
  cunning: 'text-[--accent-purple]',
  random: 'text-gold-bright',
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

const FACTION_ACCENT: Record<string, string> = {
  '少林': 'border-l-amber-600/60',
  '武当': 'border-l-sky-600/60',
  '华山': 'border-l-red-700/60',
  '峨眉': 'border-l-violet-500/60',
  '逍遥': 'border-l-cyan-500/60',
  '丐帮': 'border-l-yellow-700/60',
  '魔教': 'border-l-fuchsia-600/60',
  '大理段氏': 'border-l-amber-500/60',
  '曼陀山庄': 'border-l-pink-500/60',
  '无门无派': 'border-l-stone-500/60',
};

const FACTION_GLOW: Record<string, string> = {
  '少林': 'rgba(217, 168, 67, 0.25)',
  '武当': 'rgba(93, 156, 181, 0.25)',
  '华山': 'rgba(184, 93, 93, 0.25)',
  '峨眉': 'rgba(155, 124, 184, 0.25)',
  '逍遥': 'rgba(93, 184, 168, 0.25)',
  '丐帮': 'rgba(184, 152, 96, 0.25)',
  '魔教': 'rgba(184, 93, 138, 0.25)',
  '大理段氏': 'rgba(201, 168, 76, 0.25)',
  '曼陀山庄': 'rgba(201, 122, 138, 0.25)',
  '无门无派': 'rgba(154, 144, 128, 0.2)',
};

export const HeroCard = memo(function HeroCard({ hero, compact = false, rank }: { hero: GameHeroSnapshot; compact?: boolean; rank?: number }) {
  const hpPercent = Math.max(0, (hero.hp / (hero.maxHp || 100)) * 100);
  const hpColor = hpPercent > 60 ? 'bg-jade' : hpPercent > 30 ? 'bg-gold' : 'bg-vermillion';
  const hpGlow = hpPercent > 60 ? '' : hpPercent > 30 ? 'shadow-[0_0_6px_var(--gold-glow)]' : 'shadow-[0_0_6px_var(--vermillion-glow)]';
  const emoji = PERSONALITY_EMOJI[hero.personalityType] || '🎲';
  const pColor = PERSONALITY_COLOR[hero.personalityType] || 'text-gold-bright';
  const fEmoji = FACTION_EMOJI[hero.faction] || '⚔️';
  const fAccent = FACTION_ACCENT[hero.faction] || 'border-l-stone-500/60';
  const fGlow = FACTION_GLOW[hero.faction] || 'rgba(201, 168, 76, 0.2)';

  if (compact) {
    return (
      <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border-l-2 transition-all duration-300 ${
        hero.isEliminated
          ? 'hero-card-eliminated bg-ink-dark/50 border-l-stone-700/30'
          : `card-wuxia card-hero-glow ${fAccent} hover:border-[--gold]/30`
      }`}
        style={hero.isEliminated ? undefined : { '--faction-glow': fGlow } as React.CSSProperties}
      >
        {rank != null && !hero.isEliminated ? (
          <span className={`flex-shrink-0 w-5 text-center font-display font-bold text-[11px] tabular-nums ${
            rank <= 3 ? 'text-gold' : 'text-[--text-dim]'
          }`}>{rank}</span>
        ) : (
          <span className="flex-shrink-0 w-5" />
        )}
        {hero.avatarUrl ? (
          <img src={hero.avatarUrl} alt="" className="w-6 h-6 rounded-full flex-shrink-0 object-cover ring-1 ring-ink-light/30" />
        ) : (
          <span className="text-lg flex-shrink-0 drop-shadow-sm">{fEmoji}</span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {rank === 1 && <span className="text-xs">👑</span>}
            <span className={`font-bold text-sm truncate ${hero.isEliminated ? 'text-[--text-dim] line-through' : ''}`}>
              {hero.heroName}
            </span>
            <span className={`text-xs ${pColor} opacity-80`}>{emoji}</span>
            {hero.hasDeathPact && <span className="text-[10px] opacity-70">📜</span>}
            {hero.allyHeroId && <span className="text-[10px] opacity-70">🤝</span>}
          </div>
          <div className="relative w-full h-2 bg-ink-medium rounded-full mt-1 overflow-hidden">
            <div className={`h-full rounded-full hp-bar ${hpColor} ${hpGlow} ${hpPercent < 30 ? 'hp-low' : ''}`}
                 style={{ width: `${hpPercent}%` }} />
            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-mono text-white/60 leading-none">
              {hero.hp}
            </span>
          </div>
        </div>
        <div className="text-right text-[11px] flex-shrink-0 space-y-0.5 tabular-nums">
          <div className="text-gold font-mono font-display">⚔{hero.reputation}</div>
          <div className="text-vermillion font-mono font-display">🔥{hero.hot}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`card-wuxia card-hero-glow p-4 transition-all duration-500 overflow-hidden ${
      hero.isEliminated ? 'hero-card-eliminated hero-eliminated' : ''
    }`}
      style={hero.isEliminated ? undefined : { '--faction-glow': fGlow } as React.CSSProperties}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-3">
        {hero.avatarUrl ? (
          <img src={hero.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-ink-light/30 flex-shrink-0" />
        ) : (
          <div className="text-3xl drop-shadow-sm">{fEmoji}</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-base tracking-wide flex items-center gap-1.5">
            {rank === 1 && <span className="text-sm">👑</span>}
            {hero.heroName}
          </div>
          <div className="text-xs text-[--text-secondary] flex items-center gap-1 mt-0.5">
            <span className="opacity-60">[{hero.faction}]</span>
            <span className="opacity-30">·</span>
            <span className={pColor}>{PERSONALITY_LABEL[hero.personalityType]}{emoji}</span>
          </div>
        </div>
        <div className="text-right">
          {hero.isEliminated && (
            <span className="text-vermillion text-xs font-bold tracking-wider">退场</span>
          )}
          {hero.isNpc && !hero.isEliminated && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-medium text-[--text-dim]">NPC</span>
          )}
        </div>
      </div>

      {/* HP Bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-[--text-dim] uppercase tracking-widest text-[10px]">HP</span>
          <span className={`tabular-nums ${hpPercent < 30 ? 'text-vermillion font-bold' : 'text-[--text-secondary]'}`}>
            {hero.hp}/{hero.maxHp || 100}
          </span>
        </div>
        <div className="w-full h-2 bg-ink-medium rounded-full overflow-hidden">
          <div className={`h-full rounded-full hp-bar ${hpColor} ${hpGlow} ${hpPercent < 30 ? 'hp-low' : ''}`}
               style={{ width: `${hpPercent}%` }} />
        </div>
      </div>

      {/* Divider */}
      <div className="divider-wuxia !my-2" />

      {/* Reputation / Hot */}
      <div className="flex gap-4 text-sm mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs">⚔️</span>
          <span className="text-[--text-dim] text-xs">声望</span>
          <span className="text-gold font-bold font-display tabular-nums">{hero.reputation}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs">🔥</span>
          <span className="text-[--text-dim] text-xs">热搜</span>
          <span className="text-vermillion font-bold font-display tabular-nums">{hero.hot}</span>
        </div>
      </div>

      {/* Six Attributes */}
      <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs mb-3">
        <AttrBar label="力" value={hero.strength} color="vermillion" />
        <AttrBar label="内" value={hero.innerForce} color="blue" />
        <AttrBar label="轻" value={hero.agility} color="jade" />
        <AttrBar label="体" value={hero.constitution} color="gold" />
        <AttrBar label="智" value={hero.wisdom} color="purple" />
        <AttrBar label="魅" value={hero.charisma} color="pink" />
      </div>

      {/* Status Tags */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {hero.hasDeathPact && (
          <span className="text-[11px] px-2 py-0.5 rounded-md bg-vermillion/10 text-vermillion border border-vermillion/20">
            📜 生死状
          </span>
        )}
        {hero.allyHeroId && (
          <span className="text-[11px] px-2 py-0.5 rounded-md bg-jade/10 text-jade border border-jade/20">
            🤝 有盟友
          </span>
        )}
        {hero.martialArts?.length > 0 && hero.martialArts.map((ma, i) => (
          <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-gold/10 text-gold border border-gold/20">
            🗡️ {ma.name}
          </span>
        ))}
      </div>

      {/* Catchphrase */}
      {hero.catchphrase && (
        <div className="text-xs italic text-[--text-dim] truncate border-t border-ink-medium pt-2 mt-1">
          「{hero.catchphrase}」
        </div>
      )}
    </div>
  );
});

function AttrBar({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    vermillion: 'bg-gradient-to-r from-vermillion/70 to-vermillion/40',
    blue: 'bg-gradient-to-r from-[--accent-blue]/70 to-[--accent-blue]/40',
    jade: 'bg-gradient-to-r from-jade/70 to-jade/40',
    gold: 'bg-gradient-to-r from-gold/70 to-gold/40',
    purple: 'bg-gradient-to-r from-[--accent-purple]/70 to-[--accent-purple]/40',
    pink: 'bg-gradient-to-r from-pink-500/60 to-pink-500/30',
  };
  const pct = Math.min(100, (value / 30) * 100);
  return (
    <div className="flex items-center gap-1">
      <span className="text-[--text-dim] w-3 font-display">{label}</span>
      <div className="flex-1 h-1.5 bg-ink-medium rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${colorMap[color] || 'bg-gray-500'}`}
             style={{ width: `${pct}%` }} />
      </div>
      <span className="w-4 text-right font-mono text-[10px] text-[--text-dim] tabular-nums">{value}</span>
    </div>
  );
}
