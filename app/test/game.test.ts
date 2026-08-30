import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadContent, type Content } from "../src/game/content.js";
import { balance, spread, stanceFor, Stance, advanceStance } from "../src/game/monster.js";
import { parseHero } from "../src/game/hero.js";
import {
  apply,
  asFighter,
  characterFrom,
  expFraction,
  healthFraction,
  lossOnFalling,
  recover,
  toHero,
  type Game,
} from "../src/game/state.js";
import { GameRandom } from "../src/rules/random.js";

function json(path: string): never {
  return JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")) as never;
}

const content: Content = loadContent({
  arms: json("../../content/arms.json"),
  monsters: json("../../content/monsters.json"),
  gear: json("../../content/gear.json"),
});

function newGame(seed = 1): Game {
  const hero = parseHero(
    readFileSync(fileURLToPath(new URL("../../saves/Timber.hero", import.meta.url)), "utf8"),
  );
  return {
    content,
    rng: new GameRandom(seed),
    place: { kind: "town" },
    character: characterFrom(hero),
    quest: null,
    notices: [],
  };
}

describe("loading the exported content", () => {
  it("reads every weapon, monster and gear entry", () => {
    expect(content.weapons.size).toBeGreaterThan(80);
    expect(content.monsters.size).toBeGreaterThan(50);
    expect(content.gear.size).toBeGreaterThan(50);
  });

  it("reads a weapon's stats and slots", () => {
    const sword = content.weapons.get("Long Sword");
    expect(sword?.attack).toBeGreaterThan(0);
    expect(sword?.traits).toContain("right");
  });

  it("reads a monster's stats, passion and options", () => {
    const centaur = content.monsters.get("Fields:Centaur");
    expect(centaur?.guts).toBeGreaterThan(0);
    expect(centaur?.passion.length).toBeGreaterThan(0);
    expect(centaur?.options).toContain("trade");
  });

  it("gives every monster a passion the game recognises", () => {
    const known = ["passive", "timid", "defensive", "hostile", "aggressive"];
    for (const m of content.monsters.values()) {
      expect(known, m.key).toContain(m.passion);
    }
  });
});

describe("meeting a monster", () => {
  it("spreads stats so no two encounters are identical", () => {
    const rng = new GameRandom(3);
    const rolls = new Set(Array.from({ length: 50 }, () => spread(40, rng)));
    expect(rolls.size).toBeGreaterThan(3);
  });

  it("never spreads below five sevenths of the value", () => {
    const rng = new GameRandom(4);
    for (let i = 0; i < 500; i++) {
      expect(spread(70, rng)).toBeGreaterThanOrEqual(Math.trunc((70 * 5) / 7));
    }
  });

  it("scales a monster to the hero's level", () => {
    const def = content.monsters.get("Fields:Centaur")!;
    const strength = (level: number): number => {
      const rng = new GameRandom(9);
      let total = 0;
      for (let i = 0; i < 200; i++) total += balance(def, level, 3, rng).guts;
      return total;
    };
    expect(strength(20)).toBeGreaterThan(strength(1) * 2);
  });

  it("maps passion onto a starting stance, defaulting to defensive", () => {
    expect(stanceFor("aggressive")).toBe(Stance.AGGRESSIVE);
    expect(stanceFor("passive")).toBe(Stance.PASSIVE);
    expect(stanceFor("nonsense")).toBe(Stance.DEFENSIVE);
  });

  it("escalates a hostile monster but leaves a passive one alone", () => {
    const def = content.monsters.get("Fields:Centaur")!;
    const rng = new GameRandom(1);
    const calm = { ...balance(def, 1, 3, rng), stance: Stance.PASSIVE };
    advanceStance(calm);
    expect(calm.stance).toBe(Stance.PASSIVE);

    const angry = { ...balance(def, 1, 3, rng), stance: Stance.HOSTILE };
    advanceStance(angry);
    expect(angry.stance).toBe(Stance.AGGRESSIVE);
  });

  it("is worth experience and fame", () => {
    const def = content.monsters.get("Hills:Dragon")!;
    const dragon = balance(def, 10, 5, new GameRandom(2));
    expect(dragon.experience).toBeGreaterThan(0);
    expect(dragon.fame).toBeGreaterThan(0);
  });
});

describe("a character loaded from a save", () => {
  it("carries the money out of the pack rather than leaving it as an item", () => {
    const game = newGame();
    expect(game.character!.marks).toBe(100);
    expect(game.character!.pack.some((c) => c.name === "Marks")).toBe(false);
  });

  it("becomes a combatant with gear folded into the stats", () => {
    const game = newGame();
    const fighter = asFighter(game.character!);
    expect(fighter.skill).toBeGreaterThan(0);
    expect(fighter.name).toBe("Timber");
  });

  it("reports health and progress as fractions for the display", () => {
    const game = newGame();
    const c = game.character!;
    expect(healthFraction(c)).toBe(1);
    c.wounds = Math.trunc(c.guts / 2);
    expect(healthFraction(c)).toBeCloseTo(0.5, 1);
    expect(expFraction(c)).toBeGreaterThanOrEqual(0);
    expect(expFraction(c)).toBeLessThanOrEqual(1);
  });
});

describe("writing a character back to a save", () => {
  it("round-trips everything the port models", () => {
    const game = newGame();
    const c = game.character!;
    c.marks = 4321;
    c.exp = 99;
    c.level = 6;
    c.wounds = 12;
    c.disease = 3;
    const again = characterFrom(toHero(c));
    expect(again.marks).toBe(4321);
    expect(again.exp).toBe(99);
    expect(again.level).toBe(6);
    expect(again.wounds).toBe(12);
    expect(again.disease).toBe(3);
    expect(again.name).toBe(c.name);
    expect(again.gear.map((g) => g.name)).toEqual(c.gear.map((g) => g.name));
  });

  it("keeps the parts of a 1997 hero the port does not model", () => {
    // A character who visits the new app must be able to go back to the Java build unharmed.
    const game = newGame();
    const c = game.character!;
    const hero = toHero(c);
    expect(hero.rank.get("Social")).toBe(c.origin.rank.get("Social"));
    expect(hero.values.get("place")).toBe(c.origin.values.get("place"));
  });

  it("puts money back where it came from, as an item in the pack", () => {
    const game = newGame();
    game.character!.marks = 77;
    const marks = toHero(game.character!).pack.find((c) => c.name === "Marks");
    expect(marks?.kind === "count" ? marks.count : 0).toBe(77);
  });
});

describe("the loop", () => {
  it("moves between places", () => {
    const game = newGame();
    apply(game, { kind: "goTo", place: { kind: "status" } });
    expect(game.place.kind).toBe("status");
  });

  it("starts a quest and meets something", () => {
    const game = newGame();
    apply(game, { kind: "startQuest", monsterKey: "Fields:Rodent", weight: 2 });
    expect(game.place.kind).toBe("quest");
    expect(game.quest?.monster.name.length).toBeGreaterThan(0);
  });

  it("never runs out of quests, because the daily ration is gone", () => {
    // The 1997 game rations quests by day. Nothing here counts them at all -- see the note at the
    // top of state.ts. Twenty in a row is not special; it is simply what the game now allows.
    const game = newGame();
    for (let i = 0; i < 20; i++) {
      apply(game, { kind: "startQuest", monsterKey: "Fields:Rodent", weight: 2 });
      expect(game.place.kind).toBe("quest");
      apply(game, { kind: "leaveQuest" });
    }
  });

  it("fights to a finish and records how it ended", () => {
    const game = newGame(7);
    apply(game, { kind: "startQuest", monsterKey: "Fields:Rodent", weight: 2 });
    let guard = 0;
    while (game.quest?.ending === null && guard < 200) {
      apply(game, { kind: "fight", action: "Attack" });
      guard++;
    }
    expect(game.quest?.ending).not.toBeNull();
    expect(game.quest!.log.length).toBeGreaterThan(1);
  });

  it("awards experience and can level you up on a win", () => {
    // Run several fights until one is won, then check the reward landed.
    for (let seed = 1; seed < 60; seed++) {
      const game = newGame(seed);
      const before = game.character!.exp;
      apply(game, { kind: "startQuest", monsterKey: "Fields:Rodent", weight: 2 });
      let guard = 0;
      while (game.quest?.ending === null && guard < 200) {
        apply(game, { kind: "fight", action: "Attack" });
        guard++;
      }
      if (game.quest?.ending === "heroWon") {
        const c = game.character!;
        // Either experience went up, or it levelled and the surplus carried over.
        expect(c.exp > before || c.level > 1).toBe(true);
        return;
      }
    }
    expect.unreachable("no fight was won in 60 attempts");
  });

  it("costs a tenth of your purse when you lose, and nothing else", () => {
    for (let seed = 1; seed < 80; seed++) {
      const game = newGame(seed);
      const before = {
        marks: game.character!.marks,
        level: game.character!.level,
        gear: game.character!.gear.length,
        pack: game.character!.pack.length,
      };
      apply(game, { kind: "startQuest", monsterKey: "Hills:Dragon", weight: 5 });
      let guard = 0;
      while (game.quest?.ending === null && guard < 200) {
        apply(game, { kind: "fight", action: "Attack" });
        guard++;
      }
      if (game.quest?.ending === "heroDied") {
        expect(game.place.kind).toBe("fallen");
        recover(game);
        // Proportional, so it is the same decision whether you are rich or new.
        expect(game.character!.marks).toBe(before.marks - lossOnFalling(before.marks));
        expect(game.character!.level).toBe(before.level);
        expect(game.character!.gear).toHaveLength(before.gear);
        expect(game.character!.pack).toHaveLength(before.pack);
        expect(game.character!.wounds).toBe(0);
        expect(game.place.kind).toBe("town");
        return;
      }
    }
    expect.unreachable("a level-1 hero never died to a dragon in 80 attempts");
  });

  it("ignores a fight move once the quest is over", () => {
    const game = newGame(7);
    apply(game, { kind: "startQuest", monsterKey: "Fields:Rodent", weight: 2 });
    let guard = 0;
    while (game.quest?.ending === null && guard < 200) {
      apply(game, { kind: "fight", action: "Attack" });
      guard++;
    }
    const logLength = game.quest!.log.length;
    apply(game, { kind: "fight", action: "Attack" });
    expect(game.quest!.log).toHaveLength(logLength);
  });

  it("equips and unequips gear", () => {
    const game = newGame();
    const c = game.character!;
    c.pack.push({
      kind: "arms",
      name: "Knife",
      attack: 2,
      defend: 0,
      skill: 1,
      traits: ["right"],
      enchant: 0,
    });
    const index = c.pack.length - 1;
    const beforeAttack = asFighter(c).attack;
    apply(game, { kind: "equip", index });
    expect(c.gear.some((g) => g.name === "Knife")).toBe(true);
    expect(asFighter(c).attack).toBeGreaterThan(beforeAttack);
    apply(game, { kind: "unequip", index: c.gear.length - 1 });
    expect(c.gear.some((g) => g.name === "Knife")).toBe(false);
  });

  it("refuses to equip something that is not equipment", () => {
    const game = newGame();
    const c = game.character!;
    const before = c.gear.length;
    const noteIndex = c.pack.findIndex((i) => i.kind === "opaque");
    apply(game, { kind: "equip", index: noteIndex });
    expect(c.gear).toHaveLength(before);
  });

  it("leaves a quest and returns to the fields", () => {
    const game = newGame();
    apply(game, { kind: "startQuest", monsterKey: "Fields:Rodent", weight: 2 });
    apply(game, { kind: "leaveQuest" });
    expect(game.quest).toBeNull();
    expect(game.place.kind).toBe("fields");
  });
});
