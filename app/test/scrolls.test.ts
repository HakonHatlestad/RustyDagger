import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { armsOf, loadContent, type Content } from "../src/game/content.js";
import { Scroll, describeScroll, isScroll, readScroll } from "../src/game/scrolls.js";
import { apply, asFighter, characterFrom, toHero, type Game } from "../src/game/state.js";
import { parseHero, type CarriedArms } from "../src/game/hero.js";
import { backgroundByKey, newHeroText } from "../src/game/creation.js";
import { itemPower } from "../src/rules/combat.js";
import { GameRandom } from "../src/rules/random.js";

/**
 * Scrolls, and the enchantment ladder they buy.
 *
 * The point of these is economic, not tactical: every trait a scroll grants is one the combat code
 * already read, and the only new thing here is a way to reach them. Before this, the shops sold
 * about three thousand Marks of goods in total and nothing else in the game cost money.
 */

function json(path: string): never {
  return JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")) as never;
}

const content: Content = loadContent({
  arms: json("../../content/arms.json"),
  monsters: json("../../content/monsters.json"),
  gear: json("../../content/gear.json"),
});

function arms(name: string): CarriedArms {
  return armsOf(content.weapons.get(name)!);
}

/** A generous caster, so a test about the effect is not a test about the odds. */
const CLEVER = 100000;

function game(): Game {
  const g: Game = {
    content,
    rng: new GameRandom(3),
    place: { kind: "status" },
    character: characterFrom(parseHero(newHeroText("Mage", backgroundByKey("poacher")))),
    quest: null,
    notices: [],
  };
  g.character!.wits = CLEVER;
  g.character!.marks = 100000;
  return g;
}

describe("what a scroll is", () => {
  it("recognises every scroll in the content and nothing else", () => {
    for (const name of [
      "Glow Scroll",
      "Bless Scroll",
      "Luck Scroll",
      "Flame Scroll",
      "Enchant Scroll",
    ]) {
      expect(isScroll(content, name), name).toBe(true);
    }
    expect(isScroll(content, "Healing Salve")).toBe(false);
    expect(isScroll(content, "Long Sword")).toBe(false);
  });

  it("says what each one does", () => {
    for (const effect of [Scroll.GLOW, Scroll.BLESS, Scroll.LUCK, Scroll.FLAME, Scroll.ENCHANT]) {
      expect(describeScroll(effect)).not.toContain("Nothing you know");
    }
  });
});

describe("the scrolls that grant a trait", () => {
  it("adds the trait, which the combat code was already reading", () => {
    const rng = new GameRandom(1);
    const result = readScroll(Scroll.GLOW, arms("Long Sword"), CLEVER, 0, rng);
    expect(result.item?.traits).toContain("glows");
  });

  it("will not put the same trait on twice, and does not waste the scroll doing it", () => {
    const rng = new GameRandom(1);
    const glowing = readScroll(Scroll.GLOW, arms("Long Sword"), CLEVER, 0, rng).item!;
    const again = readScroll(Scroll.GLOW, glowing, CLEVER, 0, rng);
    expect(again.used).toBe(false);
    expect(again.item).toBe(glowing);
  });

  it("is spent even when the item resists it", () => {
    // A dim hero against a great weapon. The scroll burns either way.
    const rng = new GameRandom(1);
    let resisted = 0;
    for (let i = 0; i < 200; i++) {
      const r = readScroll(Scroll.FLAME, arms("Great Pike"), 1, 0, rng);
      if (r.item?.traits.includes("flame") !== true) {
        expect(r.used).toBe(true);
        resisted++;
      }
    }
    expect(resisted).toBeGreaterThan(150);
  });
});

describe("enchanting", () => {
  it("is safe while the enchantment is below the item's own power", () => {
    // A Long Sword has power 21, so the first twenty are never dangerous.
    const rng = new GameRandom(7);
    let item = arms("Long Sword");
    const power = itemPower({ ...item, traits: new Set<string>() });
    for (let i = 0; i < power; i++) {
      const r = readScroll(Scroll.ENCHANT, item, CLEVER, 0, rng);
      expect(r.item, `destroyed at ${String(i)} of ${String(power)}`).not.toBeNull();
      expect(r.wounds).toBe(0);
      item = r.item!;
    }
    expect(item.enchant).toBe(power);
  });

  it("eventually destroys an item pushed far past that, and wounds you for it", () => {
    const rng = new GameRandom(2);
    let item: CarriedArms | null = arms("Knife");
    let attempts = 0;
    let wounds = 0;
    while (item !== null && attempts < 400) {
      const r: ReturnType<typeof readScroll> = readScroll(Scroll.ENCHANT, item, CLEVER, 0, rng);
      item = r.item;
      wounds = r.wounds;
      attempts++;
    }
    expect(item, "a knife survived 400 enchantments").toBeNull();
    expect(wounds).toBeGreaterThan(0);
  });

  it("lets a better weapon take far more than a worse one", () => {
    // This is what makes the ladder a ladder: good gear is worth enchanting, a knife is not.
    const safeSteps = (name: string): number =>
      itemPower({ ...arms(name), traits: new Set<string>() });
    expect(safeSteps("Great Pike")).toBeGreaterThan(safeSteps("Knife") * 10);
  });

  it("raises the numbers you fight with", () => {
    const g = game();
    const c = g.character!;
    c.gear.push(arms("Long Sword"));
    const before = asFighter(c).skill;
    for (let i = 0; i < 5; i++) {
      c.gear[c.gear.length - 1] = { ...(c.gear[c.gear.length - 1] as CarriedArms), enchant: i + 1 };
    }
    expect(asFighter(c).skill).toBeGreaterThan(before);
  });

  it("survives a trip through a save file", () => {
    const g = game();
    g.character!.gear.push({ ...arms("Long Sword"), enchant: 4 });
    const again = characterFrom(toHero(g.character!));
    const sword = again.gear.find((x) => x.name === "Long Sword");
    expect(sword?.kind === "arms" ? sword.enchant : 0).toBe(4);
  });

  it("leaves an unenchanted item byte for byte as it was", () => {
    // Writing `Enchant 0` into every sword would churn every save for nothing.
    const g = game();
    g.character!.gear.push(arms("Long Sword"));
    expect(JSON.stringify(toHero(g.character!).gear)).not.toContain("Enchant");
  });
});

describe("reading one in the game", () => {
  it("spends the scroll and improves what you are wearing", () => {
    const g = game();
    g.character!.gear.push(arms("Long Sword"));
    g.character!.pack.push({ kind: "count", name: "Enchant Scroll", count: 2 });
    const scrollIndex = g.character!.pack.length - 1;
    apply(g, { kind: "readScroll", scrollIndex, target: g.character!.gear.length - 1 });
    const sword = g.character!.gear.at(-1);
    expect(sword?.kind === "arms" ? sword.enchant : 0).toBe(1);
    const left = g.character!.pack.find((c) => c.name === "Enchant Scroll");
    expect(left?.kind === "count" ? left.count : 0).toBe(1);
  });

  it("refuses to read something that is not a scroll", () => {
    const g = game();
    g.character!.gear.push(arms("Long Sword"));
    g.character!.pack.push({ kind: "count", name: "Healing Salve", count: 1 });
    apply(g, {
      kind: "readScroll",
      scrollIndex: g.character!.pack.length - 1,
      target: g.character!.gear.length - 1,
    });
    expect(g.character!.pack.some((c) => c.name === "Healing Salve")).toBe(true);
  });

  it("can kill you, if you push an enchantment far enough", () => {
    const g = game();
    const c = g.character!;
    c.gear.push({ ...arms("Knife"), enchant: 9999 });
    c.wounds = c.guts - 1;
    c.pack.push({ kind: "count", name: "Enchant Scroll", count: 1 });
    apply(g, { kind: "readScroll", scrollIndex: c.pack.length - 1, target: c.gear.length - 1 });
    expect(g.place.kind).toBe("fallen");
    expect(c.gear.some((x) => x.name === "Knife")).toBe(false);
  });
});
