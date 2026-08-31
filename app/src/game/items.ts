/**
 * Using what you are carrying.
 *
 * The 1997 game gives every piece of gear a numeric *effect*, and `arStatus.tryEffect` switches on
 * it. That table is already in the exported content, so the port reads the effect off the item
 * rather than keeping a second list of which potions do what — one less thing to drift.
 *
 * The amounts are `itAgent`'s, unchanged: a salve is fifteen points, an apple thirty, food two, and
 * a Medic gets more out of all three. They are worth keeping exact because they set how long a
 * fight can be sustained, which is the whole of the tactical game once a fight has started.
 */

import { noPending, type Fighter } from "../rules/battle.js";
import type { Content } from "./content.js";
import type { Carried } from "./hero.js";

/** The effect numbers this port implements, from `GearTypes`. */
export const Effect = {
  HEAL: 2,
  CURE: 3,
  BLIND: 4,
  PANIC: 5,
  BLAST: 6,
  REVIVE: 7,
  HASTE: 8,
  FOOD: 21,
} as const;

const IMPLEMENTED = new Set<number>(Object.values(Effect));

/** Effects that need something to throw them at. */
const NEEDS_A_TARGET = new Set<number>([Effect.BLIND, Effect.PANIC]);

/**
 * The gear-table categories, from `GearTypes`.
 *
 * Only needed to tell apart what is safe to sell in bulk from what emphatically is not: a stack of
 * gems is loot, a Map to Vortex is ten thousand Marks of progress.
 */
export const GearType = {
  JUNK: 0,
  MAP: 1,
  CAMP: 2,
  SUPPLY: 3,
  LOOT: 4,
  GEMS: 5,
  POTION: 6,
  SCROLL: 7,
  SPECIAL: 8,
  MONEY: 9,
} as const;

/**
 * Things that exist only to be turned into money: junk, trophies, gems.
 *
 * Deliberately a whitelist. A blacklist would sell somebody's Rutter for Shangala the first time a
 * new item type appeared, and they would not find out until they tried to sail.
 */
const SELLABLE_IN_BULK = new Set<number>([GearType.JUNK, GearType.LOOT, GearType.GEMS]);

export function typeOf(content: Content, name: string): number {
  return content.gear.get(name)?.type ?? -1;
}

/** Whether a bulk sell should include this, which is a question about safety, not about price. */
export function isBulkSellable(content: Content, item: Carried): boolean {
  if (item.kind === "arms") {
    return true;
  }
  return item.kind === "count" && SELLABLE_IN_BULK.has(typeOf(content, item.name));
}

export function effectOf(content: Content, name: string): number {
  return content.gear.get(name)?.effect ?? 0;
}

/** Whether this is something the player can use at all. */
export function isUsable(content: Content, item: Carried): boolean {
  return item.kind === "count" && item.count > 0 && IMPLEMENTED.has(effectOf(content, item.name));
}

/** Whether it can be used here — dust needs an enemy, a salve does not. */
export function isUsableHere(content: Content, item: Carried, inFight: boolean): boolean {
  if (!isUsable(content, item)) {
    return false;
  }
  const effect = effectOf(content, item.name);
  if (NEEDS_A_TARGET.has(effect) || effect === Effect.BLAST || effect === Effect.HASTE) {
    return inFight;
  }
  return true;
}

/** What using it would do, in a sentence, for the item description. */
export function describeUse(effect: number, medic: boolean): string {
  switch (effect) {
    case Effect.HEAL:
      return `Heals ${medic ? "25" : "15"} points of damage, or a ${medic ? "third" : "quarter"} of your Guts if that is more.`;
    case Effect.REVIVE:
      return `Heals ${medic ? "50" : "30"} points — ${medic ? "two thirds" : "half"} of your Guts if that is more — and clears what ails you.`;
    case Effect.FOOD:
      return `A small meal: heals ${medic ? "3" : "2"} points.`;
    case Effect.CURE:
      return "Clears disease, blindness and panic.";
    case Effect.BLIND:
      return "Thrown: may blind your enemy, halving what it can do.";
    case Effect.PANIC:
      return "Thrown: may send your enemy running, ending the fight.";
    case Effect.BLAST:
      return "Thrown: your next blow explodes for a flat 25 damage if that beats it.";
    case Effect.HASTE:
      return "Two extra swings on your next round.";
    default:
      return "Nothing you know how to use.";
  }
}

/**
 * What a draught is actually worth to this body.
 *
 * The 1997 numbers are flat — fifteen points from a salve, thirty from a Gold Apple — and a flat
 * heal stops meaning anything the moment a hero has two hundred Guts. Measured before this, every
 * healing item in the game was a *trap*: spending the round to drink one lowered both win rate and
 * survival in Hie Brasil and Shangala, because a round of fighting was worth more than the heal.
 *
 * So a draught mends the stated points **or a share of what you are made of, whichever is more**.
 * A starting hero is untouched by this — a quarter of 60 Guts is 15, exactly the flat figure — and
 * it keeps its meaning all the way out. The shares are design judgement, not ported values; see
 * `docs/porting-notes.md`.
 */
export function healingFor(fighter: Fighter, flat: number, share: number): number {
  const scaled = Math.trunc(fighter.guts / share);
  return scaled > flat ? scaled : flat;
}

function heal(fighter: Fighter, points: number): number {
  const before = fighter.wounds;
  fighter.wounds = Math.max(0, fighter.wounds - points);
  return before - fighter.wounds;
}

/** Clears everything a cure clears. Shared, because a Gold Apple cures as well as heals. */
function cure(fighter: Fighter): void {
  fighter.disease = 0;
  fighter.blinded = false;
  fighter.panicked = false;
}

export interface UseResult {
  /** True when the item was actually spent. */
  readonly used: boolean;
  /** What to write in the log. */
  readonly message: string;
}

/**
 * Applies an item's effect.
 *
 * Thrown dust does not act here: it is *queued* on the thrower and settled by the same code in
 * `battle.ts` that settles a blinding weapon, so a handful of dust and a cursed blade go through
 * one rule rather than two. That is how the original works, and it is why the contest gets stronger
 * the more you throw at once.
 */
export function useItem(
  effect: number,
  self: Fighter,
  foe: Fighter | null,
  medic: boolean,
  itemName: string,
): UseResult {
  switch (effect) {
    case Effect.HEAL: {
      const healed = heal(self, healingFor(self, medic ? 25 : 15, medic ? 3 : 4));
      return healed === 0
        ? { used: false, message: "You are unhurt — the salve would be wasted." }
        : { used: true, message: `You use the ${itemName} and recover ${String(healed)}.` };
    }
    case Effect.REVIVE: {
      const healed = heal(self, healingFor(self, medic ? 50 : 30, medic ? 1.5 : 2));
      const ailing = self.disease > 0 || self.blinded || self.panicked;
      if (healed === 0 && !ailing) {
        return { used: false, message: "You are already whole." };
      }
      cure(self);
      return { used: true, message: `You eat the ${itemName} and recover ${String(healed)}.` };
    }
    case Effect.FOOD: {
      const healed = heal(self, medic ? 3 : 2);
      return healed === 0
        ? { used: false, message: "You are not hurt enough to bother eating." }
        : { used: true, message: `You eat the ${itemName} and recover ${String(healed)}.` };
    }
    case Effect.CURE: {
      if (self.disease === 0 && !self.blinded && !self.panicked) {
        return { used: false, message: "Nothing ails you." };
      }
      cure(self);
      return { used: true, message: `The ${itemName} clears your head.` };
    }
    case Effect.HASTE: {
      self.bonusSwings += 2;
      return { used: true, message: `The ${itemName} quickens you — two extra swings.` };
    }
    case Effect.BLAST: {
      self.blastCharges += 1;
      return { used: true, message: `You ready the ${itemName}.` };
    }
    case Effect.BLIND:
    case Effect.PANIC: {
      if (foe === null) {
        return { used: false, message: "There is nothing here to throw it at." };
      }
      if (effect === Effect.BLIND) {
        self.pending.blind += 1;
      } else {
        self.pending.panic += 1;
      }
      return { used: true, message: `You fling the ${itemName} at ${foe.name}.` };
    }
    default:
      return { used: false, message: "You cannot think what to do with it." };
  }
}

/**
 * Clears what a fight leaves behind on a fighter.
 *
 * Blinding, panic and readied dust last one encounter; wounds and disease do not, and are the two
 * things carried out of it.
 */
export function endOfFight(fighter: Fighter): void {
  fighter.blinded = false;
  fighter.panicked = false;
  fighter.blastCharges = 0;
  fighter.bonusSwings = 0;
  fighter.pending = noPending();
}
