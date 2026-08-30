/**
 * How a hero advances.
 *
 * One number sets the pace of the whole game: what the next level costs. It is ported verbatim from
 * `itHero`, integer truncation included, because the curve steepens fast enough that rounding
 * differences compound over a campaign.
 *
 * The other half of `itHero`'s pacing — the daily quest allowance — is deliberately gone. See
 * `docs/porting-notes.md`.
 */

/** Stats every level grants, from `itHero.tryToLevel`. */
export const LEVEL_UP_STAT_GAIN = 2;

/**
 * Experience needed to reach the next level: `50 * 1.5^(level-1)`, truncated.
 *
 * 50, 75, 112, 168, 253 — it steepens quickly, which is why late levels are a grind. The truncation
 * is the Java cast, not a rounding choice; `Math.trunc` rather than `Math.floor` so a nonsensical
 * negative level would behave the same way rather than silently differing.
 */
export function raiseFor(level: number): number {
  return Math.trunc(50 * Math.pow(1.5, level - 1));
}

/** The outcome of trying to level up, and what it cost. */
export interface LevelResult {
  readonly levelled: boolean;
  readonly level: number;
  readonly exp: number;
  readonly statGain: number;
  readonly fameGain: number;
}

/**
 * One attempt to level up, matching `itHero.tryToLevel`.
 *
 * The experience cost is *subtracted* rather than reset to zero, so a big win can carry a surplus
 * into the next level. Fame gained is the new level, not a flat amount.
 */
export function tryToLevel(level: number, exp: number): LevelResult {
  const raise = raiseFor(level);
  if (exp < raise) {
    return { levelled: false, level, exp, statGain: 0, fameGain: 0 };
  }
  const newLevel = level + 1;
  return {
    levelled: true,
    level: newLevel,
    exp: exp - raise,
    statGain: LEVEL_UP_STAT_GAIN,
    fameGain: newLevel,
  };
}
