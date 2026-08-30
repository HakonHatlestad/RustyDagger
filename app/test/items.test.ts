import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadContent, type Content } from "../src/game/content.js";
import {
  Effect,
  describeUse,
  effectOf,
  endOfFight,
  isUsable,
  isUsableHere,
  useItem,
} from "../src/game/items.js";
import { Action, State, noPending, oneSidedRound, type Fighter } from "../src/rules/battle.js";
import { GameRandom } from "../src/rules/random.js";

/**
 * Consumables, against the numbers `itAgent` uses.
 *
 * The amounts are not a design choice made here — they are the 1997 ones, and they set how long a
 * fight can be sustained, which is the whole tactical game now that nothing else rations you.
 */

function json(path: string): never {
  return JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")) as never;
}

const content: Content = loadContent({
  arms: json("../../content/arms.json"),
  monsters: json("../../content/monsters.json"),
  gear: json("../../content/gear.json"),
});

function fighter(over: Partial<Fighter> = {}): Fighter {
  return {
    name: "H",
    guts: 60,
    wits: 30,
    charm: 30,
    attack: 20,
    defend: 10,
    skill: 40,
    wounds: 0,
    state: State.ALIVE,
    action: Action.ATTACK,
    traits: new Set<string>(),
    blastCharges: 0,
    disease: 0,
    blinded: false,
    panicked: false,
    bonusSwings: 0,
    strikeTraits: new Set<string>(),
    pending: noPending(),
    ...over,
  };
}

describe("reading effects off the exported content", () => {
  it("finds the effect numbers the Java build gives these items", () => {
    expect(effectOf(content, "Healing Salve")).toBe(Effect.HEAL);
    expect(effectOf(content, "Seltzer Water")).toBe(Effect.CURE);
    expect(effectOf(content, "Gold Apple")).toBe(Effect.REVIVE);
    expect(effectOf(content, "Ginseng Root")).toBe(Effect.HASTE);
    expect(effectOf(content, "Blinding Dust")).toBe(Effect.BLIND);
    expect(effectOf(content, "Panic Dust")).toBe(Effect.PANIC);
    expect(effectOf(content, "Blast Powder")).toBe(Effect.BLAST);
    expect(effectOf(content, "Food")).toBe(Effect.FOOD);
  });

  it("treats an item with no effect as not usable", () => {
    expect(isUsable(content, { kind: "count", name: "Quartz", count: 3 })).toBe(false);
    expect(isUsable(content, { kind: "count", name: "Healing Salve", count: 1 })).toBe(true);
  });

  it("does not offer an empty stack", () => {
    expect(isUsable(content, { kind: "count", name: "Healing Salve", count: 0 })).toBe(false);
  });

  it("only offers dust when there is something to throw it at", () => {
    const dust = { kind: "count", name: "Panic Dust", count: 1 } as const;
    const salve = { kind: "count", name: "Healing Salve", count: 1 } as const;
    expect(isUsableHere(content, dust, false)).toBe(false);
    expect(isUsableHere(content, dust, true)).toBe(true);
    expect(isUsableHere(content, salve, false)).toBe(true);
  });
});

describe("healing, at itAgent's amounts", () => {
  it("a salve is fifteen points, or twenty-five for a Medic", () => {
    const plain = fighter({ wounds: 40 });
    useItem(Effect.HEAL, plain, null, false, "Healing Salve");
    expect(plain.wounds).toBe(25);

    const medic = fighter({ wounds: 40, traits: new Set(["Medic"]) });
    useItem(Effect.HEAL, medic, null, true, "Healing Salve");
    expect(medic.wounds).toBe(15);
  });

  it("an apple is thirty points, or fifty for a Medic, and cures as well", () => {
    const hero = fighter({ wounds: 40, disease: 6, blinded: true });
    useItem(Effect.REVIVE, hero, null, false, "Gold Apple");
    expect(hero.wounds).toBe(10);
    expect(hero.disease).toBe(0);
    expect(hero.blinded).toBe(false);
  });

  it("food is two points, which is why it is not a plan", () => {
    const hero = fighter({ wounds: 10 });
    useItem(Effect.FOOD, hero, null, false, "Food");
    expect(hero.wounds).toBe(8);
  });

  it("never heals past whole", () => {
    const hero = fighter({ wounds: 3 });
    useItem(Effect.HEAL, hero, null, false, "Healing Salve");
    expect(hero.wounds).toBe(0);
  });

  it("refuses to be wasted on someone who is not hurt", () => {
    const hero = fighter({ wounds: 0 });
    const result = useItem(Effect.HEAL, hero, null, false, "Healing Salve");
    expect(result.used).toBe(false);
  });
});

describe("curing", () => {
  it("clears disease, blindness and panic together", () => {
    const hero = fighter({ disease: 9, blinded: true, panicked: true });
    const result = useItem(Effect.CURE, hero, null, false, "Seltzer Water");
    expect(result.used).toBe(true);
    expect(hero.disease).toBe(0);
    expect(hero.blinded).toBe(false);
    expect(hero.panicked).toBe(false);
  });

  it("is not spent when there is nothing to cure", () => {
    expect(useItem(Effect.CURE, fighter(), null, false, "Seltzer Water").used).toBe(false);
  });
});

describe("what you throw", () => {
  it("queues blinding rather than applying it, so one rule settles both dust and weapons", () => {
    const hero = fighter();
    const mob = fighter({ name: "M" });
    useItem(Effect.BLIND, hero, mob, false, "Blinding Dust");
    expect(hero.pending.blind).toBe(1);
    // Not blinded yet: it is settled when a blow lands.
    expect(mob.blinded).toBe(false);
  });

  it("will not throw dust at nothing", () => {
    expect(useItem(Effect.PANIC, fighter(), null, false, "Panic Dust").used).toBe(false);
  });

  it("readies a blast charge", () => {
    const hero = fighter();
    useItem(Effect.BLAST, hero, null, false, "Blast Powder");
    expect(hero.blastCharges).toBe(1);
  });

  it("hastens you by two swings, spent on the next round", () => {
    const hero = fighter();
    useItem(Effect.HASTE, hero, null, false, "Ginseng Root");
    expect(hero.bonusSwings).toBe(2);
    oneSidedRound(hero, fighter({ name: "M", guts: 4000 }), new GameRandom(3));
    expect(hero.bonusSwings).toBe(0);
  });
});

describe("what a fight leaves behind", () => {
  it("keeps wounds and disease but clears everything temporary", () => {
    const hero = fighter({
      wounds: 12,
      disease: 4,
      blinded: true,
      panicked: true,
      blastCharges: 2,
    });
    hero.pending.blind = 3;
    endOfFight(hero);
    expect(hero.wounds).toBe(12);
    expect(hero.disease).toBe(4);
    expect(hero.blinded).toBe(false);
    expect(hero.panicked).toBe(false);
    expect(hero.blastCharges).toBe(0);
    expect(hero.pending.blind).toBe(0);
  });
});

describe("telling the player what something does", () => {
  it("quotes the amount they will actually get", () => {
    expect(describeUse(Effect.HEAL, false)).toContain("15");
    expect(describeUse(Effect.HEAL, true)).toContain("25");
  });

  it("has something to say about every effect it implements", () => {
    for (const effect of Object.values(Effect)) {
      expect(describeUse(effect, false)).not.toContain("Nothing you know");
    }
  });
});
