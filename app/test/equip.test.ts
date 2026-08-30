import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { armsOf, loadContent, type Content } from "../src/game/content.js";
import { apply, asFighter, characterFrom, type Game } from "../src/game/state.js";
import { parseHero, type CarriedArms } from "../src/game/hero.js";
import { newHeroText, backgroundByKey } from "../src/game/creation.js";
import { GameRandom } from "../src/rules/random.js";

/**
 * Wearing things, which is a rule and not a list operation.
 *
 * The port used to simply append to the gear list. You could wear five right-hand weapons at once,
 * two-handed pike included, for 55 Attack where one weapon gives 14 — and the inventory had been
 * telling you all along which item a swap "would replace", because `describe.ts` computes exactly
 * that. The interface promised a rule the game did not have, and nothing tested it.
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
    place: { kind: "status" },
    character: characterFrom(parseHero(newHeroText("Wearer", backgroundByKey("pedlar")))),
    quest: null,
    notices: [],
  };
}

function give(g: Game, ...names: string[]): void {
  for (const name of names) {
    g.character!.pack.push(armsOf(content.weapons.get(name)!));
  }
}

/** Equips whatever is at the top of the pack. */
function wear(g: Game, name: string): void {
  apply(g, { kind: "equip", index: g.character!.pack.findIndex((c) => c.name === name) });
}

const worn = (g: Game): string[] => g.character!.gear.map((c) => c.name);
const packed = (g: Game): string[] => g.character!.pack.map((c) => c.name);

describe("one slot, one thing in it", () => {
  it("a second sword displaces the first", () => {
    const g = game();
    give(g, "Long Sword", "Broad Sword");
    wear(g, "Long Sword");
    wear(g, "Broad Sword");
    expect(worn(g)).toEqual(["Broad Sword"]);
    expect(packed(g)).toContain("Long Sword");
  });

  it("never lets you hold five weapons at once", () => {
    // The bug, stated as a test: this used to give 55 Attack.
    const g = game();
    give(g, "Long Sword", "Battle Axe", "Pike", "Broad Sword", "Spear");
    for (const name of ["Long Sword", "Battle Axe", "Pike", "Broad Sword", "Spear"]) {
      wear(g, name);
    }
    expect(worn(g)).toHaveLength(1);
    expect(asFighter(g.character!).attack).toBeLessThan(20);
  });

  it("keeps everything: what comes off goes back into the pack", () => {
    const g = game();
    give(g, "Long Sword", "Broad Sword");
    const before = packed(g).length;
    wear(g, "Long Sword");
    wear(g, "Broad Sword");
    expect(packed(g).length + worn(g).length).toBe(before);
  });

  it("leaves other slots alone", () => {
    const g = game();
    give(g, "Long Sword", "Chain Suit", "Boots");
    wear(g, "Long Sword");
    wear(g, "Chain Suit");
    wear(g, "Boots");
    expect(worn(g).sort()).toEqual(["Boots", "Chain Suit", "Long Sword"]);
  });
});

describe("two-handed weapons", () => {
  it("cost you the shield as well as the sword", () => {
    // Sixteen weapons in the game claim both hands. This is what the shop has always implied.
    const g = game();
    give(g, "Long Sword", "Buckler", "Pike");
    wear(g, "Long Sword");
    wear(g, "Buckler");
    expect(worn(g).sort()).toEqual(["Buckler", "Long Sword"]);
    wear(g, "Pike");
    expect(worn(g)).toEqual(["Pike"]);
    expect(packed(g)).toContain("Long Sword");
    expect(packed(g)).toContain("Buckler");
  });

  it("and taking one off frees both hands again", () => {
    const g = game();
    give(g, "Pike", "Long Sword", "Buckler");
    wear(g, "Pike");
    apply(g, { kind: "unequip", index: 0 });
    wear(g, "Long Sword");
    wear(g, "Buckler");
    expect(worn(g).sort()).toEqual(["Buckler", "Long Sword"]);
  });
});

describe("what cannot be worn", () => {
  it("refuses something with no slot at all, and says why", () => {
    const g = game();
    g.character!.pack.push({
      kind: "arms",
      name: "Odd Trinket",
      attack: 99,
      defend: 99,
      skill: 99,
      traits: [],
      enchant: 0,
    });
    wear(g, "Odd Trinket");
    expect(worn(g)).toHaveLength(0);
    expect(g.notices.join(" ")).toContain("not something you can wear");
  });

  it("refuses to take off something cursed, and does not half-do the swap", () => {
    const g = game();
    const cursed: CarriedArms = {
      kind: "arms",
      name: "Cursed Blade",
      attack: 1,
      defend: 0,
      skill: 0,
      traits: ["right", "cursed"],
      enchant: 0,
    };
    g.character!.gear.push(cursed);
    give(g, "Long Sword");
    wear(g, "Long Sword");
    expect(worn(g)).toEqual(["Cursed Blade"]);
    expect(packed(g)).toContain("Long Sword");
    expect(g.notices.join(" ")).toContain("cursed");
  });

  it("will not unequip a cursed item directly either", () => {
    const g = game();
    g.character!.gear.push({
      kind: "arms",
      name: "Cursed Blade",
      attack: 1,
      defend: 0,
      skill: 0,
      traits: ["right", "cursed"],
      enchant: 0,
    });
    apply(g, { kind: "unequip", index: 0 });
    expect(worn(g)).toEqual(["Cursed Blade"]);
  });

  it("ignores a potion: only equipment is equipment", () => {
    const g = game();
    g.character!.pack.push({ kind: "count", name: "Healing Salve", count: 1 });
    apply(g, { kind: "equip", index: 0 });
    expect(worn(g)).toHaveLength(0);
    expect(packed(g)).toContain("Healing Salve");
  });
});

describe("the interface was telling the truth all along", () => {
  it("what the description says would be replaced is what actually is", () => {
    // describe.ts has always computed this. Now the game agrees with it.
    const g = game();
    give(g, "Long Sword", "Buckler", "Pike");
    wear(g, "Long Sword");
    wear(g, "Buckler");
    const before = new Set(worn(g));
    wear(g, "Pike");
    for (const name of before) {
      expect(packed(g), `${name} should have come off`).toContain(name);
    }
  });
});
