/**
 * Buying and selling.
 *
 * What a shop pays you for something is not its price. It is the item's table cost, cut by the
 * shop's own resale rate, then cut again by a haggling term that your Charm improves — so a
 * charming hero genuinely gets more for their old sword. Merchants do better still.
 *
 * The formula is ported from `Shop.packValue`, integer truncation included, because the whole
 * economy rests on it and rounding differences compound over a campaign.
 */

import type { Content } from "./content.js";
import type { Carried } from "./hero.js";

export interface ShopDefinition {
  readonly key: string;
  readonly name: string;
  /** The line the shopkeeper greets you with, so a shop is a place rather than a table. */
  readonly greeting: string;
  /** What it will pay, as a percentage of the table cost, before haggling. */
  readonly resale: number;
  /** How hard it haggles. Higher means your Charm matters more. */
  readonly base: number;
  /**
   * The wear slot this shop specialises in, which is worth a third more here than elsewhere.
   *
   * `arWeapon` marks up anything held in the right hand, `arArmour` anything worn on the body. A
   * shop that sells supplies rather than equipment has none.
   */
  readonly favours: string | null;
  /** What it has for sale. */
  readonly stock: readonly string[];
}

/**
 * The three town shops, with the names, rates and stock lists the Java build gives them.
 *
 * The rates are the arguments each screen passes to `setShopValues`, so haggling behaves the same
 * way here: the trader pays best (80) and the armourer worst (50), and Sally haggles harder than
 * Bill does.
 */
export const WEAPON_SHOP: ShopDefinition = {
  key: "weapons",
  name: "Bill Smith's Weapon Shoppe",
  greeting: "Everything here will hold an edge. Mind the pikes.",
  resale: 60,
  base: 10,
  favours: "right",
  stock: [
    "Knife",
    "Hatchet",
    "Short Sword",
    "Long Sword",
    "Spear",
    "Broad Sword",
    "Battle Axe",
    "Pike",
    "Sling",
    "Short Bow",
    "Long Bow",
    "Spike Helm",
    "Main Gauche",
  ],
};

export const ARMOUR_SHOP: ShopDefinition = {
  key: "armour",
  name: "Aileen Suitor's Armour Shoppe",
  greeting: "Attack wins fights. Armour is what gets you home.",
  resale: 50,
  base: 15,
  favours: "body",
  stock: [
    "Clothes",
    "Leather Jacket",
    "Brigandine",
    "Chain Suit",
    "Scale Suit",
    "Buckler",
    "Targe",
    "Shield",
    "Spike Shield",
    "Sandals",
    "Shoes",
    "Boots",
    "Leather Cap",
    "Pot Helm",
    "Chain Coif",
  ],
};

export const TRADER_SHOP: ShopDefinition = {
  key: "trader",
  name: "Sally Trader's Curious Goods",
  greeting: "Salve for the wounds, seltzer for the dust, and dust for everyone else.",
  resale: 80,
  base: 15,
  favours: null,
  stock: [
    "Healing Salve",
    "Seltzer Water",
    "Gold Apple",
    "Ginseng Root",
    "Blinding Dust",
    "Panic Dust",
    "Blast Powder",
    "Food",
    "Fish",
  ],
};

export const SHOPS: readonly ShopDefinition[] = [WEAPON_SHOP, ARMOUR_SHOP, TRADER_SHOP];

export function shopByKey(key: string): ShopDefinition {
  return SHOPS.find((s) => s.key === key) ?? WEAPON_SHOP;
}

/**
 * What a trait adds to an item's worth, from `ArmsTrait.traitValue`.
 *
 * The numbers are wildly out of proportion to the stats they sit on — a blinding weapon carries
 * four thousand Marks of trait on top of whatever it swings for — and nothing sold in any shop has
 * one, so this is the part of the economy a port is most likely to get silently wrong. Every value
 * here is checked against the Java build in `baseline/rules.txt`.
 */
const TRAIT_VALUE: Readonly<Record<string, number>> = {
  glows: 50,
  flame: 800,
  bless: 300,
  lucky: 250,
  disease: 1500,
  blind: 4000,
  panic: 3000,
  blast: 2000,
  enchant: 100,
};

function sign(value: number): number {
  return value > 0 ? 1 : -1;
}

/**
 * What a piece of equipment is worth before any shop has an opinion: `itArms.stockValue`.
 *
 * Attack and Defence are added and then *squared*, so worth climbs far faster than power does — a
 * weapon twice as good costs four times as much, which is what stops the best gear being a
 * formality. Skill counts separately and at a lower weight, and the whole thing is halved.
 *
 * Unidentified and possibly-cursed items are worth two Marks whatever they turn out to be, because
 * nobody will pay for a promise.
 */
export function armsValue(item: {
  attack: number;
  defend: number;
  skill: number;
  traits: readonly string[];
}): number {
  const traits = item.traits.map((t) => t.toLowerCase());
  if (traits.includes("secret") || traits.includes("curse")) {
    return 2;
  }
  const physical = item.attack + item.defend;
  const value = sign(physical) * physical * physical * 5;
  let worth = Math.trunc((value + sign(item.skill) * item.skill * item.skill * 2) / 2);
  for (const trait of traits) {
    worth += TRAIT_VALUE[trait] ?? 0;
  }
  return worth;
}

/**
 * What this shop values something at.
 *
 * Equipment is priced from its own stats, not from a lookup table — the arms table carries no costs
 * at all, which is why every weapon in the game was free before this existed. Supplies do come from
 * a table, because a salve is a salve.
 */
export function stockValue(content: Content, shop: ShopDefinition, item: Carried): number {
  if (item.kind !== "arms") {
    return content.gear.get(item.name)?.cost ?? 0;
  }
  let value = armsValue(item);
  const favours = shop.favours;
  if (favours !== null && item.traits.some((t) => t.toLowerCase() === favours)) {
    // The Java casts a float to int here, which truncates.
    value = Math.trunc(value * 1.3);
  }
  return value < 2 ? 2 : value;
}

/** What it costs to buy from this shop's stock. */
export function buyPrice(content: Content, shop: ShopDefinition, name: string): number {
  const weapon = content.weapons.get(name);
  if (weapon !== undefined) {
    return stockValue(content, shop, {
      kind: "arms",
      name,
      attack: weapon.attack,
      defend: weapon.defend,
      skill: weapon.skill,
      traits: weapon.traits,
    });
  }
  return content.gear.get(name)?.cost ?? 0;
}

/**
 * What a shop will pay you for something.
 *
 * Two cuts, both truncating. The first is the shop's resale rate, which a Merchant improves by
 * taking the cut against 95 rather than 100. The second is haggling: the shop keeps
 * `base / (2 * base + charm)` of what is left, so more Charm keeps more of the value.
 *
 * It takes the item rather than its name on purpose. A weapon you looted is not the same weapon as
 * the one in the table — it may carry a trait worth thousands — and pricing by name would lose
 * exactly the difference that makes finding one worth anything.
 */
export function sellPrice(
  content: Content,
  shop: ShopDefinition,
  item: Carried,
  charm: number,
  merchant = false,
): number {
  const stock = stockValue(content, shop, item);
  const afterResale = merchant
    ? Math.trunc((stock * shop.resale) / 95)
    : Math.trunc((stock * shop.resale) / 100);
  return afterResale - Math.trunc((afterResale * shop.base) / (2 * shop.base + charm));
}

/** An item as a shop row: what it is, what it costs, and what it would do for you. */
export interface ShopRow {
  readonly name: string;
  readonly price: number;
  readonly item: Carried;
}

/**
 * What the shop has, priced.
 *
 * A shop sells two different kinds of thing and both have to work: equipment, which becomes a piece
 * of gear with stats, and supplies, which become a stack you can use. Anything the content does not
 * price at all is skipped rather than offered for nothing.
 */
export function stockOf(content: Content, shop: ShopDefinition): ShopRow[] {
  const rows: ShopRow[] = [];
  for (const name of shop.stock) {
    const price = buyPrice(content, shop, name);
    const weapon = content.weapons.get(name);
    if (weapon !== undefined) {
      rows.push({
        name,
        price,
        item: {
          kind: "arms",
          name: weapon.key,
          attack: weapon.attack,
          defend: weapon.defend,
          skill: weapon.skill,
          traits: weapon.traits,
        },
      });
      continue;
    }
    if (content.gear.has(name)) {
      rows.push({ name, price, item: { kind: "count", name, count: 1 } });
    }
  }
  return rows;
}
