import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { armsOf, loadContent, type Content } from "../src/game/content.js";
import { apply, characterFrom, type Game } from "../src/game/state.js";
import { parseHero } from "../src/game/hero.js";
import { newHeroText, backgroundByKey } from "../src/game/creation.js";
import { isBulkSellable } from "../src/game/items.js";
import { GameRandom } from "../src/rules/random.js";

/**
 * Clearing the pack out in one go.
 *
 * Measured over 300 quests in the Fields: sixty-four rows come home, fifty-five of them weapons and
 * most of those the same Rusty Dagger. What matters about this feature is not the convenience, it
 * is what it must never touch — so most of what follows is about the things it leaves alone.
 */

function json(path: string): never {
  return JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")) as never;
}

const content: Content = loadContent({
  arms: json("../../content/arms.json"),
  monsters: json("../../content/monsters.json"),
  gear: json("../../content/gear.json"),
});

function game(): Game {
  return {
    content,
    rng: new GameRandom(1),
    place: { kind: "shop", shop: "weapons" },
    character: characterFrom(parseHero(newHeroText("Hoard", backgroundByKey("pedlar")))),
    quest: null,
    notices: [],
  };
}

const names = (g: Game): string[] => g.character!.pack.map((c) => c.name);

describe("selling weapons in bulk", () => {
  it("empties the pack of gear and pays for it", () => {
    const g = game();
    for (const n of ["Long Sword", "Battle Axe", "Knife", "Knife"]) {
      g.character!.pack.push(armsOf(content.weapons.get(n)!));
    }
    const before = g.character!.marks;
    apply(g, { kind: "sellAll", shop: "weapons", what: "arms" });
    expect(g.character!.pack.filter((c) => c.kind === "arms")).toHaveLength(0);
    expect(g.character!.marks).toBeGreaterThan(before);
    expect(g.notices.join(" ")).toContain("You sell 4");
  });

  it("cannot touch what you are wearing, because worn gear is not in the pack", () => {
    const g = game();
    g.character!.gear.push(armsOf(content.weapons.get("Long Sword")!));
    apply(g, { kind: "sellAll", shop: "weapons", what: "arms" });
    expect(g.character!.gear.map((c) => c.name)).toEqual(["Long Sword"]);
  });

  it("leaves supplies alone", () => {
    const g = game();
    g.character!.pack.push(armsOf(content.weapons.get("Knife")!));
    g.character!.pack.push({ kind: "count", name: "Healing Salve", count: 2 });
    apply(g, { kind: "sellAll", shop: "weapons", what: "arms" });
    expect(names(g)).toEqual(["Healing Salve"]);
  });
});

describe("selling trophies in bulk", () => {
  it("takes junk, trophies and gems, and pays per item in a stack", () => {
    const g = game();
    g.character!.pack.push({ kind: "count", name: "Ruby", count: 3 });
    const before = g.character!.marks;
    apply(g, { kind: "sellAll", shop: "trader", what: "valuables" });
    expect(names(g)).not.toContain("Ruby");
    expect(g.character!.marks).toBeGreaterThan(before);
    expect(g.notices.join(" ")).toContain("You sell 3");
  });

  it("never sells the way onward", () => {
    // The failure this whitelist exists to prevent: a player finds out their Rutter is gone when
    // they try to sail. Every key item in the game, checked.
    const g = game();
    const keys = [
      "Map to Warrens",
      "Map to Treasury",
      "Castle Permit",
      "Map to Throne Room",
      "Rutter for Hie Brasil",
      "Map to Vortex",
      "Rutter for Shangala",
      "Time Crystal",
    ];
    for (const key of keys) {
      g.character!.pack.push({ kind: "count", name: key, count: 1 });
    }
    apply(g, { kind: "sellAll", shop: "trader", what: "valuables" });
    for (const key of keys) {
      expect(names(g), key).toContain(key);
    }
  });

  it("never sells a potion or a scroll", () => {
    const g = game();
    for (const name of [
      "Healing Salve",
      "Gold Apple",
      "Panic Dust",
      "Enchant Scroll",
      "Ginseng Root",
    ]) {
      g.character!.pack.push({ kind: "count", name, count: 1 });
    }
    apply(g, { kind: "sellAll", shop: "trader", what: "valuables" });
    expect(names(g)).toHaveLength(5);
  });

  it("leaves behind anything the shop will not pay for, rather than binning it", () => {
    const g = game();
    g.character!.pack.push({ kind: "count", name: "Not In Any Table", count: 1 });
    apply(g, { kind: "sellAll", shop: "trader", what: "valuables" });
    expect(names(g)).toContain("Not In Any Table");
    expect(g.notices.join(" ")).toContain("Nothing here is worth anything");
  });
});

describe("what counts as safe to sell", () => {
  it("says yes to gear, junk, trophies and gems and no to everything else", () => {
    const yes = [
      { kind: "count", name: "Ruby", count: 1 } as const,
      { kind: "count", name: "Gold Nugget", count: 1 } as const,
      { kind: "count", name: "Rock", count: 1 } as const,
    ];
    const no = [
      { kind: "count", name: "Healing Salve", count: 1 } as const,
      { kind: "count", name: "Enchant Scroll", count: 1 } as const,
      { kind: "count", name: "Castle Permit", count: 1 } as const,
      { kind: "count", name: "Thief Insurance", count: 1 } as const,
      { kind: "count", name: "Food", count: 1 } as const,
    ];
    for (const item of yes) expect(isBulkSellable(content, item), item.name).toBe(true);
    for (const item of no) expect(isBulkSellable(content, item), item.name).toBe(false);
    expect(isBulkSellable(content, armsOf(content.weapons.get("Knife")!))).toBe(true);
  });
});
