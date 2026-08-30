/**
 * Making a character.
 *
 * The original hands you a hero and a purse and drops you in the fields; there was nowhere on a
 * 400x300 canvas to ask you anything. Being asked who you are is the cheapest possible improvement
 * and it makes the traits visible, which matters because **every trait here already does something
 * in the rules** — these are not flavour labels. Each one is named in `Constants` and read by
 * `combat.ts`, `battle.ts`, `shop.ts` or `items.ts`, and the descriptions below say exactly what.
 */

export interface Background {
  readonly key: string;
  readonly name: string;
  readonly blurb: string;
  readonly guts: number;
  readonly wits: number;
  readonly charm: number;
  readonly traits: readonly string[];
  /** What each trait does, in the same order, for the chooser. */
  readonly effects: readonly string[];
}

/** Every background spends the same thirty points, so the choice is shape rather than strength. */
export const BACKGROUNDS: readonly Background[] = [
  {
    key: "squire",
    name: "Squire",
    blurb: "Raised around armour and drilled with a blunt sword.",
    guts: 14,
    wits: 9,
    charm: 7,
    traits: ["Strong", "Sturdy"],
    effects: ["Strong: a tenth more Attack.", "Sturdy: a tenth more Defence."],
  },
  {
    key: "poacher",
    name: "Poacher",
    blurb: "You have spent your life not being seen, and moving first.",
    guts: 10,
    wits: 12,
    charm: 8,
    traits: ["Agile", "Reflex"],
    effects: ["Agile: a tenth more Skill.", "Reflex: +30 Speed, which usually wins initiative."],
  },
  {
    key: "pedlar",
    name: "Pedlar",
    blurb: "You could sell a cart to the man who sold it to you.",
    guts: 9,
    wits: 9,
    charm: 12,
    traits: ["Merchant", "Stubborn"],
    effects: [
      "Merchant: shops pay you noticeably better.",
      "Stubborn: +30 Wits against being hypnotised.",
    ],
  },
  {
    key: "surgeon",
    name: "Barber-Surgeon",
    blurb: "You have taken more arrows out of people than you have put in.",
    guts: 11,
    wits: 12,
    charm: 7,
    traits: ["Medic", "Hardy"],
    effects: [
      "Medic: salves, apples and food heal far more.",
      "Hardy: disease takes half its usual hold.",
    ],
  },
];

export function backgroundByKey(key: string): Background {
  return BACKGROUNDS.find((b) => b.key === key) ?? BACKGROUNDS[0]!;
}

/** What a new hero starts with. The original's purse, because Attack comes entirely from gear. */
export const STARTING_MARKS = 250;

/** A name that is safe to write into a save: the format cannot carry braces or bars. */
export function cleanName(raw: string): string {
  const trimmed = raw.replace(/[{}|]/g, "").trim().slice(0, 24);
  return trimmed.length > 0 ? trimmed : "Wanderer";
}

/** A brand-new hero, as save text the ordinary loader can read. */
export function newHeroText(name: string, background: Background): string {
  const traits = background.traits.join("|");
  return (
    `{itHero|${cleanName(name)}|${String(background.guts)}|${String(background.wits)}|` +
    `${String(background.charm)}|{~|pack|{#|Marks|${String(STARTING_MARKS)}}}|{~|gear}|` +
    `{~|stat|{#|Age|16}|${traits}}|{~|temp}|{~|rank|{#|Level|1}}|` +
    `{~|values|{=|state|Alive}|{=|place|town}}}`
  );
}
