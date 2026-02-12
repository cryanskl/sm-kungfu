'use client';

import { useWulinStore } from '@/stores/gameStore';
import { soundManager } from '@/lib/sound';
import { bgmManager } from '@/lib/bgm';
import { useEffect } from 'react';

export function MuteToggle() {
  const isMuted = useWulinStore(s => s.isMuted);
  const toggleMute = useWulinStore(s => s.toggleMute);

  useEffect(() => {
    soundManager.muted = isMuted;
    bgmManager.muted = isMuted;
  }, [isMuted]);

  return (
    <button
      onClick={toggleMute}
      className="w-8 h-8 flex items-center justify-center rounded-lg
        bg-ink-dark border border-gold/15 hover:border-gold/30
        transition text-[--text-dim] hover:text-gold text-sm"
      title={isMuted ? '开启音效' : '静音'}
    >
      {isMuted ? '🔇' : '🔊'}
    </button>
  );
}
