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

/**
 * What going berserk costs: your guard, halved for that round.
 *
 * Not the Java's -- the Java charges nothing, which is why `baseline/rules.txt`'s SPECIAL ACTIONS
 * rows and the port now disagree on purpose. See `docs/porting-notes.md`.
 */
export const BERZERK_GUARD_DIVISOR = 2;

/** Whether an action is an all-out charge, which costs both the guard and the initiative. */
function wildCharge(action: string): boolean {
  return isAction(action, Action.BERZERK) || isAction(action, Action.IEATSU);
}

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
  /** Takes only half of any disease inflicted. */
  HARDY: "Hardy",
} as const;

/**
 * Traits carried by what a fighter strikes *with*, which act on the target after a blow lands.
 *
 * These are deliberately kept apart from {@link BattleTrait}: those describe the fighter, these
 * describe the weapon, and the game resolves them at different moments.
 */
export const StrikeTrait = {
  BLIND: "Blind",
  PANIC: "Panic",
  DISEASE: "Disease",
} as const;

/**
 * Effects queued by a weapon or a thrown dust, resolved once the blow they rode in on has landed.
 *
 * The game keeps these in the attacker's action list and settles them in `arBattle.spellEffects`,
 * which is why a blinding weapon and a handful of blinding dust behave identically: both simply add
 * to the same queue. Modelling that queue rather than the two cases separately is what keeps them
 * consistent here too.
 */
export interface PendingEffects {
  blind: number;
  panic: number;
  disease: number;
}

export function noPending(): PendingEffects {
  return { blind: 0, panic: 0, disease: 0 };
}

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
  /**
   * Blinded by thrown dust, for the rest of this fight.
   *
   * Deliberately separate from the {@link BattleTrait.BLIND} trait even though both halve the same
   * numbers: a trait is something a fighter permanently is, and this is something that was done to
   * them a moment ago. Folding the two together would mean a blinding wearing off could strip a
   * trait the character was born with.
   */
  blinded: boolean;
  /** Panicked by thrown dust: breaks off and runs rather than fighting on. */
  panicked: boolean;
  /** Extra swings from haste, spent on the next round and not kept. */
  bonusSwings: number;
  /** Traits of what this fighter strikes with, which act on whoever it hits. */
  readonly strikeTraits: ReadonlySet<string>;
  /** Queued effects awaiting a landing blow. */
  pending: PendingEffects;
  /**
   * Rounds this fighter has already been through, which is what surprise is made of.
   *
   * Backstab needs a target who has not been trading blows with you: measured, an always-available
   * Backstab was strictly better than an ordinary swing in every region, because it doubled Guts
   * and Speed *and* cut the other side to one swing for no cost at all.
   */
  roundsFought: number;
  /**
   * Has seen a Hypnotise or a Swindle fail, and will not fall for the next one.
   *
   * Without this, both are free re-rolls: they end the fight outright or cost a round, and a round
   * is cheap, so grinding them beat fighting outright in the deep regions.
   */
  wise: boolean;
  /**
   * Still off balance from the last charge, so this one will not connect as a charge.
   *
   * Without it, Berzerk was simply the button you held down: there was no round in which an
   * ordinary swing was the better choice, so five of the six actions were decoration.
   */
  winded: boolean;
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
  /** Defence for this round only. Berzerk drops it; nothing else moves it. */
  defence: number;
}

/**
 * Applies a fighter's chosen action and traits.
 *
 * Returns their own adjusted numbers; `opponentSwings` is returned separately because Backstab
 * reaches across and cuts the *other* side down to one swing.
 */
function prepare(f: Fighter, swings: number): { own: Prepared; opponentSwings: number | null } {
  const own: Prepared = {
    guts: f.guts,
    speed: effectiveSkill(f),
    swings: swings + f.bonusSwings,
    defence: f.defend,
  };
  let opponentSwings: number | null = null;

  if (isAction(f.action, Action.BACKSTAB)) {
    // Only from surprise. Once they are trading blows with you there is no back to stab.
    if (f.roundsFought === 0) {
      own.guts *= 2;
      own.speed *= 2;
      opponentSwings = 1;
    }
  } else if (wildCharge(f.action)) {
    // A second charge in a row is just flailing: you pay the guard and the initiative for it
    // either way, which is what makes an ordinary swing the right move in between.
    if (!f.winded) {
      own.guts *= 2;
      own.speed *= 2;
      own.swings = 4;
    }
    // The whole point of going berserk: everything into the swing and nothing left guarding.
    // Without this it was strictly the best move in the game, which the interface never claimed.
    own.defence = Math.trunc(own.defence / BERZERK_GUARD_DIVISOR);
  } else if (isAction(f.action, Action.CONTROL)) {
    own.speed = f.wits;
  } else if (isAction(f.action, Action.SWINDLE)) {
    own.speed = f.charm;
  }

  if (f.traits.has(BattleTrait.REFLEX)) {
    own.speed += 30;
  }
  if (f.traits.has(BattleTrait.BLIND) || f.blinded) {
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
  /** What the blow did beyond damage: blinded, panicked, made sick. */
  readonly notes: readonly string[];
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
  defenderDefence: number = defender.defend,
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
      notes: [],
    };
  }

  let result = resolveDamage({
    guts,
    swings,
    attack: attacker.attack,
    attackerSkill: attackerSpeed,
    defence: defenderDefence,
    defenderSkill: ds,
    defenderGuts: defender.guts,
    defenderWounds: defender.wounds,
  });

  // A blast weapon replaces the blow when its fixed damage would beat it, and is spent either way.
  const blast = 25 * attacker.blastCharges;
  const useBlast = blast > result.damage;
  if (useBlast) {
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
  const notes: string[] = [];
  if (attacker.blastCharges > 0 && useBlast) {
    notes.push("blast");
  }
  attacker.blastCharges = 0;

  defender.wounds += result.woundsInflicted;
  if (result.killed) {
    defender.state = State.DEAD;
  }

  queueStrikeEffects(attacker, result.damage, useBlast);
  notes.push(...resolveEffects(attacker, defender, rng));

  return {
    attacker: attacker.name,
    action: attacker.action,
    severity: result.severity,
    damage: result.damage,
    woundsInflicted: result.woundsInflicted,
    ended: result.killed,
    notes,
  };
}

/**
 * A landing blow queues whatever the weapon carries.
 *
 * Disease scales with how hard the blow was and is the one effect a blast suppresses, because the
 * explosion, not the blade, is what reached the target.
 */
function queueStrikeEffects(attacker: Fighter, damage: number, useBlast: boolean): void {
  if (attacker.strikeTraits.has(StrikeTrait.BLIND)) {
    attacker.pending.blind += 1;
  }
  if (attacker.strikeTraits.has(StrikeTrait.PANIC)) {
    attacker.pending.panic += 1;
  }
  if (!useBlast && attacker.strikeTraits.has(StrikeTrait.DISEASE)) {
    attacker.pending.disease += Math.trunc((damage + 3) / 5);
  }
}

/**
 * Settles the queued effects against the target.
 *
 * Blinding and panic are opposed Wits checks that get *stronger the more you throw*, because the
 * attacker's Wits is multiplied by the count. Disease needs no check and simply lands, halved
 * against anyone Hardy. Everything queued is spent whether it worked or not.
 */
function resolveEffects(attacker: Fighter, defender: Fighter, rng: GameRandom): string[] {
  const notes: string[] = [];
  const { blind, panic, disease } = attacker.pending;

  if (blind > 0 && rng.contest(attacker.wits * blind, defender.wits)) {
    defender.blinded = true;
    notes.push("blinded");
  }
  if (panic > 0 && rng.contest(attacker.wits * panic, defender.wits)) {
    defender.panicked = true;
    notes.push("panicked");
  }
  if (disease > 0) {
    defender.disease += defender.traits.has(BattleTrait.HARDY) ? Math.trunc(disease / 2) : disease;
    notes.push("sickened");
  }

  attacker.pending = noPending();
  return notes;
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
  // Once they have seen the patter fail they do not fall for it again this fight.
  const won = !defender.wise && rng.contest(attackerValue, ds);
  if (won) {
    attacker.state = winState;
  } else {
    defender.wise = true;
  }
  return {
    attacker: attacker.name,
    action: attacker.action,
    severity: Severity.Unharmed,
    damage: 0,
    woundsInflicted: 0,
    ended: won,
    notes: [],
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
  // Haste is spent the moment it is used, whatever the round then does.
  hero.bonusSwings = 0;
  mob.bonusSwings = 0;
  // Backstab reaches across and cuts the other side down to a single swing.
  if (h.opponentSwings !== null) {
    m.own.swings = h.opponentSwings;
  }
  if (m.opponentSwings !== null) {
    h.own.swings = m.opponentSwings;
  }

  const heroFleeing = isAction(hero.action, Action.RUNAWAY);
  const mobFleeing = isAction(mob.action, Action.RUNAWAY);
  // A berserk charge is telegraphed: you wind up, they see it, and they get theirs in first.
  // Halving the guard alone was not a cost, because at four swings the fight was usually over
  // before anything could be swung back. Yielding the initiative is what makes it a gamble.
  const heroWild = wildCharge(hero.action);
  const mobWild = wildCharge(mob.action);
  let heroFirst: boolean;
  if (mobFleeing && !heroFleeing) {
    heroFirst = true;
  } else if (heroFleeing && !mobFleeing) {
    heroFirst = false;
  } else if (heroWild !== mobWild) {
    heroFirst = mobWild;
  } else {
    heroFirst = rng.contest(h.own.speed, m.own.speed);
  }

  const first = heroFirst ? hero : mob;
  const second = heroFirst ? mob : hero;
  const firstNums = heroFirst ? h.own : m.own;
  const secondNums = heroFirst ? m.own : h.own;

  const outcomes: ActOutcome[] = [];
  outcomes.push(
    act(
      first,
      second,
      firstNums.guts,
      firstNums.swings,
      firstNums.speed,
      secondNums.speed,
      rng,
      secondNums.defence,
    ),
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
        firstNums.defence,
      ),
    );
  }
  // Both sides have now been in it, so nobody's back is turned any more.
  hero.roundsFought += 1;
  mob.roundsFought += 1;
  // A charge that connected leaves you winded next round; one thrown while already winded does
  // not, so the cost is one round of ordinary fighting rather than a permanent tax.
  hero.winded = wildCharge(hero.action) && !hero.winded;
  mob.winded = wildCharge(mob.action) && !mob.winded;
  return { heroFirst, outcomes };
}

/**
 * A round in which only one side acts.
 *
 * The hero spends a round drinking a salve or flinging dust; the monster does not stop swinging
 * while they do it. Reaching for something is a real choice with a real cost, rather than a free
 * action that would make any potion strictly better than fighting.
 */
export function oneSidedRound(actor: Fighter, target: Fighter, rng: GameRandom): ActOutcome {
  const a = prepare(actor, rng.twice(3));
  const t = prepare(target, rng.twice(3));
  actor.bonusSwings = 0;
  return act(actor, target, a.own.guts, a.own.swings, a.own.speed, t.own.speed, rng, t.own.defence);
}

/**
 * How a fight finished, in the order the game tests for it.
 *
 * **The names say who won, not which flag is set**, and that distinction has already cost one real
 * bug. A fighter carries the Control or Swindle state when it *succeeds* at one, so a hero holding
 * the Control flag has hypnotised the monster and is about to take its whole pack — naming that
 * "heroControlled" reads exactly backwards, and this port did name it that, and then wrote the
 * player-facing message to match the name rather than the rule.
 */
export type Ending =
  | "mobFled"
  | "heroDied"
  /** You hypnotised it: you take everything it had, and may grow a point of Wits. */
  | "wonByHypnosis"
  /** You talked it out of everything: its whole pack, and maybe a point of Charm. */
  | "wonBySwindle"
  | "heroWon"
  /** It hypnotised you. You get nothing, and an aggressive one walks you off a cliff. */
  | "lostToHypnosis"
  /** It swindled you, and helps itself to your purse. */
  | "lostToSwindle"
  | "roundCap";

/**
 * Whether the fight is over, and how. Null while it continues.
 *
 * Note this does not cover a monster running away, which ends the encounter *before* a round is
 * fought rather than after one — see {@link fleesBeforeFighting}.
 */
export function endingOf(hero: Fighter, mob: Fighter): Ending | null {
  if (hero.state === State.DEAD) return "heroDied";
  if (hero.state === State.CONTROL) return "wonByHypnosis";
  if (hero.state === State.SWINDLE) return "wonBySwindle";
  if (mob.state === State.DEAD) return "heroWon";
  if (mob.state === State.CONTROL) return "lostToHypnosis";
  if (mob.state === State.SWINDLE) return "lostToSwindle";
  return null;
}

/**
 * A monster that has decided to run leaves, and no round happens at all.
 *
 * This is easy to miss and changes the game enormously: `arQuest` returns `mobFlees()` the moment
 * the monster's chosen action is Runaway, before any blow is struck. Without it, timid creatures
 * stand and fight to the death, and the whole early game becomes far deadlier than it is.
 *
 * A panicked monster leaves the same way, which is the whole point of throwing Panic Dust: it does
 * no damage at all and simply ends the fight.
 */
export function fleesBeforeFighting(mob: Fighter): boolean {
  return mob.panicked || isAction(mob.action, Action.RUNAWAY);
}
