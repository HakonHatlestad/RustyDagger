import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadContent, type Content } from "../src/game/content.js";
import {
  REGIONS,
  assess,
  canEnter,
  pickEncounter,
  regionByKey,
  tableFor,
} from "../src/game/world.js";
import { typicalPower } from "../src/game/monster.js";
import { GameRandom } from "../src/rules/random.js";
import { BACKGROUNDS, backgroundByKey, cleanName, newHeroText } from "../src/game/creation.js";
import { parseHero } from "../src/game/hero.js";
import { SHOPS, stockOf } from "../src/game/shop.js";

function json(path: string): never {
  return JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")) as never;
}

const content: Content = loadContent({
  arms: json("../../content/arms.json"),
  monsters: json("../../content/monsters.json"),
  gear: json("../../content/gear.json"),
});

describe("the regions", () => {
  it("every region has creatures in the exported content", () => {
    // A region whose prefix does not match anything would show an empty, unclickable card.
    for (const region of REGIONS) {
      const quarry = [...content.monsters.keys()].filter((k) => k.startsWith(`${region.prefix}:`));
      expect(quarry.length, region.name).toBeGreaterThan(0);
    }
  });

  it("is ordered so it never gets easier as you go down it", () => {
    const levels = REGIONS.map((r) => r.advisedLevel);
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]!, REGIONS[i]!.name).toBeGreaterThanOrEqual(levels[i - 1]!);
    }
  });

  it("is also ordered by what actually lives there, which is the check that matters", () => {
    // The ordering above is a hand-written number. This one is not: it weighs the creatures in
    // each table the way the game weighs two fighters, and the two must agree.
    const power = REGIONS.map((r) => typicalPower(r.table, r.prefix, content, 20));
    for (const p of power) {
      expect(p).toBeGreaterThan(0);
    }
    expect(power[0]!).toBeLessThan(power[power.length - 1]!);
  });

  it("tells a player where they stand rather than quoting a level at them", () => {
    expect(assess(1000, 100).verdict).toBe("safe");
    expect(assess(120, 100).verdict).toBe("fair");
    expect(assess(80, 100).verdict).toBe("risky");
    expect(assess(20, 100).verdict).toBe("deadly");
    expect(assess(20, 100).advice).toContain("outmatched");
    // Every verdict has to say something a player can act on.
    for (const yours of [10, 100, 120, 1000]) {
      expect(assess(yours, 100).advice.length).toBeGreaterThan(10);
    }
  });

  it("names a key item that actually exists and can be got hold of", () => {
    // A gate whose key is not in the gear table is a gate that never opens.
    const forSale = new Set(SHOPS.flatMap((s) => s.stock));
    for (const region of REGIONS) {
      if (region.key_item === null) continue;
      expect(content.gear.has(region.key_item), region.key_item).toBe(true);
      expect(forSale.has(region.key_item), `${region.key_item} is not for sale anywhere`).toBe(
        true,
      );
    }
  });

  it("keeps the first four open, so a new character has somewhere to go", () => {
    expect(REGIONS.filter((r) => r.key_item === null).length).toBe(4);
    expect(canEnter(REGIONS[0]!, [])).toBe(true);
  });

  it("opens a locked one only for someone carrying its key", () => {
    const dungeons = REGIONS.find((r) => r.key === "dunjeon")!;
    expect(canEnter(dungeons, [])).toBe(false);
    expect(canEnter(dungeons, [{ name: "Castle Permit" }])).toBe(true);
    expect(canEnter(dungeons, [{ name: "Map to Treasury" }])).toBe(false);
  });

  it("every creature in every table is in the exported content", () => {
    // A table naming something that is not there would be an encounter that cannot happen, or a
    // crash on arrival. Both tables of the Fields count.
    for (const region of REGIONS) {
      for (const list of [region.table, region.earlyTable ?? []]) {
        for (const entry of list) {
          expect(
            content.monsters.has(`${region.prefix}:${entry.name}`),
            `${region.name}: ${entry.name}`,
          ).toBe(true);
        }
      }
    }
  });

  it("never sends a new character anything from the deep end of the Fields", () => {
    // The only difficulty ramp the original has: no soldiers before level 3, and barely a gypsy.
    const fields = REGIONS[0]!;
    const early = new Map(tableFor(fields, 1).map((e) => [e.name, e.weight]));
    const later = new Map(tableFor(fields, 3).map((e) => [e.name, e.weight]));
    expect(early.get("Soldier")).toBe(0);
    expect(later.get("Soldier")).toBeGreaterThan(0);
    expect(early.get("Rodent")!).toBeGreaterThan(later.get("Rodent")!);
  });

  it("picks common things commonly, and never picks what is not on the table", () => {
    // The bug this replaces: a uniform pick over everything sharing the prefix, which made the
    // Dragon an ordinary encounter in the Hills and killed a level-10 character four times in five.
    const hills = REGIONS.find((r) => r.key === "hills")!;
    const known = new Set(content.monsters.keys());
    const rng = new GameRandom(4);
    const seen = new Map<string, number>();
    for (let i = 0; i < 4000; i++) {
      const key = pickEncounter(hills, 20, known, rng);
      seen.set(key!, (seen.get(key!) ?? 0) + 1);
    }
    expect(seen.has("Hills:Dragon")).toBe(false);
    expect(seen.get("Hills:Goat")!).toBeGreaterThan(seen.get("Hills:Sphinx")!);
    // One in a hundred is the wandering Faery, wherever you are.
    expect(seen.get("Faery")).toBeGreaterThan(10);
  });

  it("pays more the further out it is", () => {
    const weights = REGIONS.map((r) => r.weight);
    expect(Math.max(...weights)).toBeGreaterThan(Math.min(...weights) * 3);
  });

  it("falls back to somewhere survivable when asked for a region that is not there", () => {
    expect(regionByKey("atlantis").key).toBe("fields");
  });
});

describe("the shops", () => {
  it("sells a way onward that costs more than everything else put together", () => {
    // The gold problem this exists to solve: both gear shops come to about 3,000 Marks, and after
    // that money did nothing. The ladder out of the fields is an order of magnitude past that.
    const gear = SHOPS.filter((s) => s.key === "weapons" || s.key === "armour")
      .flatMap((s) => stockOf(content, s))
      .reduce((sum, r) => sum + r.price, 0);
    const ladder = REGIONS.filter((r) => r.key_item !== null)
      .map((r) => content.gear.get(r.key_item!)?.cost ?? 0)
      .reduce((sum, cost) => sum + cost, 0);
    expect(ladder).toBeGreaterThan(gear * 5);
  });

  it("every shop actually has something priced to sell", () => {
    for (const shop of SHOPS) {
      expect(stockOf(content, shop).length, shop.name).toBeGreaterThan(0);
    }
  });

  it("nothing in stock is free, which would be an infinite money press", () => {
    for (const shop of SHOPS) {
      for (const row of stockOf(content, shop)) {
        expect(row.price, `${shop.name}: ${row.name}`).toBeGreaterThan(0);
      }
    }
  });

  it("the trader sells supplies rather than equipment", () => {
    const trader = SHOPS.find((s) => s.key === "trader")!;
    expect(stockOf(content, trader).every((r) => r.item.kind === "count")).toBe(true);
  });
});

describe("making a character", () => {
  it("every background spends the same thirty points", () => {
    for (const background of BACKGROUNDS) {
      expect(background.guts + background.wits + background.charm, background.name).toBe(30);
    }
  });

  it("every background explains each of its traits", () => {
    for (const background of BACKGROUNDS) {
      expect(background.effects, background.name).toHaveLength(background.traits.length);
    }
  });

  it("produces a hero the ordinary loader can read", () => {
    const hero = parseHero(newHeroText("Ash", backgroundByKey("squire")));
    expect(hero.name).toBe("Ash");
    expect(hero.guts).toBe(14);
    expect(hero.statFlags).toContain("Strong");
    expect(hero.pack.find((c) => c.name === "Marks")).toBeDefined();
  });

  it("cannot be made to write a name that breaks the save format", () => {
    // The format is delimited by braces and bars, so a name carrying them would corrupt the file.
    const hero = parseHero(newHeroText("Bo{b}|x", backgroundByKey("poacher")));
    expect(hero.name).toBe("Bobx");
  });

  it("gives a nameless hero a name rather than an empty one", () => {
    expect(cleanName("   ")).toBe("Wanderer");
  });

  it("does not let a name run to a thousand characters", () => {
    expect(cleanName("a".repeat(500))).toHaveLength(24);
  });
});
