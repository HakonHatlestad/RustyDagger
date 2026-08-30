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
  /** What it will pay, as a percentage of the table cost, before haggling. */
  readonly resale: number;
  /** How hard it haggles. Higher means your Charm matters more. */
  readonly base: number;
  /** What it has for sale. */
  readonly stock: readonly string[];
}

/**
 * The weapon shop, with the numbers the Java build passes to `setShopValues`.
 *
 * Its stock is the Java shop's list, so a player who knows the game finds what they expect.
 */
export const WEAPON_SHOP: ShopDefinition = {
  key: "weapons",
  name: "Bill Smith's Weapon Shoppe",
  resale: 60,
  base: 10,
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

/** What an item costs to buy: its table cost, straight. */
export function buyPrice(content: Content, name: string): number {
  return content.gear.get(name)?.cost ?? 0;
}

/**
 * What a shop will pay you for an item.
 *
 * Two cuts, both truncating. The first is the shop's resale rate, which a Merchant improves by
 * taking the cut against 95 rather than 100. The second is haggling: the shop keeps
 * `base / (2 * base + charm)` of what is left, so more Charm keeps more of the value.
 */
export function sellPrice(
  content: Content,
  shop: ShopDefinition,
  name: string,
  charm: number,
  merchant = false,
): number {
  const stock = buyPrice(content, name);
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

/** What the shop has, priced. Anything the content does not know about is skipped. */
export function stockOf(content: Content, shop: ShopDefinition): ShopRow[] {
  const rows: ShopRow[] = [];
  for (const name of shop.stock) {
    const weapon = content.weapons.get(name);
    if (weapon === undefined) {
      continue;
    }
    rows.push({
      name,
      price: buyPrice(content, name),
      item: {
        kind: "arms",
        name: weapon.key,
        attack: weapon.attack,
        defend: weapon.defend,
        skill: weapon.skill,
        traits: weapon.traits,
      },
    });
  }
  return rows;
}
