/**
 * Turning a monster definition into something that can fight you.
 *
 * A monster in the content is a template, not an opponent. Meeting one scales it to your level,
 * scatters its stats so no two encounters are identical, works out what it is worth, and decides
 * how aggressive it starts out. That is `balance`, and it happens once when the quest begins.
 */

import { State, type Fighter } from "../rules/battle.js";
import type { GameRandom } from "../rules/random.js";
import type { MonsterDefinition } from "./content.js";

/**
 * A random spread around a value: at least five sevenths of it, plus a triangular roll on the rest.
 *
 * This is why the same monster is never quite the same twice. Note it can only go *up* from the
 * floor, so the average lands above the template value rather than on it.
 */
export function spread(value: number, rng: GameRandom): number {
  const min = Math.trunc((value * 5) / 7);
  return 1 + min + rng.twice(value - min);
}

/** How ready a monster is to fight, and what it will do about it. */
export const Stance = {
  PASSIVE: 0,
  TIMID: 1,
  DEFENSIVE: 2,
  HOSTILE: 3,
  AGGRESSIVE: 4,
} as const;

/** The starting stance for a passion, defaulting to defensive as the Java does. */
export function stanceFor(passion: string): number {
  switch (passion) {
    case "aggressive":
      return Stance.AGGRESSIVE;
    case "hostile":
      return Stance.HOSTILE;
    case "timid":
      return Stance.TIMID;
    case "passive":
      return Stance.PASSIVE;
    case "defensive":
      return Stance.DEFENSIVE;
    default:
      return Stance.DEFENSIVE;
  }
}

export interface Monster extends Fighter {
  readonly key: string;
  /** Rises each round for hostile and defensive monsters, which is how a fight escalates. */
  stance: number;
  readonly options: readonly string[];
  /** What killing it is worth. */
  readonly experience: number;
  readonly fame: number;
}

/**
 * Builds the opponent you actually meet.
 *
 * Scaling is by **level only, not by gear**: a monster tracks how experienced you are and ignores
 * how well equipped you are, so every area gets easier as you buy armour. That is 1997 behaviour
 * and is deliberate here — see `docs/gameplay.md`.
 *
 * The `adjust` flag on eight monsters, which was meant to scale them to your power rather than your
 * level, is not implemented, because it never worked in the original and cannot be made to work
 * against a linear damage rule. It was enabled and measured; those monsters became unkillable.
 */
export function balance(
  def: MonsterDefinition,
  heroLevel: number,
  weight: number,
  rng: GameRandom,
): Monster {
  const ratio = 0.9 + heroLevel * 0.1;
  const guts = spread(Math.trunc(def.guts * ratio), rng);
  const wits = spread(Math.trunc(def.wits * ratio), rng);
  const charm = spread(Math.trunc(def.charm * ratio), rng);

  const attack = def.baseAttack;
  const defend = def.baseDefend;
  const skill = def.baseSkill;

  return {
    key: def.key,
    name: def.name,
    guts,
    wits,
    charm,
    attack,
    defend,
    skill,
    wounds: 0,
    state: State.ALIVE,
    action: "Attack",
    traits: new Set<string>(),
    blastCharges: 0,
    disease: 0,
    stance: stanceFor(def.passion),
    options: def.options,
    experience: Math.trunc(((1 + attack + defend) * (100 + skill)) / 100),
    fame: Math.trunc((guts + wits + charm) / 30) + Math.trunc(weight / 4),
  };
}

/** A fight escalates: hostile and defensive monsters get angrier each round. */
export function advanceStance(monster: Monster): void {
  if (monster.stance === Stance.HOSTILE || monster.stance === Stance.DEFENSIVE) {
    monster.stance++;
  }
}

/**
 * What the monster does this round.
 *
 * Only an aggressive monster attacks unprompted; anything calmer waits, which is what makes talking
 * your way past one possible at all.
 */
export function chooseMonsterAction(monster: Monster, rng: GameRandom): string {
  if (monster.stance < Stance.HOSTILE) {
    return "Wait";
  }
  // A monster with tricks available uses one now and then rather than always swinging.
  if (monster.options.length > 0 && rng.percent(20)) {
    return rng.select(monster.options);
  }
  return "Attack";
}
