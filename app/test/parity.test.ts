import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadContent, type Content } from "../src/game/content.js";
import { advanceStance, balance, chooseMonsterAction, powerOf } from "../src/game/monster.js";
import {
  Action,
  State,
  battleRound,
  endingOf,
  fleesBeforeFighting,
  noPending,
  type Ending,
  type Fighter,
} from "../src/rules/battle.js";
import { GameRandom } from "../src/rules/random.js";

/**
 * The capstone check: does a whole fight in the port come out like a whole fight in the Java build?
 *
 * Everything below this has been checked piece by piece — the generator, the damage formula, gear
 * into stats, decay. This checks the assembly. `baseline/distributions.txt` records, for every
 * monster against four hero builds, how 200 complete fights ended. If the port assembles the same
 * pieces in a different order, or drops one, the pieces all still pass and this does not.
 *
 * Compared by shape, not seed for seed. The port cannot consume randomness in the same order as the
 * Java — every stat write there advances the generator, because counts are stored obfuscated
 * (`docs/gameplay.md`) — so identical transcripts were never the goal.
 */

function json(path: string): never {
  return JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")) as never;
}

const content: Content = loadContent({
  arms: json("../../content/arms.json"),
  monsters: json("../../content/monsters.json"),
  gear: json("../../content/gear.json"),
});

const distributions = readFileSync(
  fileURLToPath(new URL("../../baseline/distributions.txt", import.meta.url)),
  "utf8",
);

/** The hero builds the harness uses, as raw stat blocks: guts, wits, charm, attack, defend, skill. */
const BUILDS: readonly (readonly number[])[] = [
  [10, 10, 10, 5, 5, 5],
  [30, 20, 20, 20, 15, 25],
  [80, 40, 40, 60, 50, 70],
  [200, 90, 90, 150, 120, 180],
];

/** The harness's own settings, so the comparison is like for like. */
const WEIGHT = 3;
const RUNS = 200;
const MAX_ROUNDS = 60;

interface Recorded {
  monster: string;
  build: number;
  endings: Map<string, number>;
}

const recorded: Recorded[] = [
  ...distributions.matchAll(/^monster=(\S+) build=(\d+)((?: \w+=\d+%)+)/gm),
].map((m) => ({
  monster: m[1]!,
  build: Number(m[2]),
  endings: new Map([...m[3]!.matchAll(/(\w+)=(\d+)%/g)].map((e) => [e[1]!, Number(e[2])] as const)),
}));

function heroOf(build: readonly number[]): Fighter {
  return {
    name: "H",
    guts: build[0]!,
    wits: build[1]!,
    charm: build[2]!,
    attack: build[3]!,
    defend: build[4]!,
    skill: build[5]!,
    wounds: 0,
    state: State.ALIVE,
    action: Action.ATTACK,
    traits: new Set<string>(),
    blastCharges: 0,
    disease: 0,
    blinded: false,
    panicked: false,
    bonusSwings: 0,
    roundsFought: 0,
    wise: false,
    winded: false,
    strikeTraits: new Set<string>(),
    pending: noPending(),
  };
}

/** One complete fight, driven the way the game drives it. */
function fight(monsterKey: string, build: readonly number[], rng: GameRandom): Ending {
  const def = content.monsters.get(monsterKey);
  if (def === undefined) {
    throw new Error(`no monster ${monsterKey}`);
  }
  const hero = heroOf(build);
  // Level 1, matching the harness, which never levels its probe heroes.
  const monster = balance(def, 1, WEIGHT, rng);
  const heroPower = powerOf(hero);
  monster.action = chooseMonsterAction(monster, rng, true, heroPower);
  if (fleesBeforeFighting(monster)) {
    return "mobFled";
  }
  for (let round = 0; round < MAX_ROUNDS; round++) {
    battleRound(hero, monster, rng);
    const ending = endingOf(hero, monster);
    if (ending !== null) {
      return ending;
    }
    // The monster picks again and gets angrier, exactly as arQuest.battleActionResult does.
    advanceStance(monster);
    monster.action = chooseMonsterAction(monster, rng, false, heroPower);
    if (fleesBeforeFighting(monster)) {
      return "mobFled";
    }
  }
  return "roundCap";
}

function measure(monsterKey: string, build: readonly number[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < RUNS; i++) {
    const rng = new GameRandom(1000 + i);
    const ending = fight(monsterKey, build, rng);
    counts.set(ending, (counts.get(ending) ?? 0) + 1);
  }
  return new Map([...counts].map(([k, v]) => [k, Math.round((v * 100) / RUNS)]));
}

describe("a whole fight, against the Java build's recorded outcomes", () => {
  it("has a table to compare against", () => {
    expect(recorded.length).toBeGreaterThan(100);
  });

  /**
   * How far apart two distributions may be.
   *
   * Generous on purpose. The port and the Java draw from the generator in a different order, so at
   * 200 samples per cell the sampling noise alone is several points; what this catches is a rule
   * being wrong, which moves a cell by tens.
   */
  const TOLERANCE = 25;

  /**
   * Monsters whose behaviour is knowingly not ported yet, and why.
   *
   * Listed one by one rather than by loosening the tolerance, so that a *new* divergence anywhere
   * else still fails. Every entry here is traceable to the consumable handling in
   * `itMonster.chooseActions` that `chooseMonsterAction` does not implement: a wounded monster
   * drinking Troll Blood, a Golden Apple or Ginseng to heal itself and buy back actions. That makes
   * these creatures last longer in the Java build than here.
   */
  const KNOWN_GAPS = new Set([
    "Faery",
    "Fields:Wizard",
    "Forest:Gryphon",
    "Hills:Goat",
    "Mound:Queen",
  ]);

  it("ends fights the same way, within sampling noise", () => {
    const problems: string[] = [];
    const unexpectedlyFine: string[] = [];
    for (const row of recorded) {
      const got = measure(row.monster, BUILDS[row.build]!);
      const keys = new Set([...row.endings.keys(), ...got.keys()]);
      let diverged = false;
      for (const key of keys) {
        const want = row.endings.get(key) ?? 0;
        const have = got.get(key) ?? 0;
        if (Math.abs(want - have) > TOLERANCE) {
          diverged = true;
          if (!KNOWN_GAPS.has(row.monster)) {
            problems.push(
              `${row.monster} build=${String(row.build)} ${key}: Java ${String(want)}%, port ${String(have)}%`,
            );
          }
        }
      }
      void diverged;
      void unexpectedlyFine;
    }
    expect(problems.slice(0, 20).join("\n")).toBe("");
  });

  it("still needs every monster on the known-gaps list", () => {
    // If one starts agreeing, the gap has been closed and the entry should go -- otherwise the
    // list quietly becomes a place where real regressions can hide.
    const stillDiverging = new Set<string>();
    for (const row of recorded.filter((r) => KNOWN_GAPS.has(r.monster))) {
      const got = measure(row.monster, BUILDS[row.build]!);
      for (const key of new Set([...row.endings.keys(), ...got.keys()])) {
        if (Math.abs((row.endings.get(key) ?? 0) - (got.get(key) ?? 0)) > TOLERANCE) {
          stillDiverging.add(row.monster);
        }
      }
    }
    const stale = [...KNOWN_GAPS].filter((m) => !stillDiverging.has(m));
    expect(stale.join(", ")).toBe("");
  });

  it("agrees about which fights are clearly winnable and which are not", () => {
    // A coarser check that survives any argument about tolerance: where the Java build is decisive,
    // the port must lean the same way. Near-even matchups are excluded on purpose -- the Gypsy is
    // 45% against 54% in the Java, and asking two samples to agree on a coin flip tests nothing.
    const DECISIVE = 20;
    const disagreements: string[] = [];
    for (const row of recorded.filter(
      (r) => (r.build === 0 || r.build === 3) && !KNOWN_GAPS.has(r.monster),
    )) {
      const got = measure(row.monster, BUILDS[row.build]!);
      const javaWon = row.endings.get("heroWon") ?? 0;
      const javaDied = row.endings.get("heroDied") ?? 0;
      if (Math.abs(javaWon - javaDied) < DECISIVE) {
        continue;
      }
      const javaWins = javaWon > javaDied;
      const portWins = (got.get("heroWon") ?? 0) > (got.get("heroDied") ?? 0);
      if (javaWins !== portWins) {
        disagreements.push(
          `${row.monster} build=${String(row.build)}: Java ${javaWins ? "wins" : "loses"}, port ${portWins ? "wins" : "loses"}`,
        );
      }
    }
    expect(disagreements.slice(0, 12).join("\n")).toBe("");
  });
});
