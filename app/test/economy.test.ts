import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { armsOf, loadContent, type Content } from "../src/game/content.js";
import { WEAPON_SHOP, armsValue, sellPrice, stockValue } from "../src/game/shop.js";
import type { Carried } from "../src/game/hero.js";

/**
 * What things cost, against the Java build's recorded prices.
 *
 * This exists because of a real bug: the port priced equipment by looking it up in the gear table,
 * and the gear table has no weapons in it — so every sword, bow and breastplate in every shop was
 * free, and could be sold straight back for money. Nothing caught it, because nothing checked a
 * price against anything.
 *
 * `baseline/rules.txt` records what the real weapon shop charges and pays for ten items at four
 * levels of Charm, with and without the Merchant trait. Half of them carry value-bearing traits,
 * which are worth far more than the stats they sit on and are the part most likely to drift.
 */

function json(path: string): never {
  return JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")) as never;
}

const content: Content = loadContent({
  arms: json("../../content/arms.json"),
  monsters: json("../../content/monsters.json"),
  gear: json("../../content/gear.json"),
});

const rules = readFileSync(
  fileURLToPath(new URL("../../baseline/rules.txt", import.meta.url)),
  "utf8",
);

interface Row {
  charm: number;
  merchant: boolean;
  prices: { name: string; stock: number; sell: number }[];
}

const rows: Row[] = [
  ...rules.matchAll(/^charm=(\d+) merchant=(true|false)((?: [\w &]+=stock:-?\d+\/sell:-?\d+)+)$/gm),
].map((m) => ({
  charm: Number(m[1]),
  merchant: m[2] === "true",
  prices: [...m[3]!.matchAll(/ ([\w &]+)=stock:(-?\d+)\/sell:(-?\d+)/g)].map((p) => ({
    name: p[1]!,
    stock: Number(p[2]),
    sell: Number(p[3]),
  })),
}));

type Arms = Extract<Carried, { kind: "arms" }>;

function armsFrom(name: string): Arms {
  const weapon = content.weapons.get(name);
  if (weapon === undefined) {
    throw new Error(`no weapon ${name}`);
  }
  return armsOf(weapon);
}

describe("the weapon shop, against the Java build", () => {
  it("has rows to check", () => {
    expect(rows.length).toBeGreaterThan(4);
    expect(rows[0]!.prices.length).toBeGreaterThan(8);
  });

  it("charges exactly what the Java charges for every item", () => {
    for (const row of rows) {
      for (const price of row.prices) {
        expect(stockValue(content, WEAPON_SHOP, armsFrom(price.name)), price.name).toBe(
          price.stock,
        );
      }
    }
  });

  it("pays exactly what the Java pays, at every Charm and for a Merchant", () => {
    for (const row of rows) {
      for (const price of row.prices) {
        expect(
          sellPrice(content, WEAPON_SHOP, armsFrom(price.name), row.charm, row.merchant),
          `${price.name} charm=${String(row.charm)} merchant=${String(row.merchant)}`,
        ).toBe(price.sell);
      }
    }
  });
});

describe("what makes something valuable", () => {
  it("nothing in a shop is free, which would be an infinite money press", () => {
    // The bug this file exists for: buy a Knife for nothing, sell it back for four Marks, repeat.
    for (const name of WEAPON_SHOP.stock) {
      expect(stockValue(content, WEAPON_SHOP, armsFrom(name)), name).toBeGreaterThan(0);
    }
  });

  it("never pays more for something than it charges", () => {
    for (const name of WEAPON_SHOP.stock) {
      const item = armsFrom(name);
      expect(sellPrice(content, WEAPON_SHOP, item, 200, true)).toBeLessThanOrEqual(
        stockValue(content, WEAPON_SHOP, item),
      );
    }
  });

  it("grows with the square of the stats, so the best gear is never a formality", () => {
    // Twice the Attack is roughly four times the price. Only roughly: the halving truncates, so
    // 5 Attack is worth 62 rather than 62.5 and the ratio comes out a shade over four.
    const cheap = armsValue({ attack: 5, defend: 0, skill: 0, traits: [] });
    const dear = armsValue({ attack: 10, defend: 0, skill: 0, traits: [] });
    expect(dear / cheap).toBeCloseTo(4, 1);
    expect(armsValue({ attack: 20, defend: 0, skill: 0, traits: [] }) / dear).toBeCloseTo(4, 1);
  });

  it("counts a trait as worth far more than the blade carrying it", () => {
    const plain = { attack: 10, defend: 0, skill: 0, traits: ["right"] };
    expect(armsValue({ ...plain, traits: ["right", "blind"] })).toBe(armsValue(plain) + 4000);
  });

  it("pays two Marks for anything unidentified, however good it turns out to be", () => {
    expect(armsValue({ attack: 90, defend: 90, skill: 90, traits: ["right", "secret"] })).toBe(2);
  });

  it("marks up what the shop specialises in and nothing else", () => {
    const sword = armsFrom("Long Sword");
    expect(stockValue(content, WEAPON_SHOP, sword)).toBe(Math.trunc(armsValue(sword) * 1.3));
    expect(stockValue(content, { ...WEAPON_SHOP, favours: null }, sword)).toBe(armsValue(sword));
  });
});
