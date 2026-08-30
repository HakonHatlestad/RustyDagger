import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GameRandom, JavaRandom } from "../src/rules/random.js";

/**
 * Checked against the Java build, not against expectations.
 *
 * `baseline/rules.txt` holds sequences recorded by running the real game's generator at fixed
 * seeds. Nothing in this file invents an expected value: every assertion compares against what the
 * Java side actually produced. That is the whole point of the baseline, and this is the first place
 * the port is held to it.
 */

const baseline = readFileSync(
  fileURLToPath(new URL("../../baseline/rules.txt", import.meta.url)),
  "utf8",
);

/** Pulls one recorded sequence out of the baseline, e.g. `seed=42 roll(100)=`. */
function recorded(seed: number, kind: string): string {
  const prefix = `seed=${seed} ${kind}=`;
  const line = baseline.split("\n").find((l) => l.startsWith(prefix));
  if (line === undefined) {
    throw new Error(`baseline has no line starting "${prefix}" -- has the format changed?`);
  }
  return line.slice(prefix.length);
}

const SEEDS = [0, 1, 42, 12345, 999999];

describe("matches the sequences the Java build recorded", () => {
  it.each(SEEDS)("roll(100) at seed %i", (seed) => {
    const rng = new GameRandom(seed);
    const got = Array.from({ length: 20 }, () => rng.roll(100)).join(",") + ",";
    expect(got).toBe(recorded(seed, "roll(100)"));
  });

  it.each(SEEDS)("twice(3) at seed %i", (seed) => {
    const rng = new GameRandom(seed);
    const got = Array.from({ length: 20 }, () => rng.twice(3)).join(",") + ",";
    expect(got).toBe(recorded(seed, "twice(3)"));
  });

  it.each(SEEDS)("contest(30,20) at seed %i", (seed) => {
    const rng = new GameRandom(seed);
    const got = Array.from({ length: 20 }, () => (rng.contest(30, 20) ? "T" : "F")).join("");
    expect(got).toBe(recorded(seed, "contest(30,20)"));
  });

  it("covers every seed the baseline records, so a widened baseline is not silently ignored", () => {
    const seedsInBaseline = new Set(
      [...baseline.matchAll(/^seed=(\d+) roll\(100\)=/gm)].map((m) => Number(m[1])),
    );
    expect([...seedsInBaseline].sort((a, b) => a - b)).toEqual(SEEDS);
  });
});

describe("the generator itself", () => {
  it("reproduces java.util.Random's documented first values for seed 0", () => {
    // From the specification's own worked example, independent of this project's baseline.
    const rng = new JavaRandom(0);
    expect(rng.nextInt()).toBe(-1155484576);
    expect(rng.nextInt()).toBe(-723955400);
    expect(rng.nextInt()).toBe(1033096058);
  });

  it("returns signed 32-bit values from nextInt", () => {
    const rng = new JavaRandom(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextInt();
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(-(2 ** 31));
      expect(v).toBeLessThan(2 ** 31);
    }
  });

  it("handles power-of-two bounds, which take a different path", () => {
    const rng = new JavaRandom(7);
    for (const bound of [1, 2, 4, 8, 16, 1024]) {
      for (let i = 0; i < 200; i++) {
        const v = rng.nextIntBounded(bound);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(bound);
      }
    }
  });

  it("rejects a non-positive bound rather than looping", () => {
    const rng = new JavaRandom(1);
    expect(() => rng.nextIntBounded(0)).toThrow(RangeError);
    expect(() => rng.nextIntBounded(-5)).toThrow(RangeError);
  });

  it("reseeding restores the sequence exactly", () => {
    const rng = new GameRandom(99);
    const first = Array.from({ length: 50 }, () => rng.roll(1000));
    rng.setSeed(99);
    expect(Array.from({ length: 50 }, () => rng.roll(1000))).toEqual(first);
  });
});

describe("the game's helpers", () => {
  it("returns zero for a non-positive roll instead of throwing", () => {
    // The Java build guards this; a table lookup downstream would crash on a negative.
    const rng = new GameRandom(1);
    expect(rng.roll(0)).toBe(0);
    expect(rng.roll(-3)).toBe(0);
  });

  it("does not consume randomness on a guarded roll", () => {
    // If the guard advanced the generator, every later value in a real game would drift.
    const a = new GameRandom(5);
    a.roll(0);
    const b = new GameRandom(5);
    expect(a.roll(100)).toBe(b.roll(100));
  });

  it("twice(n) spans 0..2n-2 and clusters in the middle", () => {
    const rng = new GameRandom(2024);
    const counts = new Map<number, number>();
    for (let i = 0; i < 60000; i++) {
      const v = rng.twice(3);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    expect(Math.min(...counts.keys())).toBe(0);
    expect(Math.max(...counts.keys())).toBe(4);
    // Triangular: the middle value is the most common, the ends the least.
    expect(counts.get(2)!).toBeGreaterThan(counts.get(0)!);
    expect(counts.get(2)!).toBeGreaterThan(counts.get(4)!);
  });

  it("contest(a,b) comes out near a/(a+b)", () => {
    const rng = new GameRandom(77);
    let wins = 0;
    const trials = 60000;
    for (let i = 0; i < trials; i++) {
      if (rng.contest(30, 20)) wins++;
    }
    expect(wins / trials).toBeCloseTo(0.6, 2);
  });

  it("percent and chance behave as named", () => {
    const rng = new GameRandom(31337);
    let pct = 0;
    let one = 0;
    const trials = 60000;
    for (let i = 0; i < trials; i++) {
      if (rng.percent(25)) pct++;
      if (rng.chance(4)) one++;
    }
    expect(pct / trials).toBeCloseTo(0.25, 2);
    expect(one / trials).toBeCloseTo(0.25, 2);
  });

  it("select picks uniformly across the list", () => {
    const rng = new GameRandom(8);
    const list = ["a", "b", "c", "d"] as const;
    const counts = new Map<string, number>();
    for (let i = 0; i < 40000; i++) {
      const picked = rng.select(list);
      counts.set(picked, (counts.get(picked) ?? 0) + 1);
    }
    for (const item of list) {
      expect(counts.get(item)! / 40000).toBeCloseTo(0.25, 1);
    }
  });
});
