/**
 * Growing by doing.
 *
 * This is the half of progression the port was missing, and it is the half that makes a character
 * anyone's in particular. Levelling grants a flat +2 to all three stats however you play; **this**
 * grants a point of whichever stat you just used to win. Fight your way through and you toughen;
 * talk your way through and you get more persuasive.
 *
 * From `itHero.gainGuts` / `gainWits` / `gainCharm`, which are identical but for which stat they
 * touch — and which the original calls with a different weight for each way of winning.
 */

import type { GameRandom } from "./random.js";

/**
 * Whether a stat grows this time.
 *
 * `roll(current) < weight`, so the chance is `weight / current` — **diminishing returns built into
 * the shape**. A hero with 10 Guts and a weight of 5 grows half the time; the same hero at 60 Guts
 * grows one time in twelve. Nothing caps a stat, and nothing needs to: the curve does it.
 *
 * `weight` is what the win was worth, and the caller decides that. It carries the region's depth,
 * so the same victory teaches you more in the Mound than in the Fields.
 */
export function grows(current: number, weight: number, rng: GameRandom): boolean {
  if (weight <= 0) {
    return false;
  }
  // A stat at zero or below would make roll() meaningless; such a hero has everything to learn.
  if (current < 1) {
    return true;
  }
  return rng.roll(current) < weight;
}

/** Which stat a win teaches, and how strongly, from `arQuest.heroWins` and its siblings. */
export const GROWTH = {
  /** Berzerk: all-in, and the best way there is to toughen up. */
  BERZERK_GUTS: 5,
  /** Backstab teaches a little of both: the nerve and the timing. */
  BACKSTAB_GUTS: 2,
  BACKSTAB_CHARM: 3,
  /** An ordinary win, the slow way. */
  ATTACK_GUTS: 1,
  /** Winning without a fight teaches the stat that won it, and teaches it well. */
  HYPNOSIS_WITS: 5,
  SWINDLE_CHARM: 5,
} as const;
