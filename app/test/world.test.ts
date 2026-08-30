import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadContent, type Content } from "../src/game/content.js";
import { REGIONS, regionByKey } from "../src/game/world.js";
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

  it("gets harder as you go down the list", () => {
    const levels = REGIONS.map((r) => r.advisedLevel);
    expect(levels[0]).toBe(1);
    expect(Math.max(...levels)).toBeGreaterThan(5);
  });

  it("falls back to somewhere survivable when asked for a region that is not there", () => {
    expect(regionByKey("atlantis").key).toBe("fields");
  });
});

describe("the shops", () => {
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
