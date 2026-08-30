import { describe, expect, it } from "vitest";
import {
  calcCombat,
  itemAttack,
  itemDefend,
  itemSkill,
  type Equipment,
} from "../src/rules/combat.js";
import { describeItem, type ItemView } from "../src/ui/describe.js";

/**
 * Does the game do what the interface says it does?
 *
 * This exists because of a specific failure. The inventory told players which items a swap "would
 * replace" — `describe.ts` computed it correctly and had done since it was written — while the game
 * quietly appended to a list and replaced nothing, so five right-hand weapons could be worn at
 * once. Every individual piece passed its own tests. What nobody checked was whether the sentence
 * on the screen was *true*.
 *
 * So this walks the promises an item description makes and holds the rules to each one. It is
 * deliberately written from the wording a player sees, not from the implementation.
 */

function gear(
  traits: string[],
  base = { attack: 10, defend: 10, skill: 10, enchant: 0 },
): Equipment {
  return { ...base, traits: new Set(traits) };
}

function combat(traits: string[]) {
  return calcCombat({
    wits: 30,
    charm: 30,
    gear: [gear(["Right"])],
    fightRank: 0,
    magicRank: 0,
    thiefRank: 0,
    traits: new Set(traits),
  });
}

describe("what an item's description promises", () => {
  const plain = gear(["Right"]);

  it('"glows, lighting your way (+2 skill)"', () => {
    expect(itemSkill(gear(["Right", "Glows"])) - itemSkill(plain)).toBe(2);
  });

  it('"wreathed in flame (+8 attack in your right hand)" — and only the right hand', () => {
    expect(itemAttack(gear(["Right", "Flame"])) - itemAttack(plain)).toBe(8);
    expect(itemAttack(gear(["Left", "Flame"])) - itemAttack(gear(["Left"]))).toBe(0);
  });

  it('"blessed (+1 defence)"', () => {
    expect(itemDefend(gear(["Right", "Bless"])) - itemDefend(plain)).toBe(1);
  });

  it('"lucky (+12 skill in your right hand)" — and only the right hand', () => {
    expect(itemSkill(gear(["Right", "Lucky"])) - itemSkill(plain)).toBe(12);
    expect(itemSkill(gear(["Left", "Lucky"])) - itemSkill(gear(["Left"]))).toBe(0);
  });

  it("says a two-handed weapon takes both hands, and it does", () => {
    const pike: ItemView = {
      name: "Pike",
      attack: 20,
      defend: 0,
      skill: 0,
      enchant: 0,
      traits: ["right", "left"],
    };
    expect(describeItem(pike).join(" ")).toContain("Two-handed");
    // The rule itself lives in state.ts and is covered by equip.test.ts; this checks the sentence
    // exists to be checked against.
  });

  it("names everything a swap would replace, and nothing it would not", () => {
    const sword: ItemView = {
      name: "Sword",
      attack: 7,
      defend: 0,
      skill: 0,
      enchant: 0,
      traits: ["right"],
    };
    const shield: ItemView = {
      name: "Shield",
      attack: 0,
      defend: 5,
      skill: 0,
      enchant: 0,
      traits: ["left"],
    };
    const boots: ItemView = {
      name: "Boots",
      attack: 0,
      defend: 1,
      skill: 0,
      enchant: 0,
      traits: ["feet"],
    };
    const pike: ItemView = {
      name: "Pike",
      attack: 20,
      defend: 0,
      skill: 0,
      enchant: 0,
      traits: ["right", "left"],
    };
    const said = describeItem(pike, [sword, shield, boots]).join(" ");
    expect(said).toContain("Sword");
    expect(said).toContain("Shield");
    expect(said).not.toContain("Boots");
  });
});

describe("what a background's chooser promises", () => {
  const base = combat([]);

  it('"Strong: a tenth more Attack"', () => {
    expect(combat(["Strong"]).attack - base.attack).toBe(Math.trunc((base.attack + 9) / 10));
  });

  it('"Sturdy: a tenth more Defence"', () => {
    expect(combat(["Sturdy"]).defend - base.defend).toBe(Math.trunc((base.defend + 9) / 10));
  });

  it('"Agile: a tenth more Skill"', () => {
    expect(combat(["Agile"]).skill - base.skill).toBe(Math.trunc((base.skill + 9) / 10));
  });
});
