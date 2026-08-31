import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  Severity,
  Trait,
  calcCombat,
  lands,
  resolveDamage,
  type Equipment,
} from "../src/rules/combat.js";
import { GameRandom } from "../src/rules/random.js";
import { parseEntity, type Entity } from "../src/format/parse.js";

function file(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

const rules = file("../../baseline/rules.txt");
const distributions = file("../../baseline/distributions.txt");

/** Builds an item from the exported content, so the tests use the game's real numbers. */
const armsByKey = new Map<string, Equipment>(
  (
    JSON.parse(file("../../content/arms.json")) as {
      arms: { key: string; source: string; attack: number; defend: number; skill: number }[];
    }
  ).arms.map((a) => {
    const entity: Entity = parseEntity(a.source);
    // Fields after the three stats are trait names, spelled lower case in the source.
    const traits = new Set(
      entity.fields
        .slice(3)
        .filter((f): f is string => typeof f === "string" && f.length > 0)
        .map((f) => f.charAt(0).toUpperCase() + f.slice(1)),
    );
    return [
      a.key,
      {
        attack: a.attack,
        defend: a.defend,
        skill: a.skill,
        enchant: 0,
        forged: 0,
        tempered: 0,
        traits,
      },
    ];
  }),
);

function equip(...keys: string[]): Equipment[] {
  return keys.map((k) => {
    const item = armsByKey.get(k);
    if (item === undefined) throw new Error(`no such item: ${k}`);
    return item;
  });
}

describe("gear and traits into combat stats, against the Java build", () => {
  const rows = [
    ...rules.matchAll(/^gear=(.+?) trait=(.+?) -> attack=(-?\d+) defend=(-?\d+) skill=(-?\d+)$/gm),
  ].map((m) => ({
    gear: m[1] === "(none)" ? [] : m[1]!.split("+"),
    trait: m[2] === "(none)" ? null : m[2]!,
    attack: Number(m[3]),
    defend: Number(m[4]),
    skill: Number(m[5]),
  }));

  it("has rows to check", () => {
    expect(rows.length).toBeGreaterThan(20);
  });

  it("reproduces every combination", () => {
    // The harness builds each hero with 60 guts, 30 wits, 30 charm and no guild ranks.
    for (const row of rows) {
      const stats = calcCombat({
        wits: 30,
        charm: 30,
        gear: equip(...row.gear),
        fightRank: 0,
        magicRank: 0,
        thiefRank: 0,
        traits: new Set(row.trait === null ? [] : [row.trait]),
      });
      const where = `gear=${row.gear.join("+") || "(none)"} trait=${row.trait ?? "(none)"}`;
      expect(stats.attack, `${where} attack`).toBe(row.attack);
      expect(stats.defend, `${where} defend`).toBe(row.defend);
      expect(stats.skill, `${where} skill`).toBe(row.skill);
    }
  });

  it("gives a hero Skill even with nothing equipped", () => {
    // Skill is mostly Wits and Charm; Attack and Defence come only from gear and ranks.
    const bare = calcCombat({
      wits: 30,
      charm: 30,
      gear: [],
      fightRank: 0,
      magicRank: 0,
      thiefRank: 0,
      traits: new Set(),
    });
    expect(bare.skill).toBeGreaterThan(0);
    expect(bare.attack).toBe(0);
    expect(bare.defend).toBe(0);
  });

  it("never lets Skill fall below one", () => {
    const stats = calcCombat({
      wits: 0,
      charm: 0,
      gear: [],
      fightRank: 0,
      magicRank: 0,
      thiefRank: 0,
      traits: new Set(),
    });
    expect(stats.skill).toBe(1);
  });

  it("applies Agile, Strong and Sturdy to one stat each", () => {
    const base = {
      wits: 30,
      charm: 30,
      gear: equip("Steel Sword", "Half Plate"),
      fightRank: 0,
      magicRank: 0,
      thiefRank: 0,
    };
    const plain = calcCombat({ ...base, traits: new Set() });
    const agile = calcCombat({ ...base, traits: new Set([Trait.AGILE]) });
    const strong = calcCombat({ ...base, traits: new Set([Trait.STRONG]) });
    const sturdy = calcCombat({ ...base, traits: new Set([Trait.STURDY]) });

    expect(agile.skill).toBeGreaterThan(plain.skill);
    expect(agile.attack).toBe(plain.attack);
    expect(strong.attack).toBeGreaterThan(plain.attack);
    expect(strong.skill).toBe(plain.skill);
    expect(sturdy.defend).toBeGreaterThan(plain.defend);
    expect(sturdy.attack).toBe(plain.attack);
  });
});

describe("the damage formula, against the Java build", () => {
  interface DamageRow {
    guts: number;
    swings: number;
    attack: number;
    defence: number;
    attackerSkill: number;
    defenderSkill: number;
    severity: Severity;
    damage: number;
  }

  const rows: DamageRow[] = [
    ...rules.matchAll(
      /^guts=(\d+) swings=(\d+) atk=(\d+) def=(\d+) as=(\d+) ds=(\d+) -> severity=(-?\d+),dmg=(-?\d+)/gm,
    ),
  ].map((m) => ({
    guts: Number(m[1]),
    swings: Number(m[2]),
    attack: Number(m[3]),
    defence: Number(m[4]),
    attackerSkill: Number(m[5]),
    defenderSkill: Number(m[6]),
    severity: Number(m[7]),
    damage: Number(m[8]),
  }));

  it("has a substantial grid to check", () => {
    expect(rows.length).toBeGreaterThan(1000);
  });

  it("matches damage and severity on every blow that landed", () => {
    // The harness defender has 200 Guts and starts unwounded.
    const mismatches: string[] = [];
    for (const row of rows) {
      if (row.severity === Severity.Dodged) continue;
      const got = resolveDamage({
        guts: row.guts,
        swings: row.swings,
        attack: row.attack,
        attackerSkill: row.attackerSkill,
        defence: row.defence,
        defenderSkill: row.defenderSkill,
        defenderGuts: 200,
        defenderWounds: 0,
      });
      const where = `guts=${row.guts} swings=${row.swings} atk=${row.attack} def=${row.defence}`;
      // The baseline records wounds actually taken, which is zero for a blow armour absorbed.
      if (got.woundsInflicted !== row.damage || got.severity !== row.severity) {
        mismatches.push(
          `${where}: want wounds=${row.damage} sev=${row.severity},` +
            ` got wounds=${got.woundsInflicted} sev=${got.severity}`,
        );
      }
    }
    expect(mismatches.slice(0, 8).join("\n")).toBe("");
  });

  it("scales severity against remaining health, not maximum", () => {
    const blow = {
      guts: 100,
      swings: 2,
      attack: 20,
      attackerSkill: 50,
      defence: 0,
      defenderSkill: 50,
      defenderGuts: 200,
    };
    const fresh = resolveDamage({ ...blow, defenderWounds: 0 });
    const hurt = resolveDamage({ ...blow, defenderWounds: 150 });
    expect(fresh.damage).toBe(hurt.damage);
    expect(hurt.severity).toBeGreaterThan(fresh.severity);
  });

  it("kills when damage reaches what is left", () => {
    const r = resolveDamage({
      guts: 100,
      swings: 4,
      attack: 100,
      attackerSkill: 50,
      defence: 0,
      defenderSkill: 50,
      defenderGuts: 60,
      defenderWounds: 0,
    });
    expect(r.killed).toBe(true);
    expect(r.severity).toBe(Severity.Killed);
  });

  it("reports a blow absorbed by armour as unharmed, not a miss", () => {
    const r = resolveDamage({
      guts: 10,
      swings: 0,
      attack: 5,
      attackerSkill: 50,
      defence: 200,
      defenderSkill: 50,
      defenderGuts: 100,
      defenderWounds: 0,
    });
    expect(r.hit).toBe(true);
    expect(r.severity).toBe(Severity.Unharmed);
    expect(r.damage).toBeLessThan(1);
    // Absorbed, not healed: a negative figure must not become negative wounds.
    expect(r.woundsInflicted).toBe(0);
  });
});

describe("the to-hit rule, against the recorded hit-rate table", () => {
  const table = [...distributions.matchAll(/^as=(\d+)\s+->(.+)$/gm)].map((m) => ({
    attackerSkill: Number(m[1]),
    percents: m[2]!.trim().split(/\s+/).map(Number),
  }));
  const skills = [1, 5, 10, 20, 40, 80, 160, 320];

  it("has the table", () => {
    expect(table).toHaveLength(skills.length);
  });

  it("matches the Java build's hit rate at every Skill matchup", () => {
    for (const row of table) {
      row.percents.forEach((wantPercent, i) => {
        const defenderSkill = skills[i]!;
        const rng = new GameRandom(20260830);
        let hits = 0;
        const trials = 20000;
        for (let t = 0; t < trials; t++) {
          if (lands(row.attackerSkill, defenderSkill, rng)) hits++;
        }
        const got = Math.trunc((hits * 100) / trials);
        expect(got, `as=${row.attackerSkill} ds=${defenderSkill}`).toBe(wantPercent);
      });
    }
  });

  it("saturates: once within one of their Skill you cannot miss", () => {
    const rng = new GameRandom(1);
    for (let i = 0; i < 5000; i++) {
      expect(lands(40, 40, rng)).toBe(true);
      expect(lands(40, 41, rng)).toBe(true);
    }
  });
});
