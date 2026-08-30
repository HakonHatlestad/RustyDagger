import { describe, expect, it } from "vitest";
import {
  Action,
  BattleTrait,
  State,
  battleRound,
  effectiveSkill,
  endingOf,
  noPending,
  type Fighter,
} from "../src/rules/battle.js";
import { Severity } from "../src/rules/combat.js";
import { GameRandom } from "../src/rules/random.js";

function fighter(name: string, over: Partial<Fighter> = {}): Fighter {
  return {
    name,
    guts: 60,
    wits: 30,
    charm: 30,
    attack: 20,
    defend: 10,
    skill: 40,
    wounds: 0,
    state: State.ALIVE,
    action: Action.ATTACK,
    traits: new Set<string>(),
    blastCharges: 0,
    disease: 0,
    blinded: false,
    panicked: false,
    bonusSwings: 0,
    strikeTraits: new Set<string>(),
    pending: noPending(),
    ...over,
  };
}

describe("the special actions", () => {
  it("Backstab doubles your Guts and cuts the enemy to one swing", () => {
    // Compared over many rounds: a Backstab hits harder and takes less back.
    const damage = (action: string): { dealt: number; taken: number } => {
      let dealt = 0;
      let taken = 0;
      const rng = new GameRandom(11);
      for (let i = 0; i < 400; i++) {
        const hero = fighter("H", { action });
        const mob = fighter("M", { guts: 4000 });
        battleRound(hero, mob, rng);
        dealt += mob.wounds;
        taken += hero.wounds;
      }
      return { dealt, taken };
    };
    const plain = damage(Action.ATTACK);
    const back = damage(Action.BACKSTAB);
    expect(back.dealt).toBeGreaterThan(plain.dealt);
    expect(back.taken).toBeLessThan(plain.taken);
  });

  it("Berzerk and Ieatsu lock you at the maximum four swings", () => {
    const dealt = (action: string): number => {
      let total = 0;
      const rng = new GameRandom(23);
      for (let i = 0; i < 400; i++) {
        const hero = fighter("H", { action });
        const mob = fighter("M", { guts: 4000 });
        battleRound(hero, mob, rng);
        total += mob.wounds;
      }
      return total;
    };
    // Four swings beats an average of two, so both out-damage a plain attack.
    expect(dealt(Action.BERZERK)).toBeGreaterThan(dealt(Action.ATTACK));
    expect(dealt(Action.IEATSU)).toBeGreaterThan(dealt(Action.ATTACK));
  });

  it("Control ends the fight without a scratch when it works", () => {
    const rng = new GameRandom(5);
    let controlled = 0;
    for (let i = 0; i < 300; i++) {
      const hero = fighter("H", { action: Action.CONTROL, wits: 200 });
      const mob = fighter("M", { wits: 5 });
      battleRound(hero, mob, rng);
      if (hero.state === State.CONTROL) {
        controlled++;
        expect(mob.wounds).toBe(0);
        // The hero holds the Control flag because the hero *won* -- see the note on Ending.
        expect(endingOf(hero, mob)).toBe("wonByHypnosis");
      }
    }
    // Overwhelming Wits should win nearly every time.
    expect(controlled).toBeGreaterThan(280);
  });

  it("Swindle is the same check on Charm", () => {
    const rng = new GameRandom(6);
    const hero = fighter("H", { action: Action.SWINDLE, charm: 500 });
    const mob = fighter("M", { charm: 1 });
    battleRound(hero, mob, rng);
    expect(hero.state).toBe(State.SWINDLE);
  });

  it("Stubborn makes a defender much harder to hypnotise", () => {
    const rate = (traits: Set<string>): number => {
      const rng = new GameRandom(9);
      let won = 0;
      for (let i = 0; i < 600; i++) {
        const hero = fighter("H", { action: Action.CONTROL, wits: 20 });
        const mob = fighter("M", { wits: 20, traits });
        battleRound(hero, mob, rng);
        if (hero.state === State.CONTROL) won++;
      }
      return won;
    };
    expect(rate(new Set([BattleTrait.STUBBORN]))).toBeLessThan(rate(new Set()));
  });
});

describe("traits that change a round", () => {
  it("Alert blunts a Backstab but not an ordinary attack", () => {
    const hits = (action: string, traits: Set<string>): number => {
      const rng = new GameRandom(3);
      let landed = 0;
      for (let i = 0; i < 600; i++) {
        const hero = fighter("H", { action, skill: 20 });
        const mob = fighter("M", { skill: 40, guts: 9000, traits });
        const r = battleRound(hero, mob, rng);
        const mine = r.outcomes.find((o) => o.attacker === "H");
        if (mine && mine.severity !== Severity.Dodged) landed++;
      }
      return landed;
    };
    expect(hits(Action.BACKSTAB, new Set([BattleTrait.ALERT]))).toBeLessThan(
      hits(Action.BACKSTAB, new Set()),
    );
    expect(hits(Action.ATTACK, new Set([BattleTrait.ALERT]))).toBe(hits(Action.ATTACK, new Set()));
  });

  it("Fencer blunts Berzerk and Ieatsu", () => {
    const hits = (traits: Set<string>): number => {
      const rng = new GameRandom(4);
      let landed = 0;
      for (let i = 0; i < 600; i++) {
        const hero = fighter("H", { action: Action.BERZERK, skill: 20 });
        const mob = fighter("M", { skill: 60, guts: 9000, traits });
        const r = battleRound(hero, mob, rng);
        const mine = r.outcomes.find((o) => o.attacker === "H");
        if (mine && mine.severity !== Severity.Dodged) landed++;
      }
      return landed;
    };
    expect(hits(new Set([BattleTrait.FENCER]))).toBeLessThan(hits(new Set()));
  });

  it("Reflex wins initiative far more often", () => {
    const first = (traits: Set<string>): number => {
      const rng = new GameRandom(8);
      let n = 0;
      for (let i = 0; i < 2000; i++) {
        const hero = fighter("H", { skill: 20, traits });
        const mob = fighter("M", { skill: 20 });
        if (battleRound(hero, mob, rng).heroFirst) n++;
      }
      return n / 2000;
    };
    // Evenly matched is a coin flip; +30 flat on a Skill of 20 makes it 50 against 20.
    expect(first(new Set())).toBeCloseTo(0.5, 1);
    expect(first(new Set([BattleTrait.REFLEX]))).toBeCloseTo(50 / 70, 1);
  });

  it("Blind halves both Speed and swings", () => {
    const dealt = (traits: Set<string>): number => {
      const rng = new GameRandom(12);
      let total = 0;
      for (let i = 0; i < 400; i++) {
        const hero = fighter("H", { traits });
        const mob = fighter("M", { guts: 9000 });
        battleRound(hero, mob, rng);
        total += mob.wounds;
      }
      return total;
    };
    expect(dealt(new Set([BattleTrait.BLIND]))).toBeLessThan(dealt(new Set()));
  });

  it("disease drags Skill down but never below one", () => {
    expect(effectiveSkill(fighter("H", { skill: 40, disease: 10 }))).toBe(30);
    expect(effectiveSkill(fighter("H", { skill: 5, disease: 99 }))).toBe(1);
  });
});

describe("initiative and fleeing", () => {
  it("a fleeing monster always acts last, however fast it is", () => {
    const rng = new GameRandom(2);
    for (let i = 0; i < 200; i++) {
      const hero = fighter("H", { skill: 1 });
      const mob = fighter("M", { skill: 9999, action: Action.RUNAWAY });
      expect(battleRound(hero, mob, rng).heroFirst).toBe(true);
    }
  });

  it("a fleeing hero always acts last, however fast they are", () => {
    const rng = new GameRandom(2);
    for (let i = 0; i < 200; i++) {
      const hero = fighter("H", { skill: 9999, action: Action.RUNAWAY });
      const mob = fighter("M", { skill: 1 });
      expect(battleRound(hero, mob, rng).heroFirst).toBe(false);
    }
  });

  it("but when both are fleeing it is an ordinary Speed check again", () => {
    // Easy to get backwards: two runaways do not both forfeit initiative, they race.
    const rng = new GameRandom(2);
    let heroFirst = 0;
    for (let i = 0; i < 400; i++) {
      const hero = fighter("H", { skill: 9999, action: Action.RUNAWAY });
      const mob = fighter("M", { skill: 1, action: Action.RUNAWAY });
      if (battleRound(hero, mob, rng).heroFirst) heroFirst++;
    }
    expect(heroFirst).toBeGreaterThan(390);
  });

  it("is otherwise an opposed Speed check", () => {
    const rng = new GameRandom(15);
    let heroFirst = 0;
    for (let i = 0; i < 2000; i++) {
      const hero = fighter("H", { skill: 30 });
      const mob = fighter("M", { skill: 10 });
      if (battleRound(hero, mob, rng).heroFirst) heroFirst++;
    }
    expect(heroFirst / 2000).toBeCloseTo(0.75, 1);
  });
});

describe("the round as a whole", () => {
  it("stops after the first blow when it kills", () => {
    const rng = new GameRandom(1);
    const hero = fighter("H", { skill: 9999, attack: 9999 });
    const mob = fighter("M", { guts: 1, skill: 1 });
    const r = battleRound(hero, mob, rng);
    expect(r.outcomes).toHaveLength(1);
    expect(mob.state).toBe(State.DEAD);
    expect(endingOf(hero, mob)).toBe("heroWon");
  });

  it("lets both sides act when the first blow does not end it", () => {
    const rng = new GameRandom(1);
    const hero = fighter("H", { guts: 9000 });
    const mob = fighter("M", { guts: 9000 });
    expect(battleRound(hero, mob, rng).outcomes).toHaveLength(2);
  });

  it("accumulates wounds across rounds until someone dies", () => {
    const rng = new GameRandom(77);
    const hero = fighter("H", { guts: 400, attack: 40, skill: 80 });
    const mob = fighter("M", { guts: 200, attack: 10, skill: 20 });
    let rounds = 0;
    while (endingOf(hero, mob) === null && rounds < 100) {
      battleRound(hero, mob, rng);
      rounds++;
    }
    expect(rounds).toBeGreaterThan(0);
    expect(endingOf(hero, mob)).not.toBeNull();
  });

  it("reports no ending while both are still standing", () => {
    expect(endingOf(fighter("H"), fighter("M"))).toBeNull();
  });
});

describe("blast weapons", () => {
  it("replace a weak blow and are spent afterwards", () => {
    const rng = new GameRandom(21);
    const hero = fighter("H", { attack: 0, guts: 1, skill: 9999, blastCharges: 2 });
    const mob = fighter("M", { guts: 9000, defend: 0, skill: 1 });
    battleRound(hero, mob, rng);
    // Two charges are worth 50, far more than this hero's ordinary blow.
    expect(mob.wounds).toBe(50);
    expect(hero.blastCharges).toBe(0);
  });

  it("do not replace a blow that was already bigger", () => {
    const rng = new GameRandom(21);
    const hero = fighter("H", { attack: 500, skill: 9999, blastCharges: 1 });
    const mob = fighter("M", { guts: 9000, defend: 0, skill: 1 });
    battleRound(hero, mob, rng);
    expect(mob.wounds).toBeGreaterThan(50);
  });
});
