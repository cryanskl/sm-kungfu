'use client';

import { useEffect, useRef, useState } from 'react';
import { GameEvent } from '@/lib/types';

function stableKey(event: Partial<GameEvent>, index: number): string {
  const parts = [event.heroId || '', event.eventType || '', event.narrative?.slice(0, 30) || '', String(index)];
  return parts.join(':');
}

function getEventClass(priority: number): string {
  if (priority <= 2) return 'event-low';
  if (priority <= 4) return 'event-mid';
  if (priority <= 6) return 'event-high';
  return 'event-critical';
}

function getEventIcon(eventType: string): string {
  const icons: Record<string, string> = {
    director_event: '📣',
    decision: '🤔',
    fight: '⚔️',
    betray: '🗡️',
    ally_formed: '🤝',
    train: '🧘',
    explore: '🗺️',
    rest: '💤',
    scramble: '💎',
    gang_up: '👊',
    eliminated: '💀',
    level_up: '⬆️',
    comeback: '🌟',
    hot_news: '🔥',
    speech: '🎤',
    encounter: '📜',
    champion: '🏆',
    title_award: '🎖️',
  };
  return icons[eventType] || '📋';
}

function getEventBg(event: Partial<GameEvent>): string {
  if (event.eventType === 'director_event') return 'bg-gold/[0.06] border-l-2 border-l-gold/40';
  if ((event.priority || 0) >= 7) return 'bg-vermillion/[0.06] border-l-2 border-l-vermillion/50';
  if ((event.priority || 0) >= 5) return 'bg-ink-dark/80 border-l-2 border-l-gold/20';
  if ((event.priority || 0) >= 3) return 'bg-ink-dark/50 border-l-2 border-l-ink-light/30';
  return 'bg-ink-dark/30';
}

export function EventFeed({ events, highlightLatest, activeReveal }: { events: Partial<GameEvent>[]; highlightLatest?: boolean; activeReveal?: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastEventRef = useRef<HTMLDivElement>(null);
  const [hasAnimated, setHasAnimated] = useState(false);
  const prevEventsLenRef = useRef(0);

  useEffect(() => {
    if (!highlightLatest && events.length > 0 && prevEventsLenRef.current === 0) {
      setHasAnimated(false);
      const timer = setTimeout(() => setHasAnimated(true), events.length * 100 + 500);
      return () => clearTimeout(timer);
    }
    prevEventsLenRef.current = events.length;
  }, [events.length, highlightLatest]);

  useEffect(() => {
    if (highlightLatest && lastEventRef.current) {
      lastEventRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [events.length, highlightLatest]);

  // 过滤掉 decision 类型事件（纯宣言，已在其他事件中体现）
  const filtered = events.filter(e => e.eventType !== 'decision');

  if (!filtered || filtered.length === 0) {
    return (
      <div className="text-center text-[--text-dim] py-10">
        <div className="text-4xl mb-3 animate-breathe opacity-60">⚔️</div>
        <div className="font-display text-sm">等待武林大会开始……</div>
      </div>
    );
  }

  // Chronological mode during reveal
  if (highlightLatest) {
    return (
      <div ref={scrollRef} className="space-y-2 max-h-[600px] overflow-y-auto pr-2 scroll-fade">
        {filtered.map((event, i) => {
          const isLast = i === filtered.length - 1;
          return (
            <div
              key={`c-${i}`}
              ref={isLast ? lastEventRef : undefined}
              className={`p-3 rounded-lg animate-fade-in-up ${getEventBg(event)} ${
                isLast && activeReveal ? 'reveal-pulse ring-1 ring-gold/40' : ''
              }`}
            >
              <div className={getEventClass(event.priority || 3)}>
                <span className="mr-1.5 inline-block">{getEventIcon(event.eventType || '')}</span>
                {event.narrative}
              </div>
              {event.taunt && event.eventType !== 'director_event' && (
                <div className="mt-1.5 text-sm italic text-[--text-secondary] pl-6">
                  「{event.taunt}」
                </div>
              )}
              {event.innerThought && (
                <div className="mt-0.5 text-xs italic text-[--text-dim] pl-6">
                  ({event.innerThought})
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Static mode: priority-grouped layout
  const lowEvents = filtered.filter(e => (e.priority || 1) <= 2 && e.eventType !== 'director_event');
  const midEvents = filtered.filter(e => (e.priority || 1) > 2 && (e.priority || 1) <= 4);
  const highEvents = filtered.filter(e => (e.priority || 1) > 4 || e.eventType === 'director_event');

  const shouldAnimate = !hasAnimated;

  return (
    <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2 scroll-fade">
      {/* High priority events */}
      {highEvents.map((event, i) => (
        <div key={stableKey(event, i)}
          className={`p-3 rounded-lg ${shouldAnimate ? 'animate-fade-in-up' : ''} ${getEventBg(event)}`}
          style={shouldAnimate ? { animationDelay: `${i * 100}ms` } : undefined}>
          <div className={getEventClass(event.priority || 5)}>
            <span className="mr-1.5 inline-block">{getEventIcon(event.eventType || '')}</span>
            {event.narrative}
          </div>
          {event.taunt && event.eventType !== 'director_event' && (
            <div className="mt-1.5 text-sm italic text-[--text-secondary] pl-6">
              「{event.taunt}」
            </div>
          )}
          {event.innerThought && (
            <div className="mt-0.5 text-xs italic text-[--text-dim] pl-6">
              ({event.innerThought})
            </div>
          )}
        </div>
      ))}

      {/* Mid priority events */}
      {midEvents.map((event, i) => (
        <div key={stableKey(event, highEvents.length + i)}
          className={`px-3 py-2.5 rounded-lg bg-ink-dark/50 border-l-2 border-l-ink-light/20 ${shouldAnimate ? 'animate-slide-in' : ''}`}
          style={shouldAnimate ? { animationDelay: `${(highEvents.length + i) * 80}ms` } : undefined}>
          <span className="event-mid">
            <span className="mr-1.5 inline-block">{getEventIcon(event.eventType || '')}</span>
            {event.narrative}
          </span>
        </div>
      ))}

      {/* Low priority — collapsed */}
      {lowEvents.length > 0 && (
        <div className="px-3 py-2 text-sm text-[--text-dim] bg-ink-dark/20 rounded-lg border-l-2 border-l-transparent">
          {lowEvents.map(e => e.narrative).join('；')}
        </div>
      )}
    </div>
  );
}
