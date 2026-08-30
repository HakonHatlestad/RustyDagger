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
      return `Heals ${medic ? "25" : "15"} points of damage.`;
    case Effect.REVIVE:
      return `Heals ${medic ? "50" : "30"} points and clears what ails you.`;
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
      const healed = heal(self, medic ? 25 : 15);
      return healed === 0
        ? { used: false, message: "You are unhurt — the salve would be wasted." }
        : { used: true, message: `You use the ${itemName} and recover ${String(healed)}.` };
    }
    case Effect.REVIVE: {
      const healed = heal(self, medic ? 50 : 30);
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
