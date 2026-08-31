import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadContent, type Content } from "../src/game/content.js";
import {
  LOSS_CAP,
  apply,
  asFighter,
  characterFrom,
  lossOnFalling,
  recover,
  type Character,
  type Game,
} from "../src/game/state.js";
import { parseHero } from "../src/game/hero.js";
import { newHeroText, backgroundByKey } from "../src/game/creation.js";
import { ARMOUR_SHOP, SHOPS, WEAPON_SHOP, buyPrice, sellPrice, stockOf } from "../src/game/shop.js";
import { REGIONS, pickEncounter } from "../src/game/world.js";
import { GameRandom } from "../src/rules/random.js";
import { Action, act, battleRound } from "../src/rules/battle.js";
import { balance as balanceMonster } from "../src/game/monster.js";
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
/** Buys and wears the best armour the purse will stretch to. The companion to {@link armUp}. */
function gearUp(game: Game): void {
  const character = game.character!;
  const affordable = stockOf(content, ARMOUR_SHOP)
    .filter((row) => row.price <= character.marks && row.item.kind === "arms")
    .sort((a, b) => b.price - a.price)[0];
  if (affordable === undefined) {
    return;
  }
  apply(game, { kind: "buy", shop: ARMOUR_SHOP.key, name: affordable.name });
  const index = character.pack.findIndex((c) => c.name === affordable.name);
  if (index >= 0) {
    apply(game, { kind: "equip", index });
  }
}

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

/**
 * Plays a session where the action is chosen per round, so a *line of play* can be measured
 * rather than a single button. {@link play} is the special case that always swings.
 */
function playPlan(game: Game, region: string, quests: number, plan: (round: number) => string) {
  const character = game.character!;
  const found = REGIONS.find((r) => r.key === region)!;
  const known = new Set(content.monsters.keys());
  let wins = 0;
  let deaths = 0;
  let fights = 0;
  for (let i = 0; i < quests; i++) {
    if (character.wounds > character.guts / 2) {
      apply(game, { kind: "rest" });
    }
    const quarry = pickEncounter(found, character.level, known, game.rng);
    if (quarry === null) {
      break;
    }
    apply(game, { kind: "startQuest", monsterKey: quarry, weight: found.weight });
    let round = 0;
    while (game.quest?.ending === null && round < 300) {
      apply(game, { kind: "fight", action: plan(round) });
      round++;
    }
    if (round > 0) {
      fights++;
    }
    const ending = game.quest?.ending;
    if (ending === "heroWon") {
      wins++;
    }
    if (ending === "heroDied") {
      deaths++;
      recover(game);
    } else {
      apply(game, { kind: "leaveQuest" });
    }
    // Home to sell every so often, which is how the game is actually played. Leaving this out is
    // not a simplification: most of what a deep region pays is goods rather than coin -- 4,189
    // Marks of goods per kill in Shangala against no coin at all -- so a session that never
    // visits a shop measures the Fields fairly and everywhere else at a fraction of its worth.
    if (i % 25 === 24) {
      sellEverything(game);
    }
  }
  sellEverything(game);
  return { wins, deaths, fights, marks: character.marks };
}

/** Sells everything loose at whichever town shop pays best for it. */
function sellEverything(game: Game): void {
  for (const shop of SHOPS) {
    apply(game, { kind: "sellAll", shop: shop.key, what: "valuables" });
    apply(game, { kind: "sellAll", shop: shop.key, what: "arms" });
  }
}

/** The line of play a competent player settles into: charge, breathe, charge. */
const alternating = (round: number): string => (round % 2 === 0 ? Action.BERZERK : Action.ATTACK);

/** Runs a line of play across several heroes and returns the pooled rates. */
function line(region: string, plan: (round: number) => string, seeds = 10, quests = 200) {
  let wins = 0;
  let deaths = 0;
  let fights = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const game = freshGame(seed);
    armUp(game);
    const s = playPlan(game, region, quests, plan);
    wins += s.wins;
    deaths += s.deaths;
    fights += s.fights;
  }
  return { win: wins / fights, death: deaths / fights };
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
  const known = new Set(content.monsters.keys());
  const session: Session = { level: 1, marks: 0, deaths: 0, wins: 0, fights: 0 };

  for (let i = 0; i < quests; i++) {
    // Rest before going out if badly hurt, exactly as a player would.
    if (character.wounds > character.guts / 2) {
      apply(game, { kind: "rest" });
    }
    const quarry = pickEncounter(found, character.level, known, game.rng);
    if (quarry === null) {
      break;
    }
    apply(game, { kind: "startQuest", monsterKey: quarry, weight: found.weight });
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
    // Measured: 199 fights, 169 wins, 15 deaths, level 9, 414 Marks over 250 quests. Two earlier
    // readings, for the shape of what changed: 122 wins and 47 deaths before experience and
    // use-based growth were fixed, and still 45 deaths while encounters were picked uniformly over
    // everything sharing the area's prefix -- which put the Hills' dragon in front of newcomers.
    // The Fields are poorer than they were on purpose: `arQuest` weights them 1, and it is the
    // ladder out of them that money is for.
    expect(session.marks).toBeGreaterThan(300);
  });

  it("is a beginner's area again, which is what the early table is for", () => {
    // Below level 3 the Fields swap to a gentler table: no soldiers, barely a gypsy. Skipping that
    // and picking uniformly is what used to make a first afternoon so lethal.
    const game = freshGame(31);
    armUp(game);
    const session = play(game, "fields", 250);
    expect(session.wins / session.fights).toBeGreaterThan(0.6);
    expect(session.deaths).toBeLessThan(session.wins / 3);
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

  it("kills a new character in the Hills, which is what the card says", () => {
    // The verdict on a region card has to be true, because it is the only guidance the game gives.
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

describe("the ladder out of the Fields", () => {
  // The existing "pays far better the deeper you go" above compares `killExperience` at two
  // weights. That is the multiplier, not the payoff: it cannot see win rates or what dying costs,
  // and both of those are where the ladder actually lived or died. Measured before this check
  // existed, a veteran with a 7,770-Mark purse grossed 28.3 Marks a fight in the Goblin Mound and
  // paid 40.3 of them back out in death losses, because the penalty was a tenth of a purse with no
  // ceiling. The rational play was to farm the starting region forever.

  /**
   * Marks actually kept per fight, deaths and all, for a veteran who can survive the region.
   *
   * The long Fields run and the re-equip afterwards are not padding: measured, a hero who has only
   * done 1,200 fights still loses money in the Mound, and reading that as "the ladder is broken"
   * rather than "this character is not ready yet" is the mistake this helper exists to avoid.
   */
  function earnings(region: string, seeds = 6): number {
    let net = 0;
    let fights = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const game = freshGame(seed);
      armUp(game);
      playPlan(game, "fields", 2000, alternating);
      armUp(game);
      gearUp(game);
      const before = game.character!.marks;
      const s = playPlan(game, region, 250, alternating);
      net += game.character!.marks - before;
      fights += s.fights;
    }
    return net / fights;
  }

  it("pays better in play, and not merely in the experience formula", () => {
    const fields = earnings("fields");
    const forest = earnings("forest");
    expect(fields).toBeGreaterThan(0);
    expect(forest).toBeGreaterThan(fields * 2);
  });

  it("does not tax you for being rich, which used to make depth irrational", () => {
    // A tenth of a purse, uncapped, grew faster than any region's takings. The cap is what keeps
    // a deep region worth entering once you have something to lose.
    expect(lossOnFalling(200)).toBe(20);
    expect(lossOnFalling(50_000)).toBe(LOSS_CAP);
    expect(earnings("mound")).toBeGreaterThan(earnings("fields"));
  });
});

describe("the fight is a decision, not a button", () => {
  // Every one of these was false before the special actions were costed. Measured then: Berzerk
  // beat an ordinary swing on BOTH win rate and death rate in every region -- 0.954/0.000 against
  // 0.846/0.106 in the Fields -- so five of the six actions in the interface were decoration, and
  // the one the game marks as primary was the worst of them.

  it("has no action that is simply the best one", () => {
    // The charge wins more fights; the ambush loses fewer. Neither beats the other at both, which
    // is what stops one button being the whole game.
    const charge = line("fields", () => Action.BERZERK);
    const ambush = line("fields", () => Action.BACKSTAB);
    expect(charge.win).toBeGreaterThan(ambush.win - 0.05);
    expect(ambush.death).toBeLessThan(charge.death + 0.05);
    const dominates = charge.win > ambush.win + 0.02 && charge.death < ambush.death - 0.02;
    expect(dominates).toBe(false);
  });

  it("makes an ordinary swing part of the best line, because a charge leaves you winded", () => {
    // Alternating beats holding the charge button down. That is the whole reason `winded` exists:
    // without it there was no round in which an ordinary swing was the right move.
    const spam = line("forest", () => Action.BERZERK);
    const alternate = line("forest", (r) => (r % 2 === 0 ? Action.BERZERK : Action.ATTACK));
    expect(alternate.win).toBeGreaterThan(spam.win);
  });

  it("only lets you backstab something that is not yet fighting you", () => {
    // Surprise is the cost. Opening with it is strong; using it as a rotation is not.
    const opener = line("fields", (r) => (r === 0 ? Action.BACKSTAB : Action.ATTACK));
    const always = line("fields", () => Action.BACKSTAB);
    expect(opener.win).toBeGreaterThan(0.8);
    // Round after round it degrades to an ordinary swing, so it cannot beat opening with it
    // and then fighting properly by any real margin.
    expect(always.win).toBeLessThan(opener.win + 0.05);
  });

  it("does not let you talk your way past the same creature twice", () => {
    // Hypnotise and Swindle used to be free re-rolls: they ended the fight outright or cost a
    // round, and a round was cheap, so grinding them out-earned fighting in regions that would
    // otherwise kill you. One attempt each is what makes them a gamble.
    const rng = new GameRandom(5);
    const def = content.monsters.get("Fields:Goblin")!;
    const mob = balanceMonster(def, 1, 1, rng);
    expect(mob.wise).toBe(false);
    // A hero who cannot possibly win the contest still gets exactly one attempt.
    const hero = asFighter(characterFrom(parseHero(newHeroText("P", backgroundByKey("squire")))));
    hero.wits = 0;
    hero.action = Action.CONTROL;
    act(hero, mob, 10, 2, 10, 10, rng);
    expect(mob.wise).toBe(true);
  });

  it("costs a berserk charge its guard and its initiative", () => {
    // The interface promises "they swing first, your guard is halved". This is that promise.
    const rng = new GameRandom(3);
    const def = content.monsters.get("Fields:Goblin")!;
    const mob = balanceMonster(def, 1, 1, rng);
    const hero = asFighter(characterFrom(parseHero(newHeroText("P", backgroundByKey("squire")))));
    hero.skill = 9999; // would always win initiative on speed alone
    hero.action = Action.BERZERK;
    mob.action = Action.ATTACK;
    const result = battleRound(hero, mob, rng);
    expect(result.heroFirst).toBe(false);
  });
});
