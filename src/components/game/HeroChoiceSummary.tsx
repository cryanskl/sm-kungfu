'use client';

interface HeroChoiceSummaryProps {
  heroName: string;
  chosenNames: string[];   // Names of chosen encounters
  wasAutoSelected: boolean; // Whether AI auto-selected for this hero
}

export function HeroChoiceSummary({ heroName, chosenNames, wasAutoSelected }: HeroChoiceSummaryProps) {
  if (chosenNames.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap mb-2">
      <span className="text-[10px] text-[--text-dim]">{heroName}的奇遇:</span>
      {chosenNames.map((name, i) => (
        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-gold/10 text-gold border border-gold/20 truncate max-w-[120px]">
          {name}
        </span>
      ))}
      {wasAutoSelected && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-light/10 text-[--text-dim] border border-ink-light/10">
          AI 代选
        </span>
      )}
    </div>
  );
}
