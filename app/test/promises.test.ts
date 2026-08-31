import { describe, expect, it } from "vitest";
import {
  calcCombat,
  itemAttack,
  itemDefend,
  itemSkill,
  type Equipment,
} from "../src/rules/combat.js";
import { describeItem, itemWorth, type ItemView } from "../src/ui/describe.js";
import { Effect, describeUse, healingFor } from "../src/game/items.js";
import { State, noPending } from "../src/rules/battle.js";

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
  base = { attack: 10, defend: 10, skill: 10, enchant: 0, forged: 0, tempered: 0 },
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
      forged: 0,
      tempered: 0,
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
      forged: 0,
      tempered: 0,
      traits: ["right"],
    };
    const shield: ItemView = {
      name: "Shield",
      attack: 0,
      defend: 5,
      skill: 0,
      enchant: 0,
      forged: 0,
      tempered: 0,
      traits: ["left"],
    };
    const boots: ItemView = {
      name: "Boots",
      attack: 0,
      defend: 1,
      skill: 0,
      enchant: 0,
      forged: 0,
      tempered: 0,
      traits: ["feet"],
    };
    const pike: ItemView = {
      name: "Pike",
      attack: 20,
      defend: 0,
      skill: 0,
      enchant: 0,
      forged: 0,
      tempered: 0,
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

describe("what a smith promises", () => {
  it('"another point of Attack" means the fight sees another point of Attack', () => {
    // The shop bench says a reforging buys a point of Attack. This is that sentence, checked
    // against `calcCombat` rather than against the sentence next to it.
    const plain = calcCombat({
      wits: 30,
      charm: 30,
      gear: [gear([])],
      fightRank: 0,
      magicRank: 0,
      thiefRank: 0,
      traits: new Set<string>(),
    });
    const reforged = calcCombat({
      wits: 30,
      charm: 30,
      gear: [{ ...gear([]), forged: 1 }],
      fightRank: 0,
      magicRank: 0,
      thiefRank: 0,
      traits: new Set<string>(),
    });
    expect(reforged.attack).toBe(plain.attack + 1);
    expect(reforged.defend).toBe(plain.defend);
  });

  it('"another point of Defence" likewise, and it does not leak into Attack', () => {
    const base = {
      wits: 30,
      charm: 30,
      fightRank: 0,
      magicRank: 0,
      thiefRank: 0,
      traits: new Set<string>(),
    };
    const plain = calcCombat({ ...base, gear: [gear([])] });
    const tempered = calcCombat({ ...base, gear: [{ ...gear([]), tempered: 2 }] });
    expect(tempered.defend).toBe(plain.defend + 2);
    expect(tempered.attack).toBe(plain.attack);
  });

  it("shows a reforged weapon at its real worth in the inventory comparison", () => {
    // The inventory prints a +N against what you are wearing. If the view dropped the smith's
    // points it would understate a forged weapon and quietly advise a bad swap -- which is the
    // exact class of bug this file exists for.
    const worn: ItemView = {
      name: "Long Sword",
      attack: 15,
      defend: 0,
      skill: 0,
      enchant: 0,
      forged: 0,
      tempered: 0,
      traits: ["right"],
    };
    const forgedSword: ItemView = { ...worn, name: "Same Sword", forged: 5 };
    expect(itemWorth(forgedSword)).toBe(itemWorth(worn) + 5);
  });
});

describe("what a draught promises", () => {
  /** A fighter with the given Guts and fully wounded, so any heal has room to land. */
  function hurt(guts: number) {
    return {
      name: "H",
      guts,
      wits: 30,
      charm: 30,
      attack: 0,
      defend: 0,
      skill: 10,
      wounds: guts - 1,
      state: State.ALIVE,
      action: "Attack",
      traits: new Set<string>(),
      blastCharges: 0,
      disease: 0,
      blinded: false,
      panicked: false,
      bonusSwings: 0,
      roundsFought: 0,
      wise: false,
      winded: false,
      reached: false,
      strikeTraits: new Set<string>(),
      pending: noPending(),
    };
  }

  it('"15 points, or a quarter of your Guts if that is more" means exactly that', () => {
    // The trader's shelf says this. A starting hero is on the flat figure and a trained one is
    // not, and both halves of the sentence have to hold or the shelf is lying.
    expect(describeUse(Effect.HEAL, false)).toContain("15 points");
    expect(describeUse(Effect.HEAL, false)).toContain("quarter of your Guts");
    // 60 Guts: a quarter is 15, so the flat figure stands and nothing changed for a newcomer.
    expect(healingFor(hurt(60), 15, 4)).toBe(15);
    // 400 Guts: a quarter is 100, and that is what a salve is worth to that body.
    expect(healingFor(hurt(400), 15, 4)).toBe(100);
  });

  it('"half of your Guts" for the stronger draught, and the medic does better', () => {
    expect(describeUse(Effect.REVIVE, false)).toContain("half of your Guts");
    expect(describeUse(Effect.REVIVE, true)).toContain("two thirds");
    expect(healingFor(hurt(400), 30, 2)).toBe(200);
    expect(healingFor(hurt(400), 50, 1.5)).toBe(266);
  });

  it("says the interface offers nothing it cannot deliver for every effect it lists", () => {
    // Every effect the game implements gets a sentence, and no sentence is the fallback.
    for (const effect of Object.values(Effect)) {
      expect(describeUse(effect, false)).not.toBe("Nothing you know how to use.");
    }
  });
});
