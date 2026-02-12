'use client';

import { useWulinStore } from '@/stores/gameStore';
import { soundManager } from '@/lib/sound';
import { useEffect } from 'react';

export function MuteToggle() {
  const isMuted = useWulinStore(s => s.isMuted);
  const toggleMute = useWulinStore(s => s.toggleMute);

  useEffect(() => {
    soundManager.muted = isMuted;
  }, [isMuted]);

  return (
    <button
      onClick={toggleMute}
      className="px-2 py-1 text-sm rounded bg-[--bg-card] border border-[--accent-gold]/20
        hover:border-[--accent-gold]/40 transition text-[--text-secondary]"
      title={isMuted ? '开启音效' : '静音'}
    >
      {isMuted ? '🔇' : '🔊'}
    </button>
  );
}
