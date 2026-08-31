/**
 * Paying a smith to make what you already carry a little better, over and over.
 *
 * ## Why this exists
 *
 * Marks had nowhere to go. Both gear shops together come to about three thousand, the region ladder
 * to forty and a half, and after that a long campaign simply accumulates.
 *
 * **This is the smaller of the two sinks, by a long way.** A point of Attack is worth having in the
 * middle of the game and is rounding error at the end of it: measured against Shangala, whose
 * creatures carry 500 Guts and 600 Skill, nineteen reforgings — three hundred and seventy thousand
 * Marks — moved a level-21 hero's win rate not at all. What reaches the far regions is
 * `training.ts`, which sells Guts and Wits. Reforging is what you spend on between here and there.
 *
 * ## Why it is not the enchanting scrolls
 *
 * The magic shop already sells a repeatable upgrade, and `readScroll` calls it "a gold sink with no
 * ceiling". It is not one in practice: a scroll is a flat hundred Marks, so no amount of wealth is
 * ever absorbed by buying more of them, and past the item's own power every further scroll can
 * destroy it outright.
 *
 * So the two are deliberately different bargains, and both stay:
 *
 * | | Enchanting scroll | Reforging |
 * |---|---|---|
 * | Costs | 100 Marks, flat | Half again as much every time |
 * | Risk | Destroys the item past its power | None |
 * | Gives | Skill, mostly | A flat point of Attack or Defence |
 *
 * The scroll is the cheap gamble you take early. Reforging is what a rich character does instead,
 * and because the price compounds it will take any amount of money you ever earn.
 *
 * These prices are **design judgement, not ported values** — the Java has no such service. See
 * `docs/porting-notes.md`.
 */

import type { CarriedArms } from "./hero.js";

/** What the first reforging costs. Roughly a good weapon, so it is a late-game decision. */
export const FORGE_BASE = 2000;

/** How much dearer each one is than the last. The levelling curve's shape, applied to money. */
export const FORGE_STEP = 1.5;

/** The two things a smith can do, and which shop does which. */
export const FORGE_SERVICES = {
  forged: { shop: "weapons", label: "Reforge", gives: "Attack" },
  tempered: { shop: "armour", label: "Temper", gives: "Defence" },
} as const;

export type ForgeService = keyof typeof FORGE_SERVICES;

/**
 * What the next one costs, given how many this item has already had.
 *
 * Truncated rather than rounded, matching `raiseFor` in `rules/levelling.ts`, so the two curves in
 * the game behave the same way where they meet.
 */
export function forgeCost(done: number): number {
  return Math.trunc(FORGE_BASE * Math.pow(FORGE_STEP, done));
}

/** How many times this item has had the given service. */
export function timesDone(item: CarriedArms, service: ForgeService): number {
  return service === "forged" ? item.forged : item.tempered;
}

/** The item after one more, which is the only way either count ever goes up. */
export function forged(item: CarriedArms, service: ForgeService): CarriedArms {
  return service === "forged"
    ? { ...item, forged: item.forged + 1 }
    : { ...item, tempered: item.tempered + 1 };
}

/** Why a smith would turn you away, or null if they would not. */
export function refusal(
  item: CarriedArms | null,
  service: ForgeService,
  marks: number,
): string | null {
  if (item === null) {
    return `You are not wearing anything for me to ${FORGE_SERVICES[service].label.toLowerCase()}.`;
  }
  const cost = forgeCost(timesDone(item, service));
  if (marks < cost) {
    return `That would be ${String(cost)} Marks, and you have ${String(marks)}.`;
  }
  return null;
}
