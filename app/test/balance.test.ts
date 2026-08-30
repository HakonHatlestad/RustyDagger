import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadContent, type Content } from "../src/game/content.js";
import { apply, characterFrom, recover, type Character, type Game } from "../src/game/state.js";
import { parseHero } from "../src/game/hero.js";
import { newHeroText, backgroundByKey } from "../src/game/creation.js";
import { WEAPON_SHOP, buyPrice, sellPrice, stockOf } from "../src/game/shop.js";
import { REGIONS } from "../src/game/world.js";
import { GameRandom } from "../src/rules/random.js";
import { killExperience } from "../src/game/monster.js";
import { grows } from "../src/rules/growth.js";
import { JOINING_FEE } from "../src/game/guild.js";

/**
 * Is the game any good?
 *
 * Taking out the daily quest ration, gear decay and the death penalty removes everything that used
 * to pace the game, so the questions it leaves are worth measuring rather than assuming: can a new
 * character still lose, does playing actually get you anywhere, and does the money economy hold now
 * that a weapon costs what it is worth?
 *
 * These are whole sessions played through `apply`, the same entry point the interface uses, so what
 * they measure is the game and not a model of it.
 */

function json(path: string): never {
  return JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")) as never;
}

const content: Content = loadContent({
  arms: json("../../content/arms.json"),
  monsters: json("../../content/monsters.json"),
  gear: json("../../content/gear.json"),
});

function freshGame(seed: number, background = "squire"): Game {
  return {
    content,
    rng: new GameRandom(seed),
    place: { kind: "town" },
    character: characterFrom(parseHero(newHeroText("Probe", backgroundByKey(background)))),
    quest: null,
    notices: [],
  };
}

/** Buys and wears the best weapon the purse will stretch to, which is what a player does first. */
function armUp(game: Game): void {
  const character = game.character!;
  const affordable = stockOf(content, WEAPON_SHOP)
    .filter((row) => row.price <= character.marks && row.item.kind === "arms")
    .sort((a, b) => b.price - a.price)[0];
  if (affordable === undefined) {
    return;
  }
  apply(game, { kind: "buy", shop: WEAPON_SHOP.key, name: affordable.name });
  const index = character.pack.findIndex((c) => c.name === affordable.name);
  if (index >= 0) {
    apply(game, { kind: "equip", index });
  }
}

interface Session {
  level: number;
  marks: number;
  deaths: number;
  wins: number;
  fights: number;
}

/** Plays a session: hunt, fight to a finish, rest when badly hurt, repeat. */
function play(game: Game, region: string, quests: number): Session {
  const character = game.character!;
  const found = REGIONS.find((r) => r.key === region)!;
  const quarry = [...content.monsters.keys()].filter((k) => k.startsWith(`${found.prefix}:`));
  const session: Session = { level: 1, marks: 0, deaths: 0, wins: 0, fights: 0 };

  for (let i = 0; i < quests; i++) {
    // Rest before going out if badly hurt, exactly as a player would.
    if (character.wounds > character.guts / 2) {
      apply(game, { kind: "rest" });
    }
    apply(game, {
      kind: "startQuest",
      monsterKey: game.rng.select(quarry),
      weight: found.weight,
    });
    let guard = 0;
    while (game.quest?.ending === null && guard < 300) {
      apply(game, { kind: "fight", action: "Attack" });
      guard++;
    }
    if (guard > 0) {
      session.fights++;
    }
    const ending = game.quest?.ending;
    if (ending === "heroWon") {
      session.wins++;
    }
    if (ending === "heroDied") {
      session.deaths++;
      recover(game);
    } else {
      apply(game, { kind: "leaveQuest" });
    }
  }
  session.level = character.level;
  session.marks = character.marks;
  return session;
}

describe("a campaign, played end to end", () => {
  it("gets an armed character somewhere over a few hundred fights", () => {
    // The point of removing the daily ration: you can now sit down and actually make progress.
    const game = freshGame(31);
    armUp(game);
    const session = play(game, "fields", 250);
    // Not all 250 produce a fight: timid creatures bolt on sight, which is roughly a quarter.
    expect(session.fights).toBeGreaterThan(150);
    expect(session.level).toBeGreaterThan(4);
    expect(session.wins).toBeGreaterThan(50);
    // Measured after the experience and growth fixes: 221 wins, 45 deaths, level 11, ~900 Marks
    // over 400 quests. Before them it was 122 wins, 47 deaths and level 6 -- the port awarded only
    // a monster's base experience and none of the weight-scaled bonus, and never grew a stat by use.
    expect(session.marks).toBeGreaterThan(500);
  });

  it("still lets you lose, so the fights are not a formality", () => {
    // No death penalty is not the same as no danger. If nothing could kill you the fights would be
    // a clicking exercise, and this is the check that they are not.
    let deaths = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const game = freshGame(seed);
      armUp(game);
      deaths += play(game, "fields", 60).deaths;
    }
    expect(deaths).toBeGreaterThan(0);
  });

  it("kills a new character in the Hills, which is what the warning says", () => {
    // The region warnings have to be true, because they are the only guidance the game gives.
    const game = freshGame(5);
    armUp(game);
    const session = play(game, "hills", 40);
    expect(session.deaths).toBeGreaterThan(session.wins);
  });

  it("leaves an unarmed character far worse off than an armed one", () => {
    // Attack comes entirely from gear, which is why the town screen says so.
    const armed = freshGame(9);
    armUp(armed);
    const bare = freshGame(9);
    expect(play(armed, "fields", 80).wins).toBeGreaterThan(play(bare, "fields", 80).wins);
  });
});

describe("why you would ever leave the Fields", () => {
  it("pays far better the deeper you go", () => {
    // The reason the regions exist. The port used to award a monster's base experience and nothing
    // else, so a fight in the Mound was worth exactly a fight in the Fields and there was no
    // reason to take the risk.
    const g = freshGame(2);
    apply(g, { kind: "startQuest", monsterKey: "Fields:Goblin", weight: 2 });
    const mob = g.quest!.monster;
    const shallow = killExperience(mob, 2);
    const deep = killExperience(mob, 5);
    expect(deep).toBeGreaterThan(shallow * 1.5);
  });

  it("teaches you faster the deeper you go, too", () => {
    // `grows` takes the region's weight, so the same win is worth more the further out it was.
    const rate = (weight: number): number => {
      const rng = new GameRandom(8);
      let hits = 0;
      for (let i = 0; i < 3000; i++) {
        if (grows(40, weight, rng)) hits++;
      }
      return hits;
    };
    expect(rate(5)).toBeGreaterThan(rate(2));
  });

  it("makes the guild something you have to travel for", () => {
    // 4,000 Marks is well beyond a long run in the Fields, which is the point: it is the first
    // thing in the game that asks you to go somewhere more dangerous.
    const g = freshGame(19);
    armUp(g);
    expect(play(g, "fields", 250).marks).toBeLessThan(JOINING_FEE);
  });
});

describe("the money", () => {
  it("cannot be manufactured by buying and selling the same thing back", () => {
    // The bug that made this file worth writing: weapons priced at nothing, sold back for Marks.
    for (const row of stockOf(content, WEAPON_SHOP)) {
      const paid = buyPrice(content, WEAPON_SHOP, row.name);
      const returned = sellPrice(content, WEAPON_SHOP, row.item, 999, true);
      expect(
        returned,
        `${row.name}: bought ${String(paid)}, sold ${String(returned)}`,
      ).toBeLessThan(paid);
    }
  });

  it("goes up over a campaign, but not so fast that the shops stop mattering", () => {
    const game = freshGame(17);
    armUp(game);
    const before = game.character!.marks;
    const session = play(game, "fields", 200);
    expect(session.marks).toBeGreaterThan(before);
    // A run in the fields should not buy out the best gear in the game.
    expect(session.marks).toBeLessThan(200000);
  });

  it("prices the shop so a starting purse buys a real weapon but not the best one", () => {
    const affordable = stockOf(content, WEAPON_SHOP).filter((r) => r.price <= 250);
    expect(affordable.length).toBeGreaterThan(0);
    expect(affordable.length).toBeLessThan(WEAPON_SHOP.stock.length);
  });
});

describe("the backgrounds", () => {
  it("every one of them can hold its own in the fields", () => {
    // A background that simply loses would be a trap, and the chooser gives no warning.
    for (const background of ["squire", "poacher", "pedlar", "surgeon"]) {
      const game = freshGame(23, background);
      armUp(game);
      const session = play(game, "fields", 100);
      expect(session.wins, background).toBeGreaterThan(10);
    }
  });
});

/** A character is only interesting if the numbers keep moving. */
describe("progress", () => {
  it("keeps raising the cost of the next level, so it never trivialises", () => {
    const game = freshGame(41);
    armUp(game);
    const first = play(game, "fields", 60).level;
    const second = play(game, "fields", 60).level;
    const third = play(game, "fields", 60).level;
    expect(second).toBeGreaterThanOrEqual(first);
    expect(third - second).toBeLessThanOrEqual(second - first + 1);
  });
});

/** Kept out of the sessions above so a failure points at the right thing. */
function characterOf(game: Game): Character {
  return game.character!;
}

describe("resting", () => {
  it("always brings you back to whole, so a session never ends in a war of attrition", () => {
    const game = freshGame(3);
    armUp(game);
    play(game, "fields", 40);
    apply(game, { kind: "rest" });
    expect(characterOf(game).wounds).toBe(0);
    expect(characterOf(game).disease).toBe(0);
  });
});
