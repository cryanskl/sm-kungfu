'use client';

import { useEffect, useState, useRef } from 'react';
import { useWulinStore } from '@/stores/gameStore';

const EFFECT_CONFIG: Record<string, { emoji: string; label: string; colorClass: string }> = {
  divine_weapon: { emoji: '🌟', label: '天降神兵', colorClass: 'text-gold' },
  mysterious_npc: { emoji: '🧙', label: '高人指点', colorClass: 'text-purple-400' },
  mass_heal: { emoji: '💚', label: '全场回血', colorClass: 'text-emerald-400' },
};

export default function FullScreenEffect() {
  const influence = useWulinStore(s => s.gameState?.audienceInfluence);
  const [active, setActive] = useState<{ type: string; name: string } | null>(null);
  const lastTriggerRef = useRef<number>(0);

  useEffect(() => {
    const trigger = influence?.lastTrigger;
    if (!trigger || trigger.timestamp <= lastTriggerRef.current) return;
    lastTriggerRef.current = trigger.timestamp;

    const config = EFFECT_CONFIG[trigger.effectType];
    if (!config) return;

    setActive({ type: trigger.effectType, name: trigger.triggeredByName || '神秘人' });
    const timer = setTimeout(() => setActive(null), 3500);
    return () => clearTimeout(timer);
  }, [influence?.lastTrigger]);

  if (!active) return null;
  const cfg = EFFECT_CONFIG[active.type];

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
      <div className="text-center animate-bounce-in">
        <div className="text-6xl mb-2">{cfg.emoji}</div>
        <div className={`font-display text-3xl font-bold ${cfg.colorClass} animate-glow-text`}>
          {cfg.label}
        </div>
        <div className="text-sm text-gold/80 mt-1">
          触发者: {active.name}
        </div>
      </div>
    </div>
  );
}
