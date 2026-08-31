import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadContent, type Content } from "../src/game/content.js";
import {
  apply,
  asFighter,
  characterFrom,
  recover,
  type Character,
  type Game,
} from "../src/game/state.js";
import { parseHero } from "../src/game/hero.js";
import { backgroundByKey, newHeroText } from "../src/game/creation.js";
import { SHOPS, TRADER_SHOP, shopByKey, stockOf, type ShopDefinition } from "../src/game/shop.js";
import { REGIONS, assess, canEnter, pickEncounter, type Region } from "../src/game/world.js";
import { GameRandom } from "../src/rules/random.js";
import { Action } from "../src/rules/battle.js";
import { powerOf, typicalPower } from "../src/game/monster.js";
import { JOINING_FEE, TRACKS, canJoin, canTrain } from "../src/game/guild.js";
import { atCeiling, hardenCost } from "../src/game/training.js";
import { raiseFor } from "../src/rules/levelling.js";

/**
 * A whole game, played by code, from a fresh hero to the far end of the ladder.
 *
 * ## Why this is not the same as the other suites
 *
 * Every other test here holds one thing still and pokes it. This one *plays*: it decides what to
 * buy, when to train, and when a region has stopped being worth the walk, using the same advice
 * the interface gives the player (`assess`). That matters because the failures it catches are the
 * ones no unit test can see — a loop that does not close, a rung of the ladder with nothing on it,
 * a region the game recommends that cannot be survived, progress that quietly stops.
 *
 * It has already earned its place twice. Before the trainer existed, a hero reached the Ocean and
 * won 2% of fights there with no way to improve; before the death cap, the rational play was to
 * farm the starting region forever. Both passed every other test in the suite.
 *
 * ## Seeing it
 *
 * `pnpm sim` runs this and prints the campaign — region by region, with levels, stats, purse and
 * win rates — so the numbers can be eyeballed rather than only asserted. The assertions below are
 * what CI checks; the print-out is for a human deciding whether the shape is reasonable.
 */

function json(path: string): never {
  return JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")) as never;
}
const content: Content = loadContent({
  arms: json("../../content/arms.json"),
  monsters: json("../../content/monsters.json"),
  gear: json("../../content/gear.json"),
});

const REPORT = process.env["SIM_REPORT"] === "1";
const say = (line: string): void => {
  if (REPORT) {
    console.log(line);
  }
};

/** One region's worth of play, as the report shows it. */
interface Leg {
  readonly region: string;
  readonly verdict: string;
  readonly fights: number;
  readonly win: number;
  readonly death: number;
  readonly level: number;
  readonly guts: number;
  readonly wits: number;
  readonly charm: number;
  readonly attack: number;
  readonly skill: number;
  readonly marks: number;
  readonly earned: number;
}

/** Charge, breathe, charge — the line a competent player settles into. */
const line = (round: number): string => (round % 2 === 0 ? Action.BERZERK : Action.ATTACK);

function sellEverything(game: Game): void {
  // Wear anything better than what you have on BEFORE the shop takes it. The first version of
  // this file sold first, so a Silver Masamune off a Samurai went straight over the counter and
  // the report showed a hero finishing on 23 Attack -- which said more about the simulated player
  // than about the game.
  wearTheBest(game);
  for (const shop of SHOPS) {
    apply(game, { kind: "sellAll", shop: shop.key, what: "valuables" });
    apply(game, { kind: "sellAll", shop: shop.key, what: "arms" });
  }
}

/** Buys and wears the best thing this shop has that the purse will stretch to. */
function upgrade(game: Game, shop: ShopDefinition): string | null {
  const character = game.character!;
  const worn = asFighter(character);
  const best = stockOf(content, shop)
    .filter((row) => row.price <= character.marks && row.item.kind === "arms")
    .sort((a, b) => b.price - a.price)[0];
  if (best === undefined) {
    return null;
  }
  apply(game, { kind: "buy", shop: shop.key, name: best.name });
  const index = character.pack.findIndex((c) => c.name === best.name);
  if (index >= 0) {
    apply(game, { kind: "equip", index });
  }
  // Only worth reporting if it actually made the hero better.
  return asFighter(character).attack + asFighter(character).defend > worn.attack + worn.defend
    ? best.name
    : null;
}

/**
 * Wears the best of whatever is in the pack, in one bounded pass.
 *
 * Not a detail: without it the player sells the Silver Masamune it just took off a Samurai and
 * walks back out holding the Pike it bought in the first hour. The first version of this file sold
 * before it dressed, and the campaign report showed a hero finishing on 23 Attack — which said
 * more about the simulated player than about the game.
 *
 * Deliberately one pass over the few best candidates rather than a settle-to-fixpoint loop: the
 * pack runs to hundreds of items by the deep regions and this is called every twenty-five quests,
 * so the obvious version took longer than the whole rest of the suite.
 */
function wearTheBest(game: Game): void {
  const character = game.character!;
  // Judged by `powerOf`, which is the game's own way of weighing a fighter and the same one
  // `assess` uses to warn the player about a region. Maximising a score invented here instead
  // produced a hero who dropped its weapon for a pair of boots, because the made-up weights
  // over-valued Skill; the game's own function does not have that problem.
  const score = (item: { attack: number; defend: number; skill: number }): number =>
    item.attack * 3 + item.defend * 2 + item.skill;
  const worth = (): number => powerOf(asFighter(character));
  const candidates = character.pack
    .filter((c): c is Extract<typeof c, { kind: "arms" }> => c.kind === "arms")
    .sort((a, b) => score(b) - score(a))
    .slice(0, 8);
  for (const candidate of candidates) {
    const before = worth();
    const index = character.pack.indexOf(candidate);
    if (index < 0) {
      continue;
    }
    apply(game, { kind: "equip", index });
    if (worth() <= before) {
      const wornIndex = character.gear.indexOf(candidate);
      if (wornIndex >= 0) {
        apply(game, { kind: "unequip", index: wornIndex });
      }
    }
  }
}

/** Everything a sensible player does on getting back to town. */
function inTown(game: Game, spendOn: "gear" | "self"): void {
  const character = game.character!;
  sellEverything(game);

  for (const key of ["weapons", "armour"]) {
    upgrade(game, shopByKey(key));
  }

  if (canJoin(character.traits.has("Guild"), character.marks)) {
    apply(game, { kind: "joinGuild" });
  }
  // Guild ranks are capped by level and cheap early, so take them whenever they are offered.
  while (
    canTrain(character.ranks, character.level, character.traits.has("Guild"), character.marks)
  ) {
    const track = TRACKS.reduce((low, t) =>
      character.ranks[t.key] < character.ranks[low.key] ? t : low,
    );
    const before = character.marks;
    apply(game, { kind: "train", track: track.key });
    if (character.marks === before) {
      break;
    }
  }

  if (spendOn === "self") {
    // Keep Guts and Wits level with each other -- measured, either alone barely moves the deep end
    // -- and skip whichever is at its level ceiling rather than stopping altogether. An earlier
    // version broke out of this loop on the first refusal, so the moment Guts capped the hero
    // stopped training at all and finished a campaign sitting on four million Marks.
    for (;;) {
      const open = (["guts", "wits", "charm"] as const).filter(
        (k) => !atCeiling(k, character[k], character.level),
      );
      if (open.length === 0) {
        break;
      }
      // Whichever of the two that keep you alive is behind; Charm only once they are both capped
      // or out of reach, because it buys prices and swindles rather than survival.
      const vital = open.filter((k) => k !== "charm");
      const stat =
        vital.length > 0
          ? vital.reduce((low, k) => (character[k] < character[low] ? k : low))
          : open[0]!;
      // Never spend the last of the purse; a key or a weapon may be worth more.
      if (character.marks - hardenCost(character[stat]) < 20_000) {
        break;
      }
      const before = character.marks;
      apply(game, { kind: "harden", stat });
      if (character.marks === before) {
        break;
      }
    }
  }
}

/** Buys any region key it can afford, so the ladder opens as the money arrives. */
function buyKeys(game: Game): string[] {
  const character = game.character!;
  const bought: string[] = [];
  for (const row of stockOf(content, TRADER_SHOP)) {
    if (!/Map|Permit|Rutter/.test(row.name)) {
      continue;
    }
    const held = [...character.pack, ...character.gear].some((c) => c.name === row.name);
    if (!held && row.price <= character.marks) {
      apply(game, { kind: "buy", shop: TRADER_SHOP.key, name: row.name });
      bought.push(row.name);
    }
  }
  return bought;
}

/** How the game itself would describe this region to this hero. */
function verdictFor(character: Character, region: Region): string {
  const mine = powerOf(asFighter(character));
  const theirs = typicalPower(region.table, region.prefix, content, character.level);
  return assess(mine, theirs).verdict;
}

function hunt(game: Game, region: Region, quests: number): Leg {
  const character = game.character!;
  const known = new Set(content.monsters.keys());
  const verdict = verdictFor(character, region);
  const opening = character.marks;
  let wins = 0;
  let deaths = 0;
  let fights = 0;
  for (let i = 0; i < quests; i++) {
    if (character.wounds > character.guts / 2) {
      apply(game, { kind: "rest" });
    }
    const quarry = pickEncounter(region, character.level, known, game.rng);
    if (quarry === null) {
      break;
    }
    apply(game, { kind: "startQuest", monsterKey: quarry, weight: region.weight });
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
  const fighter = asFighter(character);
  return {
    region: region.name,
    verdict,
    fights,
    win: wins / Math.max(1, fights),
    death: deaths / Math.max(1, fights),
    level: character.level,
    guts: character.guts,
    wits: character.wits,
    charm: character.charm,
    attack: fighter.attack,
    skill: fighter.skill,
    marks: character.marks,
    earned: character.marks - opening,
  };
}

/**
 * Plays the whole game: works each region until it is comfortable, then moves on.
 *
 * The rule for moving on is the game's own advice — once a region reads `safe`, there is nothing
 * left to learn there — which means this also checks that the advice is worth following.
 */
function playCampaign(seed: number, background = "poacher"): Leg[] {
  const game: Game = {
    content,
    rng: new GameRandom(seed),
    place: { kind: "town" },
    character: characterFrom(parseHero(newHeroText("Probe", backgroundByKey(background)))),
    quest: null,
    notices: [],
  };
  const character = game.character!;
  const legs: Leg[] = [];

  say(`\n=== a campaign, seed ${String(seed)}, ${background} ===`);
  say(
    `start: level ${String(character.level)} guts ${String(character.guts)} wits ${String(character.wits)} ` +
      `charm ${String(character.charm)} marks ${String(character.marks)}`,
  );
  inTown(game, "gear");

  for (const region of REGIONS) {
    const carried = [...character.pack, ...character.gear];
    if (!canEnter(region, carried)) {
      say(`${region.name}: locked, no key`);
      continue;
    }
    // Deliberately not skipping a region the game calls deadly: entering one and being told so is
    // part of what the advice is for, and a run that never tests it never checks the warning.
    const leg = hunt(game, region, 400);
    legs.push(leg);
    say(
      `${leg.region.padEnd(24)} ${leg.verdict.padEnd(6)} ` +
        `fights ${String(leg.fights).padStart(3)} win ${leg.win.toFixed(2)} death ${leg.death.toFixed(2)} ` +
        `| lvl ${String(leg.level).padStart(2)} G${String(leg.guts).padStart(3)} W${String(leg.wits).padStart(3)} ` +
        `C${String(leg.charm).padStart(3)} atk ${String(leg.attack).padStart(3)} skl ${String(leg.skill).padStart(4)} ` +
        `| earned ${String(leg.earned).padStart(8)} purse ${String(leg.marks).padStart(8)}`,
    );
    inTown(game, "self");
    const keys = buyKeys(game);
    if (keys.length > 0) {
      say(`  bought the way onward: ${keys.join(", ")}`);
    }
  }

  const fighter = asFighter(character);
  say(
    `end: level ${String(character.level)} (next at ${String(raiseFor(character.level))} exp) ` +
      `guts ${String(character.guts)} wits ${String(character.wits)} charm ${String(character.charm)} ` +
      `attack ${String(fighter.attack)} defence ${String(fighter.defend)} skill ${String(fighter.skill)} ` +
      `marks ${String(character.marks)}`,
  );
  say(`gear: ${character.gear.map((c) => c.name).join(", ")}`);
  return legs;
}

describe("a whole campaign, played by code", () => {
  const legs = playCampaign(4);
  const by = (name: string): Leg => legs.find((l) => l.region.includes(name))!;

  it("gets through every region in the game", () => {
    // A locked region is not skipped quietly: if the money never arrives to open one, this fails.
    expect(legs).toHaveLength(REGIONS.length);
  });

  it("never stalls — every region leaves the hero better off than it found them", () => {
    for (let i = 1; i < legs.length; i++) {
      expect(legs[i]!.level).toBeGreaterThanOrEqual(legs[i - 1]!.level);
      expect(legs[i]!.guts).toBeGreaterThanOrEqual(legs[i - 1]!.guts);
    }
  });

  it("starts gently and ends somewhere that would have killed the same hero", () => {
    expect(by("Fields").win).toBeGreaterThan(0.75);
    expect(by("Fields").death).toBeLessThan(0.1);
    // The far end is meant to be hard, not impossible, for a hero who did the work.
    expect(by("Shangala").win).toBeGreaterThan(0.35);
  });

  it("pays better the deeper it goes, in Marks actually banked", () => {
    expect(by("Forest").earned).toBeGreaterThan(by("Fields").earned * 2);
    expect(by("Hie Brasil").earned).toBeGreaterThan(by("Forest").earned);
  });

  it("tells the truth about danger: nothing it calls safe is a bloodbath", () => {
    // The region cards are advice the player acts on. A `safe` verdict on a region that kills a
    // third of the time would be the interface lying, which is the one thing it may not do.
    for (const leg of legs) {
      if (leg.verdict === "safe") {
        expect(leg.death).toBeLessThan(0.2);
      }
      if (leg.verdict === "deadly") {
        expect(leg.win).toBeLessThan(0.75);
      }
    }
  });

  it("keeps the money worth having: the purse never stops finding a use", () => {
    // Everything is bought and trained on the way through, so a campaign should not finish sitting
    // on a fortune with nothing left to spend it on.
    const last = legs[legs.length - 1]!;
    // Guts stops at the level ceiling; Wits is the one with no roof, so it is what a fortune goes
    // into and what keeps the purse worth having.
    expect(last.guts).toBeLessThan(450);
    expect(hardenCost(last.wits)).toBeGreaterThan(JOINING_FEE);
    expect(last.wits).toBeGreaterThan(250);
  });

  it("holds up for a different hero, so none of this is one lucky seed", () => {
    const other = playCampaign(17, "squire");
    expect(other).toHaveLength(REGIONS.length);
    expect(other[other.length - 1]!.guts).toBeGreaterThan(200);
  });
});
