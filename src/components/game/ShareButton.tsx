'use client';

import { useState, useCallback } from 'react';
import { useWulinStore } from '@/stores/gameStore';
import { generateBattleReport } from '@/lib/game/battle-report';

export function ShareButton() {
  const gameState = useWulinStore(s => s.gameState);
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    if (!gameState) return;
    const report = generateBattleReport(gameState);
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = report;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [gameState]);

  return (
    <button
      onClick={handleShare}
      className="btn-gold text-sm px-6 py-2 inline-flex items-center gap-2"
    >
      {copied ? '✅ 已复制战报' : '📋 分享战报'}
    </button>
  );
}
