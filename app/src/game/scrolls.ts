/**
 * Scrolls: the only way to make a weapon better than the one you found.
 *
 * Six of them exist in the content and none of them did anything, which left gold with nowhere to
 * go. Everything both shops sell adds up to about three thousand Marks; the best weapon in the game
 * is worth forty-one thousand and cannot be bought at all. Scrolls are what connects the two — you
 * cannot buy the good sword, but you can improve the one you have, for as long as you can pay.
 *
 * Every trait a scroll grants is one `rules/combat.ts` already reads. This adds no new combat rule
 * whatsoever; it adds a way to reach the rules that were already there.
 */

import { itemPower, type Equipment } from "../rules/combat.js";
import type { GameRandom } from "../rules/random.js";
import type { Content } from "./content.js";
import type { CarriedArms } from "./hero.js";
import { effectOf } from "./items.js";

/** The scroll effect numbers, from `GearTypes`. */
export const Scroll = {
  IDENTIFY: 1,
  GLOW: 15,
  BLESS: 16,
  LUCK: 17,
  FLAME: 18,
  ENCHANT: 19,
} as const;

/** What each scroll leaves behind, as the lower-case trait the content and the port both use. */
const GRANTS: Readonly<Record<number, string>> = {
  [Scroll.GLOW]: "glows",
  [Scroll.BLESS]: "bless",
  [Scroll.LUCK]: "lucky",
  [Scroll.FLAME]: "flame",
};

export function isScroll(content: Content, name: string): boolean {
  const effect = effectOf(content, name);
  return effect === Scroll.ENCHANT || effect in GRANTS;
}

/** What a scroll would do, for the description panel. */
export function describeScroll(effect: number): string {
  switch (effect) {
    case Scroll.GLOW:
      return "Makes an item glow: +2 Skill.";
    case Scroll.BLESS:
      return "Blesses an item: +1 Defence.";
    case Scroll.LUCK:
      return "+12 Skill, but only in your right hand.";
    case Scroll.FLAME:
      return "+8 Attack, but only in your right hand.";
    case Scroll.ENCHANT:
      return "Enchants an item one step further. Mostly Skill, and it can be done again.";
    default:
      return "Nothing you know how to read.";
  }
}

function asEquipment(item: CarriedArms): Equipment {
  return {
    attack: item.attack,
    defend: item.defend,
    skill: item.skill,
    enchant: item.enchant,
    traits: new Set(item.traits.map((t) => t.charAt(0).toUpperCase() + t.slice(1))),
  };
}

/**
 * Whether the spell takes at all: `arStatus.tryScroll`.
 *
 * An opposed check between your **Wits** and the item's own power, so the better the weapon the
 * harder it is to improve — which is what stops a scroll being a flat purchase. Guild ranks in
 * Magic count towards it, which is that track's job beyond the Skill it already grants.
 */
export function spellTakes(
  item: CarriedArms,
  wits: number,
  magicRank: number,
  rng: GameRandom,
): boolean {
  return rng.contest(wits + magicRank * 5, itemPower(asEquipment(item)));
}

export interface ScrollResult {
  /** The item afterwards, or null if it was destroyed. */
  readonly item: CarriedArms | null;
  /** True when the scroll was spent — it is spent whether or not the spell took. */
  readonly used: boolean;
  readonly message: string;
  /** Damage the attempt did to you. */
  readonly wounds: number;
}

/**
 * Reading a scroll at an item.
 *
 * Enchanting is the one that repeats, and the one with teeth. It is **safe while the enchantment is
 * below the item's power**, so a great sword absorbs many and a knife almost none. Past that point
 * every further attempt is an opposed check against the overshoot: lose it and the item explodes,
 * taking a bite out of you on the way. That is `arStatus.effectEnchant`, unchanged — a gold sink
 * with no ceiling and a real reason to stop.
 */
export function readScroll(
  effect: number,
  item: CarriedArms,
  wits: number,
  magicRank: number,
  rng: GameRandom,
): ScrollResult {
  const trait = GRANTS[effect];

  if (trait !== undefined) {
    if (item.traits.some((t) => t.toLowerCase() === trait)) {
      return { item, used: false, message: `The ${item.name} already has that on it.`, wounds: 0 };
    }
    if (!spellTakes(item, wits, magicRank, rng)) {
      return {
        item,
        used: true,
        message: `The mass and material of the ${item.name} resists the spell. The scroll is spent.`,
        wounds: 0,
      };
    }
    return {
      item: { ...item, traits: [...item.traits, trait] },
      used: true,
      message: `The ${item.name} takes the enchantment.`,
      wounds: 0,
    };
  }

  if (effect !== Scroll.ENCHANT) {
    return { item, used: false, message: "Nothing you know how to read.", wounds: 0 };
  }

  if (!spellTakes(item, wits, magicRank, rng)) {
    return {
      item,
      used: true,
      message: `The mass and material of the ${item.name} resists the spell. The scroll is spent.`,
      wounds: 0,
    };
  }

  const enchanted: CarriedArms = { ...item, enchant: item.enchant + 1 };
  const power = itemPower(asEquipment(item));
  const overshoot = enchanted.enchant - power;

  if (overshoot < 0) {
    return {
      item: enchanted,
      used: true,
      message: `The ${item.name} is enchanted to ${String(enchanted.enchant)}.`,
      wounds: 0,
    };
  }
  if (!rng.contest(overshoot, power)) {
    return {
      item: enchanted,
      used: true,
      message: `The ${item.name} pulses with a dangerous purple light. Enchanted to ${String(enchanted.enchant)}.`,
      wounds: 0,
    };
  }
  return {
    item: null,
    used: true,
    message:
      `There is a hot, steamy explosion as your ${item.name} disintegrates. ` +
      `The magic goes through you for ${String(overshoot)} wounds.`,
    wounds: overshoot,
  };
}
