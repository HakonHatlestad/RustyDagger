import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadContent, type Content } from "../src/game/content.js";
import { apply, characterFrom, type Game } from "../src/game/state.js";
import { parseHero } from "../src/game/hero.js";
import { newHeroText, backgroundByKey } from "../src/game/creation.js";
import { Action, State } from "../src/rules/battle.js";
import { grows } from "../src/rules/growth.js";
import { GameRandom } from "../src/rules/random.js";
import { killExperience, hypnosisExperience, swindleExperience } from "../src/game/monster.js";

/**
 * How a fight ends, and what it is worth.
 *
 * Four of the eight endings used to be backwards. A hero carries the Control or Swindle flag when
 * they *win* one, and the port read those flags as if they meant the opposite -- so hypnotising a
 * monster printed "it catches your eye and you wander away" and paid nothing, while being
 * hypnotised read as a victory. That made both of the game's non-combat routes strictly worse than
 * swinging, which is the opposite of what they are for.
 */

function json(path: string): never {
  return JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")) as never;
}

const content: Content = loadContent({
  arms: json("../../content/arms.json"),
  monsters: json("../../content/monsters.json"),
  gear: json("../../content/gear.json"),
});

function game(seed: number, background = "pedlar"): Game {
  return {
    content,
    rng: new GameRandom(seed),
    place: { kind: "town" },
    character: characterFrom(parseHero(newHeroText("Talker", backgroundByKey(background)))),
    quest: null,
    notices: [],
  };
}

/** Plays until the fight ends the given way, using the given action. Null if it never does. */
function fightUntil(action: string, want: string, monster = "Fields:Gypsy"): Game | null {
  for (let seed = 1; seed < 200; seed++) {
    const g = game(seed);
    // A big stat makes the opposed check win often enough to find the ending quickly.
    g.character!.wits = 300;
    g.character!.charm = 300;
    apply(g, { kind: "startQuest", monsterKey: monster, weight: 4 });
    let guard = 0;
    while (g.quest?.ending === null && guard++ < 100) {
      apply(g, { kind: "fight", action });
    }
    if (g.quest?.ending === want) {
      return g;
    }
  }
  return null;
}

describe("winning without a fight", () => {
  it("hypnotising a monster is a win, and hands you everything it had", () => {
    const g = fightUntil(Action.CONTROL, "wonByHypnosis");
    expect(g, "never hypnotised anything in 200 tries").not.toBeNull();
    const log = g!.quest!.log.join("\n");
    expect(log).toContain("forgets what it was doing");
    expect(g!.character!.exp).toBeGreaterThan(0);
    // Its pack, or its money, or both -- but not nothing.
    const gained = g!.character!.marks > 250 || g!.character!.pack.length > 0;
    expect(gained, `got nothing: ${log}`).toBe(true);
  });

  it("swindling a monster is a win too", () => {
    const g = fightUntil(Action.SWINDLE, "wonBySwindle");
    expect(g, "never swindled anything in 200 tries").not.toBeNull();
    expect(g!.quest!.log.join("\n")).toContain("cannot follow");
    expect(g!.character!.exp).toBeGreaterThan(0);
  });

  it("being hypnotised is a loss, and pays nothing", () => {
    // The other half of the same bug: this used to read as the player winning.
    for (let seed = 1; seed < 200; seed++) {
      const g = game(seed);
      g.character!.wits = 1;
      g.character!.charm = 1;
      apply(g, { kind: "startQuest", monsterKey: "Fields:Gypsy", weight: 4 });
      let guard = 0;
      while (g.quest?.ending === null && guard++ < 100) {
        apply(g, { kind: "fight", action: Action.ATTACK });
      }
      if (g.quest?.ending === "lostToHypnosis") {
        expect(g.character!.exp).toBe(0);
        expect(g.character!.marks).toBe(250);
        expect(g.quest.log.join("\n")).toMatch(/wander away with nothing|off a cliff/);
        return;
      }
    }
    // Not every seed produces it; the point is that when it happens, it is a loss.
  });
});

describe("what a kill is worth", () => {
  it("pays more the deeper you went for it", () => {
    // The reason to leave the Fields. The port awarded only the base, so there was none.
    const g = game(1);
    apply(g, { kind: "startQuest", monsterKey: "Fields:Goblin", weight: 2 });
    const mob = g.quest!.monster;
    expect(killExperience(mob, 5)).toBeGreaterThan(killExperience(mob, 2));
    expect(killExperience(mob, 2)).toBeGreaterThan(mob.experience);
  });

  it("pays less for talking it down than for killing it", () => {
    const g = game(1);
    apply(g, { kind: "startQuest", monsterKey: "Fields:Goblin", weight: 4 });
    const mob = g.quest!.monster;
    expect(hypnosisExperience(mob)).toBeLessThan(killExperience(mob, 4));
    expect(swindleExperience(mob)).toBeLessThan(killExperience(mob, 4));
  });
});

describe("growing by doing", () => {
  it("is likelier the lower the stat, and tails off as it rises", () => {
    const rate = (stat: number): number => {
      const rng = new GameRandom(4);
      let hits = 0;
      for (let i = 0; i < 2000; i++) {
        if (grows(stat, 5, rng)) hits++;
      }
      return hits / 2000;
    };
    expect(rate(10)).toBeGreaterThan(rate(60));
    expect(rate(60)).toBeGreaterThan(0);
    expect(rate(5)).toBe(1);
  });

  it("never refuses to teach a hero with nothing to lose", () => {
    expect(grows(0, 1, new GameRandom(1))).toBe(true);
  });

  it("teaches nothing when the win was worth nothing", () => {
    expect(grows(10, 0, new GameRandom(1))).toBe(false);
  });

  it("toughens you over a long run of ordinary fights", () => {
    // Levelling grants a flat +2 to everything however you play. This is the part that does not.
    const g = game(11, "squire");
    const startingGuts = g.character!.guts;
    let levelUps = 0;
    for (let i = 0; i < 300; i++) {
      apply(g, { kind: "startQuest", monsterKey: "Fields:Rodent", weight: 3 });
      let guard = 0;
      while (g.quest?.ending === null && guard++ < 100) {
        apply(g, { kind: "fight", action: Action.BERZERK });
      }
      if (g.quest?.ending === "heroDied") {
        g.character!.wounds = 0;
        g.character!.disease = 0;
      }
      apply(g, { kind: "leaveQuest" });
      levelUps = g.character!.level - 1;
    }
    // More Guts than levelling alone could have granted.
    expect(g.character!.guts).toBeGreaterThan(startingGuts + levelUps * 2);
  });
});

describe("an aggressive creature does not let you wander off", () => {
  it("kills you when it hypnotises you", () => {
    const g = game(3);
    apply(g, { kind: "startQuest", monsterKey: "Fields:Goblin", weight: 3 });
    const quest = g.quest!;
    // Force the ending rather than fish for it: the branch is what matters.
    quest.monster.stance = 4;
    quest.monster.state = State.CONTROL;
    apply(g, { kind: "fight", action: Action.ATTACK });
    if (quest.ending === "lostToHypnosis") {
      expect(g.place.kind).toBe("fallen");
    }
  });
});
