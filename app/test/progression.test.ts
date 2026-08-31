import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadContent, type Content } from "../src/game/content.js";
import { apply, characterFrom, recover, type Character, type Game } from "../src/game/state.js";
import { parseHero } from "../src/game/hero.js";
import { newHeroText, backgroundByKey } from "../src/game/creation.js";
import { ARMOUR_SHOP, SHOPS, TRADER_SHOP, WEAPON_SHOP, stockOf } from "../src/game/shop.js";
import { REGIONS, canEnter, pickEncounter } from "../src/game/world.js";
import { GameRandom } from "../src/rules/random.js";
import { Action } from "../src/rules/battle.js";
import { HARDEN_RATE, hardenCost } from "../src/game/training.js";

/**
 * Does the whole game join up?
 *
 * The other suites check pieces. This one plays a campaign from a fresh hero to the far end of the
 * ladder and asserts the loop the game is built around actually closes: hunt somewhere you can
 * survive, sell what you find, spend it on being harder, and thereby reach somewhere that would
 * have killed you.
 *
 * It exists because every piece passed its own tests while that loop did not close. Measured
 * before the trainer: a level-21 hero with the best weapon in the shops won 2% of fights in the
 * Ocean, and spending 370,000 Marks on reforging moved it not at all, because Attack is rounding
 * error against creatures with 500 Guts and 600 Skill.
 */
function json(path: string): never {
  return JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")) as never;
}
const content: Content = loadContent({
  arms: json("../../content/arms.json"),
  monsters: json("../../content/monsters.json"),
  gear: json("../../content/gear.json"),
});

const line = (round: number): string => (round % 2 === 0 ? Action.BERZERK : Action.ATTACK);

function sellEverything(game: Game): void {
  for (const shop of SHOPS) {
    apply(game, { kind: "sellAll", shop: shop.key, what: "valuables" });
    apply(game, { kind: "sellAll", shop: shop.key, what: "arms" });
  }
}

function buyBest(game: Game, shop: typeof WEAPON_SHOP): void {
  const character = game.character!;
  const best = stockOf(content, shop)
    .filter((r) => r.price <= character.marks && r.item.kind === "arms")
    .sort((a, b) => b.price - a.price)[0];
  if (best === undefined) {
    return;
  }
  apply(game, { kind: "buy", shop: shop.key, name: best.name });
  const index = character.pack.findIndex((c) => c.name === best.name);
  if (index >= 0) {
    apply(game, { kind: "equip", index });
  }
}

function hunt(game: Game, region: string, quests: number) {
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
      apply(game, { kind: "fight", action: line(round) });
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
    if (i % 25 === 24) {
      sellEverything(game);
    }
  }
  sellEverything(game);
  return { wins, deaths, fights, win: wins / fights, death: deaths / fights };
}

/** Spends up to `budget` on the two stats that gate depth, cheapest point first. */
function trainUpTo(game: Game, budget: number): number {
  const character = game.character!;
  const floor = character.marks - budget;
  let bought = 0;
  for (;;) {
    const stat = character.guts <= character.wits ? "guts" : "wits";
    if (character.marks - hardenCost(character[stat]) < floor) {
      return bought;
    }
    const before = character.marks;
    apply(game, { kind: "harden", stat });
    if (character.marks === before) {
      return bought;
    }
    bought++;
  }
}

function freshGame(seed: number): Game {
  return {
    content,
    rng: new GameRandom(seed),
    place: { kind: "town" },
    character: characterFrom(parseHero(newHeroText("Long", backgroundByKey("poacher")))),
    quest: null,
    notices: [],
  };
}

describe("the loop the whole game is built around", () => {
  it("costs more for each point, so no purse ever outruns it", () => {
    expect(hardenCost(10)).toBe(10 * HARDEN_RATE);
    expect(hardenCost(300)).toBe(300 * HARDEN_RATE);
    // Never free, however low the stat has been driven.
    expect(hardenCost(0)).toBe(HARDEN_RATE);
    // Quadratic in total: going from 60 to 300 in one stat is over four hundred thousand Marks.
    let total = 0;
    for (let v = 60; v < 300; v++) {
      total += hardenCost(v);
    }
    expect(total).toBeGreaterThan(400_000);
  });

  it("takes a hero from the Fields to a region that would have killed them", () => {
    const game = freshGame(4);
    const character = game.character as Character;
    buyBest(game, WEAPON_SHOP);

    hunt(game, "fields", 600);
    buyBest(game, WEAPON_SHOP);
    buyBest(game, ARMOUR_SHOP);
    hunt(game, "forest", 800);
    const mound = hunt(game, "mound", 600);
    // The mid-game region is where the money for the far end comes from.
    expect(mound.win).toBeGreaterThan(0.6);
    expect(character.marks).toBeGreaterThan(100_000);

    // Buy the way onward. Every locked region has its key on Sally's shelf.
    for (const row of stockOf(content, TRADER_SHOP)) {
      if (/Map|Permit|Rutter/.test(row.name) && row.price <= character.marks) {
        apply(game, { kind: "buy", shop: TRADER_SHOP.key, name: row.name });
      }
    }
    const carried = [...character.pack, ...character.gear];
    expect(REGIONS.filter((r) => !canEnter(r, carried))).toEqual([]);

    // Growth by use gets a long campaign a good way on its own -- measured, about 190 Guts after
    // two thousand fights -- but not to where the far regions are pitched.
    const before = { guts: character.guts, wits: character.wits };
    expect(before.guts).toBeGreaterThan(100);
    expect(before.guts).toBeLessThan(260);

    // Spend the winnings on being harder, which is the only sink that reaches out there.
    const points = trainUpTo(game, character.marks - 20_000);
    expect(points).toBeGreaterThan(100);
    expect(character.guts).toBeGreaterThan(before.guts + 40);
    expect(character.wits).toBeGreaterThan(before.wits + 40);

    const ocean = hunt(game, "ocean", 250);
    expect(ocean.win).toBeGreaterThan(0.55);
    expect(ocean.death).toBeLessThan(0.25);
  });
});
