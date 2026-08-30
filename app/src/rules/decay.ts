/**
 * Gear wearing out, ported from `itArms.decay`.
 *
 * Every swing risks damaging what you are holding, and the amount lost scales with how good the
 * item is — a plain knife loses one point, a great sword loses more. Getting this wrong shifts the
 * whole economy, because gear replacement is most of what money is for.
 */

import type { GameRandom } from "./random.js";

/** An item's three combat numbers. Nothing else decays. */
export interface Wearable {
  attack: number;
  defend: number;
  skill: number;
  enchant: number;
}

export interface DecayResult {
  /** True if the item took damage this time. */
  readonly decayed: boolean;
  /** True if it also lost one of its special traits. */
  readonly lostTrait: boolean;
  /** Which trait slot was lost, as an offset from the first visible trait. */
  readonly lostTraitOffset: number | null;
}

/**
 * How much a single stat drops.
 *
 * The shape is odd and is preserved exactly: at or below 1 it loses `1 - value/12`, above 1 it
 * loses `1 + value/12`. Both divisions truncate. The first branch means a stat already at zero
 * loses a further point and goes negative, which the game does allow — cursed items live there.
 */
export function decayStep(value: number): number {
  return value <= 1 ? 1 - Math.trunc(value / 12) : 1 + Math.trunc(value / 12);
}

/**
 * The trait slots a decay can strip, as indices into the game's trait table.
 *
 * The table runs Head, Body, Feet, Right, Left, Decay, Secret, Cursed, Curse, Glows, Flame, Bless,
 * Lucky, Disease, Blind, Panic, Blast, Enchant. Only the range from Curse up to Enchant is
 * eligible, which is why the span is nine and not the whole table: the slots below it describe
 * where an item is worn, and losing one of those would unequip it rather than wear it out.
 */
export const VISIBLE_TRAIT = 8;
export const ENCHANT_TRAIT = 17;

/** How many trait slots a decay may strip from. */
export const TRAIT_SPAN = ENCHANT_TRAIT - VISIBLE_TRAIT;

/**
 * Wears an item by one use.
 *
 * `rate` is how unlikely damage is: one in `rate`, floored at one in two however small it is asked
 * to be. The mutation is in place, matching the Java, so the caller sees the reduced item.
 *
 * The trait loss is a second, rarer roll — one in twelve of the times an item decays at all — and
 * it also strips a fifth of any enchantment, rounded up.
 *
 */
export function decay(
  item: Wearable,
  rate: number,
  rng: GameRandom,
  traitSpan: number = TRAIT_SPAN,
): DecayResult {
  const effective = rate < 2 ? 2 : rate;
  if (rng.roll(effective) > 0) {
    return { decayed: false, lostTrait: false, lostTraitOffset: null };
  }

  item.attack -= decayStep(item.attack);
  item.defend -= decayStep(item.defend);
  item.skill -= decayStep(item.skill);

  if (rng.roll(12) !== 0) {
    return { decayed: true, lostTrait: false, lostTraitOffset: null };
  }

  const offset = rng.roll(traitSpan);
  item.enchant -= Math.trunc((item.enchant + 4) / 5);
  return { decayed: true, lostTrait: true, lostTraitOffset: offset };
}
