/**
 * Combat: what your gear makes you, and what a blow does.
 *
 * Two separate jobs live here, and the game keeps them separate too. `calcCombat` turns what you
 * are carrying into the three numbers a fight actually uses. `resolveAttack` then decides whether a
 * blow lands and how hard.
 *
 * The most commonly misread rule in the game is which stat decides a miss. It is **Skill against
 * Skill** — Attack and Defence only size a blow that has already landed. The Java passes the two
 * Skill values into `agentAct` as parameters named `as` and `ds`, which reads like attack and
 * defence and is not. See `docs/gameplay.md`.
 */

import type { GameRandom } from "./random.js";

/** A weapon or piece of armour, with the traits that modify what it contributes. */
export interface Equipment {
  readonly attack: number;
  readonly defend: number;
  readonly skill: number;
  readonly enchant: number;
  readonly traits: ReadonlySet<string>;
}

/** Trait names, spelled as the game spells them. */
export const Trait = {
  RIGHT: "Right",
  FLAME: "Flame",
  BLESS: "Bless",
  LUCKY: "Lucky",
  GLOWS: "Glows",
  AGILE: "Agile",
  STRONG: "Strong",
  STURDY: "Sturdy",
  ALERT: "Alert",
  FENCER: "Fencer",
  REFLEX: "Reflex",
  BLIND: "Blind",
} as const;

/** What one item contributes to Attack, once its own traits are applied. */
export function itemAttack(item: Equipment): number {
  const flaming = item.traits.has(Trait.RIGHT) && item.traits.has(Trait.FLAME);
  return item.attack + (flaming ? 8 : 0) + Math.trunc((item.enchant + 9) / 10);
}

/** What one item contributes to Defence. Note the different rounding from Attack. */
export function itemDefend(item: Equipment): number {
  return item.defend + (item.traits.has(Trait.BLESS) ? 1 : 0) + Math.trunc((item.enchant + 4) / 10);
}

/** What one item contributes to Skill. Enchantment counts in full here, not a tenth. */
export function itemSkill(item: Equipment): number {
  let skill = item.skill;
  if (item.traits.has(Trait.RIGHT) && item.traits.has(Trait.LUCKY)) {
    skill += 12;
  }
  if (item.traits.has(Trait.GLOWS)) {
    skill += 2;
  }
  return skill + item.enchant;
}

/** The base stats and ranks `calcCombat` reads. */
export interface Combatant {
  readonly wits: number;
  readonly charm: number;
  readonly gear: readonly Equipment[];
  readonly fightRank: number;
  readonly magicRank: number;
  readonly thiefRank: number;
  readonly traits: ReadonlySet<string>;
}

export interface CombatStats {
  readonly attack: number;
  readonly defend: number;
  readonly skill: number;
}

/**
 * How much item there is to work magic on: `itArms.getPower()`.
 *
 * Attack counts triple and Defence double, so a weapon is "bigger" than armour of the same numbers.
 * Nothing in a fight reads this — it is what an enchantment is weighed against, and it is why a
 * great sword absorbs enchantments a knife cannot.
 */
export function itemPower(item: Equipment): number {
  const power = item.attack * 3 + item.defend * 2 + item.skill;
  return power < 1 ? 1 : power;
}

/** A ten percent bonus, rounded up — the shape the game uses for Agile, Strong and Sturdy. */
function tenPercentUp(value: number): number {
  return value + Math.trunc((value + 9) / 10);
}

/**
 * Turns carried gear, guild ranks and traits into the three combat numbers.
 *
 * Worth noticing: **Skill is mostly Wits and Charm**, weighted two to one, before gear is added at
 * all — whereas Attack and Defence come entirely from equipment and ranks. A hero with no weapon
 * still has Skill.
 */
export function calcCombat(c: Combatant): CombatStats {
  let skill = Math.trunc((c.wits * 2 + c.charm + 2) / 3);
  skill += c.gear.reduce((sum, item) => sum + itemSkill(item), 0) + c.magicRank;
  if (skill < 1) {
    skill = 1;
  }
  if (c.traits.has(Trait.AGILE)) {
    skill = tenPercentUp(skill);
  }

  let attack = c.gear.reduce((sum, item) => sum + itemAttack(item), 0) + c.fightRank;
  if (c.traits.has(Trait.STRONG)) {
    attack = tenPercentUp(attack);
  }

  let defend = c.gear.reduce((sum, item) => sum + itemDefend(item), 0) + c.thiefRank;
  if (c.traits.has(Trait.STURDY)) {
    defend = tenPercentUp(defend);
  }

  return { attack, defend, skill };
}

/** How badly a blow landed, in the order the game reports them. */
export enum Severity {
  Dodged = 0,
  Unharmed = 1,
  Scratched = 2,
  Injured = 3,
  Wounded = 4,
  Killed = 5,
}

export interface AttackInput {
  /** The attacker's Guts, after any action multiplier. */
  readonly guts: number;
  /** Swings this round, 0 to 4. */
  readonly swings: number;
  readonly attack: number;
  /** The attacker's Skill, after any bonus. */
  readonly attackerSkill: number;
  readonly defence: number;
  /** The defender's Skill, after any bonus. */
  readonly defenderSkill: number;
  /** The defender's Guts, which is their health pool. */
  readonly defenderGuts: number;
  /** Damage the defender has already taken. */
  readonly defenderWounds: number;
}

export interface AttackResult {
  readonly hit: boolean;
  /**
   * The raw figure the formula produced. **Can be negative**, when armour outweighs the blow, and
   * that is not the same as the wounds actually taken.
   */
  readonly damage: number;
  /**
   * What the defender actually loses. Zero for a blow that landed but did no harm: the game only
   * applies damage above the Unharmed band, so heavy armour absorbs a hit entirely rather than
   * healing the defender, which raw negative damage would do.
   */
  readonly woundsInflicted: number;
  readonly severity: Severity;
  readonly killed: boolean;
}

/**
 * Whether a blow lands.
 *
 * A miss is `roll(defenderSkill) > attackerSkill`. Because `roll(n)` tops out at `n - 1`, **once
 * your Skill is within one of theirs you cannot miss at all**, and below that you connect
 * `(yours + 1) / theirs` of the time. That plateau is deliberate 1997 behaviour and was kept: two
 * candidate fixes were measured against the harness and both rejected, for the reasons in
 * `docs/gameplay.md`.
 */
export function lands(attackerSkill: number, defenderSkill: number, rng: GameRandom): boolean {
  return rng.roll(defenderSkill) <= attackerSkill;
}

/**
 * Resolves one blow that has already been determined to land.
 *
 * Severity is scaled against the defender's *remaining* health, not their maximum, so the same
 * damage is worth more to something already hurt. Damage at or above what they have left kills
 * outright.
 */
export function resolveDamage(input: AttackInput): AttackResult {
  const damage = Math.trunc((input.guts * (2 + input.swings)) / 10) + input.attack - input.defence;
  const remaining = input.defenderGuts - input.defenderWounds;

  if (damage < 1) {
    return { hit: true, damage, woundsInflicted: 0, severity: Severity.Unharmed, killed: false };
  }
  if (damage >= remaining) {
    return {
      hit: true,
      damage,
      woundsInflicted: damage,
      severity: Severity.Killed,
      killed: true,
    };
  }
  // Bands 2..4: Scratched, Injured, Wounded. The division cannot reach 3 here because the
  // kill case above already took every blow at or beyond the defender's remaining health.
  const band: Severity = 2 + Math.trunc((3 * damage) / remaining);
  return { hit: true, damage, woundsInflicted: damage, severity: band, killed: false };
}

/** One blow, start to finish. */
export function resolveAttack(input: AttackInput, rng: GameRandom): AttackResult {
  if (!lands(input.attackerSkill, input.defenderSkill, rng)) {
    return { hit: false, damage: 0, woundsInflicted: 0, severity: Severity.Dodged, killed: false };
  }
  return resolveDamage(input);
}
