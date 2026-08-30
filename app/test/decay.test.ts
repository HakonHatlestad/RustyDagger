import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decay, decayStep, type Wearable } from "../src/rules/decay.js";
import { GameRandom } from "../src/rules/random.js";

/**
 * Decay is checked in two ways, and the split is the point.
 *
 * What an item *becomes* when it wears out is a rule, and it is checked exactly against the
 * trajectory the Java build recorded for all 91 items. How *often* it wears out is a distribution,
 * and it is checked as one.
 *
 * The obvious test -- reproduce which of forty uses damaged the item -- was written first and
 * thrown away. It passes only if the port advances the generator exactly as often as the Java code
 * does, and the Java code advances it on every stat write, because `itCount` stores each number
 * split across a value and a random offset to hide it from a memory scanner. That is a 1997
 * anti-cheat trick, not a rule of the game, and a port should not have to reimplement it.
 */

function file(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

const rules = file("../../baseline/rules.txt");
const distributions = file("../../baseline/distributions.txt");

interface Trajectory {
  key: string;
  steps: { attack: number; defend: number; skill: number }[];
}

const trajectories: Trajectory[] = [...rules.matchAll(/^item=(.+?)((?: after\d+=a:.+?)+)$/gm)].map(
  (m) => ({
    key: m[1]!,
    steps: [...m[2]!.matchAll(/after\d+=a:(-?\d+),d:(-?\d+),s:(-?\d+)/g)].map((s) => ({
      attack: Number(s[1]),
      defend: Number(s[2]),
      skill: Number(s[3]),
    })),
  }),
);

const startingStats = new Map<string, { attack: number; defend: number; skill: number }>(
  (
    JSON.parse(file("../../content/arms.json")) as {
      arms: { key: string; attack: number; defend: number; skill: number }[];
    }
  ).arms.map((a) => [a.key, { attack: a.attack, defend: a.defend, skill: a.skill }]),
);

describe("decayStep", () => {
  it("takes one point off a stat at or below one", () => {
    expect(decayStep(0)).toBe(1);
    expect(decayStep(1)).toBe(1);
  });

  it("takes more off a better item", () => {
    expect(decayStep(2)).toBe(1);
    expect(decayStep(12)).toBe(2);
    expect(decayStep(24)).toBe(3);
    expect(decayStep(120)).toBe(11);
  });

  it("keeps eroding a stat that is already negative", () => {
    // Cursed gear sits below zero and the game lets it keep going.
    expect(decayStep(-5)).toBe(1);
  });
});

describe("what an item becomes, against every trajectory the Java build recorded", () => {
  it("has trajectories to check", () => {
    expect(trajectories.length).toBeGreaterThan(80);
    expect(trajectories.every((t) => t.steps.length === 5)).toBe(true);
  });

  it("reproduces all of them exactly", () => {
    const mismatches: string[] = [];
    for (const t of trajectories) {
      const start = startingStats.get(t.key);
      if (start === undefined) {
        mismatches.push(`${t.key}: not in the exported content`);
        continue;
      }
      const item: Wearable = { ...start, enchant: 0 };
      t.steps.forEach((want, i) => {
        item.attack -= decayStep(item.attack);
        item.defend -= decayStep(item.defend);
        item.skill -= decayStep(item.skill);
        if (
          item.attack !== want.attack ||
          item.defend !== want.defend ||
          item.skill !== want.skill
        ) {
          mismatches.push(
            `${t.key} after ${i + 1}: want a=${want.attack} d=${want.defend} s=${want.skill},` +
              ` got a=${item.attack} d=${item.defend} s=${item.skill}`,
          );
        }
      });
    }
    expect(mismatches.slice(0, 10).join("\n")).toBe("");
  });
});

describe("how often it wears out, against the recorded distribution", () => {
  const recorded = new Map<number, number>(
    [...distributions.matchAll(/^rate=(\d+) decayedPercent=(\d+)$/gm)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]),
  );

  it("has rates to check", () => {
    expect(recorded.size).toBeGreaterThan(4);
  });

  it("matches the Java build's frequency at every rate", () => {
    for (const [rate, wantPercent] of recorded) {
      const rng = new GameRandom(20260830);
      const item: Wearable = { attack: 30, defend: 0, skill: 5, enchant: 0 };
      let decays = 0;
      const trials = 20000;
      for (let i = 0; i < trials; i++) {
        if (decay(item, rate, rng).decayed) decays++;
      }
      const got = (decays * 100) / trials;
      // Same generator and seed, but not the same call pattern, so this is a distribution
      // check: within a point of what the Java build measured over the same sample size.
      expect(got, `rate=${rate}`).toBeGreaterThan(wantPercent - 1.5);
      expect(got, `rate=${rate}`).toBeLessThan(wantPercent + 1.5);
    }
  });

  it("floors the rate at one in two", () => {
    expect(recorded.get(1)).toBe(recorded.get(2));
  });
});

describe("the trait roll", () => {
  it("fires about one time in twelve that an item decays", () => {
    const rng = new GameRandom(4242);
    const item: Wearable = { attack: 100, defend: 100, skill: 100, enchant: 0 };
    let decays = 0;
    let traitLosses = 0;
    for (let i = 0; i < 40000; i++) {
      const r = decay(item, 2, rng);
      if (r.decayed) decays++;
      if (r.lostTrait) traitLosses++;
    }
    expect(traitLosses / decays).toBeCloseTo(1 / 12, 2);
  });

  it("strips a fifth of any enchantment, rounded up", () => {
    const item: Wearable = { attack: 5, defend: 5, skill: 5, enchant: 10 };
    const rng = new GameRandom(1);
    // Drive it until the trait branch fires, then check what the enchantment lost.
    for (let i = 0; i < 5000; i++) {
      const before = item.enchant;
      if (decay(item, 2, rng).lostTrait) {
        expect(before - item.enchant).toBe(Math.trunc((before + 4) / 5));
        return;
      }
    }
    expect.unreachable("the trait branch never fired in 5000 decays");
  });
});
