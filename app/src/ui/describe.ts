/**
 * Telling the player what an item is and what it would do for them.
 *
 * This is one of the modernisations the rewrite exists for. The Java build shows a stat comparison
 * in shops and nowhere else, so **buying is informed and equipping is guesswork** — you can see
 * that a sword beats what you are holding while standing in a shop, and lose that information the
 * moment you walk out. The comparison is built once here and used by every screen that lists an
 * item, which closes the asymmetry rather than duplicating it.
 *
 * It also produces a real description, which the original had nowhere to put at all.
 */

import {
  WEAR_SLOTS,
  WEAR_SLOT_SET,
  itemAttack,
  itemDefend,
  itemSkill,
  type Equipment,
} from "../rules/combat.js";

// Re-exported: the interface and its tests have always reached for this from here.
export { WEAR_SLOTS };

/** Traits that are about where an item is worn rather than what it does. */
const SLOT_TRAITS = WEAR_SLOT_SET;

/** Traits worth explaining, and what they mean in plain words. */
const TRAIT_MEANINGS: Readonly<Record<string, string>> = {
  right: "held in your right hand",
  left: "held in your left hand",
  head: "worn on your head",
  body: "worn on your body",
  feet: "worn on your feet",
  secret: "unidentified — its real stats are hidden",
  cursed: "cursed: it cannot be removed",
  curse: "may be cursed",
  glows: "glows, lighting your way (+2 skill)",
  flame: "wreathed in flame (+8 attack in your right hand)",
  bless: "blessed (+1 defence)",
  lucky: "lucky (+12 skill in your right hand)",
  disease: "carries disease, which weakens the skill of whoever it strikes",
  blind: "can blind, halving what your enemy can do",
  panic: "can panic, sending your enemy running",
  blast: "can blast for a flat 25 damage when that beats your blow",
  enchant: "enchanted",
};

export interface ItemView {
  readonly name: string;
  readonly attack: number;
  readonly defend: number;
  readonly skill: number;
  readonly enchant: number;
  /** Smith-bought points, so what the inventory shows matches what the fight uses. */
  readonly forged: number;
  readonly tempered: number;
  readonly traits: readonly string[];
}

function asEquipment(item: ItemView): Equipment {
  return {
    attack: item.attack,
    defend: item.defend,
    skill: item.skill,
    enchant: item.enchant,
    forged: item.forged,
    tempered: item.tempered,
    traits: new Set(item.traits.map((t) => t.charAt(0).toUpperCase() + t.slice(1))),
  };
}

/** An item's total worth in combat: everything it contributes, added up. */
export function itemWorth(item: ItemView): number {
  const equipment = asEquipment(item);
  return itemAttack(equipment) + itemDefend(equipment) + itemSkill(equipment);
}

/** Which slots an item occupies. */
export function slotsOf(item: ItemView): string[] {
  return item.traits.filter((t) => SLOT_TRAITS.has(t.toLowerCase())).map((t) => t.toLowerCase());
}

export function isWearable(item: ItemView): boolean {
  return slotsOf(item).length > 0;
}

export function isUnidentified(item: ItemView): boolean {
  return item.traits.some((t) => t.toLowerCase() === "secret");
}

export interface Comparison {
  /** Positive is better, negative worse. Null when there is nothing to compare. */
  readonly delta: number | null;
  /** What you would take off to wear it. */
  readonly displaced: readonly ItemView[];
}

/**
 * What swapping to this item would cost or gain.
 *
 * An item can occupy more than one slot — sixteen weapons in the game are two-handed and claim both
 * hands — so equipping a pike also costs you the shield you were holding. Everything it would
 * displace is counted, and a piece worn across two slots counts once.
 */
export function compareToWorn(item: ItemView, worn: readonly ItemView[]): Comparison {
  if (isUnidentified(item) || !isWearable(item)) {
    return { delta: null, displaced: [] };
  }
  const slots = new Set(slotsOf(item));
  const displaced: ItemView[] = [];
  for (const candidate of worn) {
    if (candidate === item) {
      continue;
    }
    if (slotsOf(candidate).some((slot) => slots.has(slot)) && !displaced.includes(candidate)) {
      displaced.push(candidate);
    }
  }
  const held = displaced.reduce((sum, each) => sum + itemWorth(each), 0);
  return { delta: itemWorth(item) - held, displaced };
}

/** The comparison as the short marker a list row shows: `+7`, `-6`, `=`. */
export function deltaLabel(comparison: Comparison): string {
  if (comparison.delta === null) {
    return "";
  }
  if (comparison.delta === 0) {
    return "=";
  }
  return comparison.delta > 0 ? `+${comparison.delta}` : String(comparison.delta);
}

export function deltaClass(comparison: Comparison): string {
  if (comparison.delta === null) return "delta--same";
  if (comparison.delta > 0) return "delta--better";
  if (comparison.delta < 0) return "delta--worse";
  return "delta--same";
}

/**
 * A full description, in sentences rather than a stat block.
 *
 * The original showed a name and three numbers. This says what the numbers mean, where the item is
 * worn, what it would displace, and what each of its traits actually does — the "better item
 * descriptions" the rewrite was asked for.
 */
export function describeItem(item: ItemView, worn: readonly ItemView[] = []): string[] {
  const lines: string[] = [];

  if (isUnidentified(item)) {
    lines.push("Unidentified. Its real stats are hidden until someone identifies it for you.");
    return lines;
  }

  const parts: string[] = [];
  if (item.attack !== 0) parts.push(`${signed(item.attack)} attack`);
  if (item.defend !== 0) parts.push(`${signed(item.defend)} defence`);
  if (item.skill !== 0) parts.push(`${signed(item.skill)} skill`);
  lines.push(parts.length > 0 ? parts.join(", ") : "No effect on your fighting.");

  const slots = slotsOf(item);
  if (slots.length === 2 && slots.includes("right") && slots.includes("left")) {
    lines.push("Two-handed, so it takes both hands.");
  } else if (slots.length > 0) {
    lines.push(`Worn: ${slots.join(" and ")}.`);
  } else {
    lines.push("Not something you can wear.");
  }

  const comparison = compareToWorn(item, worn);
  if (comparison.delta !== null) {
    if (comparison.displaced.length === 0) {
      lines.push(`Nothing equipped there — a gain of ${comparison.delta}.`);
    } else {
      const names = comparison.displaced.map((d) => d.name).join(" and ");
      const verdict =
        comparison.delta > 0
          ? `better by ${comparison.delta}`
          : comparison.delta < 0
            ? `worse by ${Math.abs(comparison.delta)}`
            : "exactly as good";
      lines.push(`Would replace ${names} — ${verdict}.`);
    }
  }

  for (const trait of item.traits) {
    const key = trait.toLowerCase();
    if (SLOT_TRAITS.has(key)) {
      continue;
    }
    const meaning = TRAIT_MEANINGS[key];
    if (meaning !== undefined) {
      lines.push(capitalise(meaning) + ".");
    }
  }

  if (item.enchant > 0) {
    lines.push(`Enchanted to ${item.enchant}.`);
  }

  return lines;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
