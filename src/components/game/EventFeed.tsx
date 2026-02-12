'use client';

import { useEffect, useRef } from 'react';
import { GameEvent } from '@/lib/types';

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
    champion: '🏆',
    title_award: '🎖️',
  };
  return icons[eventType] || '📋';
}

function getEventBg(event: Partial<GameEvent>): string {
  if (event.eventType === 'director_event') return 'bg-[--accent-gold]/10 border border-[--accent-gold]/30';
  if ((event.priority || 0) >= 7) return 'bg-red-900/20 border border-red-500/30';
  if ((event.priority || 0) >= 5) return 'bg-[#1a1a2e]';
  if ((event.priority || 0) >= 3) return 'bg-[#1a1a2e]/50';
  return 'bg-[#1a1a2e]/30';
}

export function EventFeed({ events, highlightLatest }: { events: Partial<GameEvent>[]; highlightLatest?: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastEventRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest event during reveal
  useEffect(() => {
    if (highlightLatest && lastEventRef.current) {
      lastEventRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [events.length, highlightLatest]);

  if (!events || events.length === 0) {
    return (
      <div className="text-center text-[--text-secondary] py-8">
        <div className="text-4xl mb-2">⚔️</div>
        <div>等待武林大会开始……</div>
      </div>
    );
  }

  // Chronological mode during reveal, priority-grouped when static
  if (highlightLatest) {
    return (
      <div ref={scrollRef} className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
        {events.map((event, i) => {
          const isLast = i === events.length - 1;
          return (
            <div
              key={`c-${i}`}
              ref={isLast ? lastEventRef : undefined}
              className={`p-3 rounded-lg animate-fade-in-up ${getEventBg(event)} ${
                isLast ? 'reveal-pulse border border-[--accent-gold]/60' : ''
              }`}
            >
              <div className={getEventClass(event.priority || 3)}>
                <span className="mr-1">{getEventIcon(event.eventType || '')}</span>
                {event.narrative}
              </div>
              {event.taunt && event.eventType !== 'director_event' && (
                <div className="mt-1 text-sm italic text-[--text-secondary]">
                  「{event.taunt}」
                </div>
              )}
              {event.innerThought && (
                <div className="mt-0.5 text-xs italic text-gray-500">
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
  const lowEvents = events.filter(e => (e.priority || 1) <= 2 && e.eventType !== 'director_event');
  const midEvents = events.filter(e => (e.priority || 1) > 2 && (e.priority || 1) <= 4);
  const highEvents = events.filter(e => (e.priority || 1) > 4 || e.eventType === 'director_event');

  return (
    <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
      {/* 高优先级事件 */}
      {highEvents.map((event, i) => (
        <div key={`h-${i}`} className={`p-3 rounded-lg animate-fade-in-up ${getEventBg(event)}`}
          style={{ animationDelay: `${i * 100}ms` }}>
          <div className={getEventClass(event.priority || 5)}>
            <span className="mr-1">{getEventIcon(event.eventType || '')}</span>
            {event.narrative}
          </div>
          {event.taunt && event.eventType !== 'director_event' && (
            <div className="mt-1 text-sm italic text-[--text-secondary]">
              「{event.taunt}」
            </div>
          )}
          {event.innerThought && (
            <div className="mt-0.5 text-xs italic text-gray-500">
              ({event.innerThought})
            </div>
          )}
        </div>
      ))}

      {/* 中优先级事件 */}
      {midEvents.map((event, i) => (
        <div key={`m-${i}`} className="px-3 py-2 rounded bg-[#1a1a2e]/50 animate-slide-in"
          style={{ animationDelay: `${(highEvents.length + i) * 80}ms` }}>
          <span className="event-mid">
            <span className="mr-1">{getEventIcon(event.eventType || '')}</span>
            {event.narrative}
          </span>
        </div>
      ))}

      {/* 低优先级合并 */}
      {lowEvents.length > 0 && (
        <div className="px-3 py-2 text-sm text-[--text-secondary] bg-[#1a1a2e]/30 rounded">
          {lowEvents.map(e => e.narrative).join('；')}
        </div>
      )}
    </div>
  );
}
