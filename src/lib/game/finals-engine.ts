// 共享决赛引擎：getFinalsMove 供 finals/route.ts 和 final/route.ts 共用
import { finalsPrompt } from '@/lib/game/prompts';
import { SecondMeClient } from '@/lib/game/secondme-client';
import { NPC_TEMPLATES } from '@/lib/game/npc-data/templates';
import { INITIAL_HP } from '@/lib/game/constants';
import type { FinalsMove } from '@/lib/types';

const VALID_MOVES: FinalsMove[] = ['attack', 'defend', 'ultimate', 'bluff'];

export async function getFinalsMove(gh: any, opponentName: string): Promise<{ move: FinalsMove; taunt: string }> {
  const hero = gh.hero;

  if (hero.is_npc) {
    const template = NPC_TEMPLATES.find(t => t.id === hero.npc_template_id);
    let move: FinalsMove;
    if (template) {
      if (template.alwaysFightStrongest) move = 'attack';
      else if (template.neverFight) move = Math.random() < 0.6 ? 'defend' : 'bluff';
      else if (template.personalityType === 'aggressive') move = Math.random() < 0.5 ? 'attack' : 'ultimate';
      else if (template.personalityType === 'cautious') move = Math.random() < 0.5 ? 'defend' : 'attack';
      else if (template.personalityType === 'cunning') move = Math.random() < 0.4 ? 'bluff' : 'attack';
      else move = VALID_MOVES[Math.floor(Math.random() * VALID_MOVES.length)];
    } else {
      move = VALID_MOVES[Math.floor(Math.random() * VALID_MOVES.length)];
    }
    const taunt = template?.signatureLines?.[Math.floor(Math.random() * (template?.signatureLines?.length || 1))] || '……';
    return { move, taunt };
  }

  // 真人：调 SecondMe
  try {
    const client = new SecondMeClient(hero.access_token || '');
    const prompt = finalsPrompt({
      heroId: gh.hero_id,
      heroName: hero.hero_name,
      faction: hero.faction,
      personalityType: hero.personality_type,
      hp: gh.hp,
      maxHp: INITIAL_HP,
      seatNumber: gh.seat_number,
      reputation: gh.reputation || 0,
      hot: gh.hot || 0,
      morality: gh.morality || 50,
      credit: gh.credit || 50,
      isEliminated: false,
      allyHeroId: null,
      allyHeroName: null,
      martialArts: gh.martial_arts || [],
      hasDeathPact: gh.has_death_pact || false,
      isNpc: false,
      catchphrase: hero.catchphrase || '',
      avatarUrl: hero.avatar_url,
      strength: hero.strength,
      innerForce: hero.inner_force,
      agility: hero.agility,
      wisdom: hero.wisdom,
      constitution: hero.constitution,
      charisma: hero.charisma,
    }, opponentName);

    const raw = await client.act(prompt);
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (VALID_MOVES.includes(parsed.move)) {
          return { move: parsed.move, taunt: parsed.taunt || '……' };
        }
      }
    } catch { /* fallback */ }
    const moveMatch = raw.match(/"move"\s*:\s*"(\w+)"/);
    if (moveMatch && VALID_MOVES.includes(moveMatch[1] as FinalsMove)) {
      const tauntMatch = raw.match(/"taunt"\s*:\s*"([^"]+)"/);
      return { move: moveMatch[1] as FinalsMove, taunt: tauntMatch?.[1] || '……' };
    }
  } catch { /* fallback */ }

  return { move: VALID_MOVES[Math.floor(Math.random() * VALID_MOVES.length)], taunt: '……' };
}
