/**
 * A round of combat, start to finish.
 *
 * A round is: both sides roll how many swings they get, the special actions apply their
 * multipliers, initiative is decided, and then each side acts in turn unless the first blow ended
 * it. The whole fight is this repeated until someone dies, flees, or is talked out of it.
 *
 * The one structural thing to know is that **the action multipliers live here, not in the attack
 * itself**. Backstab doubles your Guts and Speed and cuts the enemy to a single swing *before*
 * either side acts, so a port that only reimplements the attack silently loses every special move.
 */

import { Severity, lands, resolveDamage } from "./combat.js";
import type { GameRandom } from "./random.js";

/** What a combatant can choose to do. Spellings match the game's, typos included. */
export const Action = {
  /** An ordinary swing. */
  ATTACK: "Attack",
  BACKSTAB: "Backstab",
  /** Spelled without the second "r" in the original, and the spelling is load-bearing. */
  BERZERK: "Berzek",
  IEATSU: "Ieatsu",
  CONTROL: "Control",
  SWINDLE: "Swindle",
  RUNAWAY: "Runaway",
} as const;

export type ActionName = (typeof Action)[keyof typeof Action];

/** Traits that change how a round plays, beyond the stat bonuses in `combat.ts`. */
export const BattleTrait = {
  /** Sees a Backstab coming: +30 to the defender's Skill for that roll. */
  ALERT: "Alert",
  /** Reads a Berzerk or Ieatsu: +30 likewise. */
  FENCER: "Fencer",
  /** +30 Speed, flat. Decisive at low levels. */
  REFLEX: "Reflex",
  /** Halves Speed and swings. */
  BLIND: "Blind",
  /** +30 Wits against being hypnotised. */
  STUBBORN: "Stubborn",
} as const;

/**
 * Whether a chosen action is the named one.
 *
 * Case-insensitive, because the game's own `isMatch` is. That is not a detail: monsters carry their
 * options in the content in lower case — `control`, `swindle`, `backstab` — while the constants are
 * capitalised. Comparing exactly means a monster never hypnotises anyone, which is a rule silently
 * missing rather than a rule slightly wrong.
 */
export function isAction(chosen: string, name: string): boolean {
  return chosen.toLowerCase() === name.toLowerCase();
}

export interface Fighter {
  readonly name: string;
  guts: number;
  wits: number;
  charm: number;
  attack: number;
  defend: number;
  skill: number;
  wounds: number;
  /** Alive, Dead, Control or Swindle. */
  state: string;
  /**
   * The chosen action. Deliberately a plain string rather than {@link ActionName}: monsters carry
   * their own option lists in the content -- bribe, riddle, seduce, trade -- so the set is open,
   * and anything not recognised here resolves as an ordinary attack, exactly as the game does.
   */
  action: string;
  readonly traits: ReadonlySet<string>;
  /** Blast charges from a weapon, which replace damage when they would beat it. */
  blastCharges: number;
  /** Points of Disease, which drag Skill down. */
  disease: number;
}

export const State = {
  ALIVE: "Alive",
  DEAD: "Dead",
  CONTROL: "Control",
  SWINDLE: "Swindle",
} as const;

/** Effective Skill: reduced by disease, never below one. */
export function effectiveSkill(f: Fighter): number {
  const value = f.skill - f.disease;
  return value < 1 ? 1 : value;
}

/** One side's numbers for the round, after actions and traits have had their say. */
interface Prepared {
  guts: number;
  speed: number;
  swings: number;
}

/**
 * Applies a fighter's chosen action and traits.
 *
 * Returns their own adjusted numbers; `opponentSwings` is returned separately because Backstab
 * reaches across and cuts the *other* side down to one swing.
 */
function prepare(f: Fighter, swings: number): { own: Prepared; opponentSwings: number | null } {
  const own: Prepared = { guts: f.guts, speed: effectiveSkill(f), swings };
  let opponentSwings: number | null = null;

  if (isAction(f.action, Action.BACKSTAB)) {
    own.guts *= 2;
    own.speed *= 2;
    opponentSwings = 1;
  } else if (isAction(f.action, Action.BERZERK) || isAction(f.action, Action.IEATSU)) {
    own.guts *= 2;
    own.speed *= 2;
    own.swings = 4;
  } else if (isAction(f.action, Action.CONTROL)) {
    own.speed = f.wits;
  } else if (isAction(f.action, Action.SWINDLE)) {
    own.speed = f.charm;
  }

  if (f.traits.has(BattleTrait.REFLEX)) {
    own.speed += 30;
  }
  if (f.traits.has(BattleTrait.BLIND)) {
    own.speed = Math.trunc(own.speed / 2);
    own.swings = Math.trunc(own.swings / 2);
  }
  return { own, opponentSwings };
}

export interface ActOutcome {
  readonly attacker: string;
  readonly action: string;
  readonly severity: Severity;
  readonly damage: number;
  readonly woundsInflicted: number;
  /** Set when the round ends here — a death, a hypnosis, a swindle. */
  readonly ended: boolean;
}

/**
 * One side's action against the other.
 *
 * Control and Swindle short-circuit: they are opposed Wits and Charm checks that end the fight
 * outright rather than dealing damage.
 */
export function act(
  attacker: Fighter,
  defender: Fighter,
  guts: number,
  swings: number,
  attackerSpeed: number,
  defenderSpeed: number,
  rng: GameRandom,
): ActOutcome {
  if (isAction(attacker.action, Action.CONTROL)) {
    return contestOfWills(attacker, defender, 2 * attacker.wits, defender.wits, State.CONTROL, rng);
  }
  if (isAction(attacker.action, Action.SWINDLE)) {
    return contestOfWills(
      attacker,
      defender,
      2 * attacker.charm,
      defender.charm,
      State.SWINDLE,
      rng,
    );
  }

  // A defender who saw it coming is harder to hit, but only against the move they read.
  let ds = defenderSpeed;
  if (isAction(attacker.action, Action.BACKSTAB) && defender.traits.has(BattleTrait.ALERT)) {
    ds += 30;
  }
  if (
    (isAction(attacker.action, Action.BERZERK) || isAction(attacker.action, Action.IEATSU)) &&
    defender.traits.has(BattleTrait.FENCER)
  ) {
    ds += 30;
  }

  if (!lands(attackerSpeed, ds, rng)) {
    return {
      attacker: attacker.name,
      action: attacker.action,
      severity: Severity.Dodged,
      damage: 0,
      woundsInflicted: 0,
      ended: false,
    };
  }

  let result = resolveDamage({
    guts,
    swings,
    attack: attacker.attack,
    attackerSkill: attackerSpeed,
    defence: defender.defend,
    defenderSkill: ds,
    defenderGuts: defender.guts,
    defenderWounds: defender.wounds,
  });

  // A blast weapon replaces the blow when its fixed damage would beat it, and is spent either way.
  const blast = 25 * attacker.blastCharges;
  if (blast > result.damage) {
    result = resolveDamage({
      guts: 0,
      swings: 0,
      attack: blast,
      attackerSkill: attackerSpeed,
      defence: 0,
      defenderSkill: ds,
      defenderGuts: defender.guts,
      defenderWounds: defender.wounds,
    });
  }
  attacker.blastCharges = 0;

  defender.wounds += result.woundsInflicted;
  if (result.killed) {
    defender.state = State.DEAD;
  }

  return {
    attacker: attacker.name,
    action: attacker.action,
    severity: result.severity,
    damage: result.damage,
    woundsInflicted: result.woundsInflicted,
    ended: result.killed,
  };
}

/** Hypnosis and swindling: an opposed check that takes the loser out of the fight. */
function contestOfWills(
  attacker: Fighter,
  defender: Fighter,
  attackerValue: number,
  defenderBase: number,
  winState: string,
  rng: GameRandom,
): ActOutcome {
  const ds = defenderBase + (defender.traits.has(BattleTrait.STUBBORN) ? 30 : 0);
  const won = rng.contest(attackerValue, ds);
  if (won) {
    attacker.state = winState;
  }
  return {
    attacker: attacker.name,
    action: attacker.action,
    severity: Severity.Unharmed,
    damage: 0,
    woundsInflicted: 0,
    ended: won,
  };
}

export interface RoundResult {
  readonly heroFirst: boolean;
  readonly outcomes: readonly ActOutcome[];
}

/**
 * A full round: swings, multipliers, initiative, then one or both sides act.
 *
 * Initiative is an opposed Speed check, except that someone running away always goes last unless
 * both are fleeing.
 */
export function battleRound(hero: Fighter, mob: Fighter, rng: GameRandom): RoundResult {
  const heroSwings = rng.twice(3);
  const mobSwings = rng.twice(3);

  const h = prepare(hero, heroSwings);
  const m = prepare(mob, mobSwings);
  // Backstab reaches across and cuts the other side down to a single swing.
  if (h.opponentSwings !== null) {
    m.own.swings = h.opponentSwings;
  }
  if (m.opponentSwings !== null) {
    h.own.swings = m.opponentSwings;
  }

  const heroFleeing = isAction(hero.action, Action.RUNAWAY);
  const mobFleeing = isAction(mob.action, Action.RUNAWAY);
  let heroFirst: boolean;
  if (mobFleeing && !heroFleeing) {
    heroFirst = true;
  } else if (!heroFleeing || mobFleeing) {
    heroFirst = rng.contest(h.own.speed, m.own.speed);
  } else {
    heroFirst = false;
  }

  const first = heroFirst ? hero : mob;
  const second = heroFirst ? mob : hero;
  const firstNums = heroFirst ? h.own : m.own;
  const secondNums = heroFirst ? m.own : h.own;

  const outcomes: ActOutcome[] = [];
  outcomes.push(
    act(first, second, firstNums.guts, firstNums.swings, firstNums.speed, secondNums.speed, rng),
  );
  if (!outcomes[0]!.ended) {
    outcomes.push(
      act(
        second,
        first,
        secondNums.guts,
        secondNums.swings,
        secondNums.speed,
        firstNums.speed,
        rng,
      ),
    );
  }
  return { heroFirst, outcomes };
}

/** How a fight finished, in the order the game tests for it. */
export type Ending =
  | "mobFled"
  | "heroDied"
  | "heroControlled"
  | "heroSwindled"
  | "heroWon"
  | "mobControlled"
  | "mobSwindled"
  | "roundCap";

/**
 * Whether the fight is over, and how. Null while it continues.
 *
 * Note this does not cover a monster running away, which ends the encounter *before* a round is
 * fought rather than after one — see {@link fleesBeforeFighting}.
 */
export function endingOf(hero: Fighter, mob: Fighter): Ending | null {
  if (hero.state === State.DEAD) return "heroDied";
  if (hero.state === State.CONTROL) return "heroControlled";
  if (hero.state === State.SWINDLE) return "heroSwindled";
  if (mob.state === State.DEAD) return "heroWon";
  if (mob.state === State.CONTROL) return "mobControlled";
  if (mob.state === State.SWINDLE) return "mobSwindled";
  return null;
}

/**
 * A monster that has decided to run leaves, and no round happens at all.
 *
 * This is easy to miss and changes the game enormously: `arQuest` returns `mobFlees()` the moment
 * the monster's chosen action is Runaway, before any blow is struck. Without it, timid creatures
 * stand and fight to the death, and the whole early game becomes far deadlier than it is.
 */
export function fleesBeforeFighting(mob: Fighter): boolean {
  return isAction(mob.action, Action.RUNAWAY);
}
