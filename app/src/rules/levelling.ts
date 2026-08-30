/**
 * How a hero advances.
 *
 * Two numbers set the pace of the whole game: what the next level costs, and how many quests a day
 * buys you. Both are ported verbatim from `itHero`, including the integer truncation, because the
 * curve steepens fast enough that rounding differences compound.
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

/**
 * The day's quest allowance before anything is spent: `27 + 3 * level`, or four per level with the
 * Quick trait.
 */
export function baseQuests(level: number, quick = false): number {
  return quick ? 27 + 4 * level : 27 + 3 * level;
}

/**
 * How many quests a hero actually has.
 *
 * Overload always costs, because carrying too much slows you down whatever the day's ration.
 * Fatigue only counts when the daily limit is switched on, which this port leaves off — see
 * `docs/porting-notes.md`.
 */
export function questsAvailable(options: {
  level: number;
  quick?: boolean;
  fatigue?: number;
  overload?: number;
  dailyQuestLimit?: boolean;
}): number {
  const { level, quick = false, fatigue = 0, overload = 0, dailyQuestLimit = false } = options;
  const spent = dailyQuestLimit ? fatigue : 0;
  return baseQuests(level, quick) - spent - overload;
}

/** How far a pack is over its limit; zero when it is not. */
export function overloadOf(packCount: number, packMax: number): number {
  return packCount > packMax ? packCount - packMax : 0;
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
