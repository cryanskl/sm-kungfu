'use client';

import { useState } from 'react';

interface InfluenceButtonProps {
  targetHeroId: string;
  targetHeroName: string;
  influenceUsed: boolean;
  onInfluence: (targetHeroId: string, effectType: 'buff' | 'debuff') => Promise<boolean>;
}

export function InfluenceButton({ targetHeroId, targetHeroName, influenceUsed, onInfluence }: InfluenceButtonProps) {
  const [showPanel, setShowPanel] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (influenceUsed) {
    return (
      <button disabled className="px-2 py-1.5 text-xs rounded-lg border border-ink-light/10 text-[--text-dim] opacity-50">
        已使用
      </button>
    );
  }

  const handleInfluence = async (effectType: 'buff' | 'debuff') => {
    setSubmitting(true);
    try {
      await onInfluence(targetHeroId, effectType);
      setShowPanel(false);
    } catch (e) {
      console.error('Influence failed:', e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="px-2 py-1.5 text-xs rounded-lg border border-gold/30 text-gold hover:bg-gold/10 transition-all"
        title="定向影响（整局一次）"
      >
        ⚡影响
      </button>

      {showPanel && (
        <div className="absolute bottom-full right-0 mb-2 w-48 p-3 rounded-lg border border-ink-light/20 bg-ink-deepest/95 backdrop-blur-sm shadow-lg z-50">
          <p className="text-xs text-[--text-secondary] mb-2">
            对 <span className="text-gold">{targetHeroName}</span> 施加影响
          </p>
          <p className="text-[10px] text-[--text-dim] mb-2">整局仅一次机会</p>
          <div className="space-y-1.5">
            <button
              onClick={() => handleInfluence('buff')}
              disabled={submitting}
              className="w-full px-2 py-1.5 text-xs rounded border border-jade/30 text-jade hover:bg-jade/10 disabled:opacity-40"
            >
              +10 气血或声望
            </button>
            <button
              onClick={() => handleInfluence('debuff')}
              disabled={submitting}
              className="w-full px-2 py-1.5 text-xs rounded border border-vermillion/30 text-vermillion hover:bg-vermillion/10 disabled:opacity-40"
            >
              -10 气血或声望
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
