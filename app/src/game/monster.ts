/**
 * Turning a monster definition into something that can fight you.
 *
 * A monster in the content is a template, not an opponent. Meeting one scales it to your level,
 * scatters its stats so no two encounters are identical, works out what it is worth, and decides
 * how aggressive it starts out. That is `balance`, and it happens once when the quest begins.
 */

import { BattleTrait, State, noPending, type Fighter } from "../rules/battle.js";
import { calcCombat } from "../rules/combat.js";
import type { GameRandom } from "../rules/random.js";
import type { Content, MonsterDefinition } from "./content.js";

/**
 * A random spread around a value: at least five sevenths of it, plus a triangular roll on the rest.
 *
 * This is why the same monster is never quite the same twice. Note it can only go *up* from the
 * floor, so the average lands above the template value rather than on it.
 */
export function spread(value: number, rng: GameRandom): number {
  const min = Math.trunc((value * 5) / 7);
  return 1 + min + rng.twice(value - min);
}

/** How ready a monster is to fight, and what it will do about it. */
export const Stance = {
  PASSIVE: 0,
  TIMID: 1,
  DEFENSIVE: 2,
  HOSTILE: 3,
  AGGRESSIVE: 4,
} as const;

/** The starting stance for a passion, defaulting to defensive as the Java does. */
export function stanceFor(passion: string): number {
  switch (passion) {
    case "aggressive":
      return Stance.AGGRESSIVE;
    case "hostile":
      return Stance.HOSTILE;
    case "timid":
      return Stance.TIMID;
    case "passive":
      return Stance.PASSIVE;
    case "defensive":
      return Stance.DEFENSIVE;
    default:
      return Stance.DEFENSIVE;
  }
}

export interface Monster extends Fighter {
  readonly key: string;
  /** Fight, magic, thief and ieatsu, from the monster's `temp` list. */
  readonly skills: ReadonlyMap<string, number>;
  /** What it is carrying, which decides whether it reaches for dust instead of a skill. */
  readonly carrying: ReadonlyMap<string, number>;
  /**
   * Charges of the two scripted moves some creatures have — a goat's charge, a worm's swallow.
   * Each is spent once and takes priority over anything else the monster might do.
   */
  scripted: { goat: number; worm: number };
  /** Rises each round for hostile and defensive monsters, which is how a fight escalates. */
  stance: number;
  readonly options: readonly string[];
  /** What killing it is worth. */
  readonly experience: number;
  readonly fame: number;
}

/**
 * Builds the opponent you actually meet.
 *
 * Scaling is by **level only, not by gear**: a monster tracks how experienced you are and ignores
 * how well equipped you are, so every area gets easier as you buy armour. That is 1997 behaviour
 * and is deliberate here — see `docs/gameplay.md`.
 *
 * The `adjust` flag on eight monsters, which was meant to scale them to your power rather than your
 * level, is not implemented, because it never worked in the original and cannot be made to work
 * against a linear damage rule. It was enabled and measured; those monsters became unkillable.
 */
/**
 * Which creatures read a telegraphed move coming, and which cannot be crept up on.
 *
 * `Fencer` adds 30 to the defender's Skill against a Berzerk, `Alert` the same against a Backstab.
 * Both rules were already in `battle.ts` and **neither had ever fired**: every monster was built
 * with an empty trait set, so the two counters to the game's two strongest moves were dead code,
 * and Berzerk was strictly the best action in every region.
 *
 * These assignments are **design judgement, not ported values** -- the Java build gives its
 * monsters no traits at all, so there is no number to source here and nothing to regenerate. The
 * rule used: `Fencer` goes to drilled, disciplined fighters who would read a wild charge, `Alert`
 * to the wary, the quick and the many-eyed. A handful of the very best carry both. Recorded in
 * `docs/porting-notes.md`.
 */
export const MONSTER_TRAITS: ReadonlyMap<string, readonly string[]> = new Map([
  // Drilled fighters: they have seen a berserker before.
  ["Fields:Soldier", [BattleTrait.FENCER]],
  ["Forest:Elf", [BattleTrait.FENCER]],
  ["Castle:Guard", [BattleTrait.FENCER]],
  ["Mound:Guard", [BattleTrait.FENCER]],
  ["Town:Guard", [BattleTrait.FENCER]],
  ["Vortex:Guard", [BattleTrait.FENCER]],
  ["Brasil:Fighter", [BattleTrait.FENCER]],
  ["Shang:Samurai", [BattleTrait.FENCER]],
  ["Hills:Sphinx", [BattleTrait.FENCER]],
  // Wary, quick, or watching every direction at once.
  ["Mound:Thief", [BattleTrait.ALERT]],
  ["Fields:Gypsy", [BattleTrait.ALERT]],
  ["Forest:Unicorn", [BattleTrait.ALERT]],
  ["Hills:Basilisk", [BattleTrait.ALERT]],
  ["Brasil:Medusa", [BattleTrait.ALERT]],
  ["Ocean:Mermaid", [BattleTrait.ALERT]],
  ["Faery", [BattleTrait.ALERT]],
  // The best of them do both.
  ["Shang:Ninja", [BattleTrait.ALERT, BattleTrait.FENCER]],
  ["Shang:Shogun", [BattleTrait.ALERT, BattleTrait.FENCER]],
  ["Mound:Champ", [BattleTrait.ALERT, BattleTrait.FENCER]],
  ["Mound:Queen", [BattleTrait.ALERT, BattleTrait.FENCER]],
  ["Brasil:Hero", [BattleTrait.ALERT, BattleTrait.FENCER]],
]);

export function balance(
  def: MonsterDefinition,
  heroLevel: number,
  weight: number,
  rng: GameRandom,
): Monster {
  const ratio = 0.9 + heroLevel * 0.1;
  const guts = spread(Math.trunc(def.guts * ratio), rng);
  const wits = spread(Math.trunc(def.wits * ratio), rng);
  const charm = spread(Math.trunc(def.charm * ratio), rng);

  // A monster's fighting stats go through the same derivation a hero's do: its baseA/baseD/baseS
  // are what its "gear" contributes, and Skill then adds the Wits-and-Charm term on top. Using
  // the base numbers alone leaves a monster fighting at a fraction of its real Skill -- which,
  // measured, made a bare newcomer win 198 fights out of 200.
  const stats = calcCombat({
    wits,
    charm,
    gear: [
      {
        attack: def.baseAttack,
        defend: def.baseDefend,
        skill: def.baseSkill,
        enchant: 0,
        forged: 0,
        tempered: 0,
        traits: new Set<string>(),
      },
    ],
    fightRank: 0,
    magicRank: 0,
    thiefRank: 0,
    traits: new Set<string>(),
  });
  const { attack, defend, skill } = stats;

  return {
    key: def.key,
    name: def.name,
    guts,
    wits,
    charm,
    attack,
    defend,
    skill,
    wounds: 0,
    state: State.ALIVE,
    action: "Attack",
    traits: new Set<string>(MONSTER_TRAITS.get(def.key) ?? []),
    blastCharges: 0,
    disease: 0,
    blinded: false,
    panicked: false,
    bonusSwings: 0,
    roundsFought: 0,
    wise: false,
    winded: false,
    reached: false,
    // Written in the content in lower case; the rules compare them capitalised.
    strikeTraits: new Set(def.gearTraits.map((t) => t.charAt(0).toUpperCase() + t.slice(1))),
    pending: noPending(),
    stance: stanceFor(def.passion),
    skills: def.skills,
    carrying: def.carrying,
    scripted: {
      goat: def.skills.get("goat") ?? 0,
      worm: def.skills.get("worm") ?? 0,
    },
    options: def.options,
    experience: Math.trunc(((1 + attack + defend) * (100 + skill)) / 100),
    fame:
      Math.trunc((guts + wits + charm) / 30) +
      Math.trunc(
        (skillOf(def, "thief") + skillOf(def, "magic") + skillOf(def, "fight") + weight) / 4,
      ),
  };
}

function skillOf(def: MonsterDefinition, name: string): number {
  return def.skills.get(name) ?? 0;
}

/**
 * What killing this thing is actually worth: `arQuest.heroWins`.
 *
 * Its base experience is only part of it. The rest scales with the creature's own bulk *and* with
 * how deep you went for it, which is the whole reason to leave the Fields — a monster in the Mound
 * is worth several times the same fight nearer home. The port awarded the base and nothing else, so
 * there was no experience reason to go anywhere.
 */
export function killExperience(monster: Monster, weight: number): number {
  return (
    monster.experience +
    Math.trunc(((2 * monster.guts + monster.wits + monster.charm) * weight) / 4)
  );
}

/** What talking it down is worth: less than killing it, plus the stat that did the talking. */
export function hypnosisExperience(monster: Monster): number {
  return monster.experience + monster.wits;
}

export function swindleExperience(monster: Monster): number {
  return monster.experience + monster.charm;
}

/** A fight escalates: hostile and defensive monsters get angrier each round. */
export function advanceStance(monster: Monster): void {
  if (monster.stance === Stance.HOSTILE || monster.stance === Stance.DEFENSIVE) {
    monster.stance++;
  }
}

/** The dusts a monster throws instead of fighting, from `GearTypes`. */
const MAGIC_ITEMS = ["Blinding Dust", "Panic Dust", "Blast Powder"] as const;

/** How much dust it has to throw. */
function packMagic(monster: Monster): number {
  return MAGIC_ITEMS.reduce((sum, name) => sum + (monster.carrying.get(name) ?? 0), 0);
}

function skill(monster: Monster, name: string): number {
  return monster.skills.get(name) ?? monster.skills.get(name.toLowerCase()) ?? 0;
}

/** Everything it knows how to do, added up. */
function guildSkill(monster: Monster): number {
  return (
    skill(monster, "fight") +
    skill(monster, "magic") +
    skill(monster, "thief") +
    skill(monster, "Ieatsu")
  );
}

/** A guild rank is worth half the base, per rank. */
function scale(rank: number, base: number): number {
  return rank * Math.trunc(base / 2);
}

/** How dangerous something is overall, the same weighting the game uses to compare two fighters. */
export function powerOf(f: {
  attack: number;
  defend: number;
  skill: number;
  guts: number;
  wits: number;
  charm: number;
  fight?: number;
  magic?: number;
  thief?: number;
}): number {
  return (
    f.attack * 4 +
    f.defend * 4 +
    f.skill +
    f.guts * 2 +
    f.wits +
    f.charm +
    scale(f.fight ?? 0, 12) +
    scale(f.magic ?? 0, 16) +
    scale(f.thief ?? 0, 8)
  );
}

function monsterPower(monster: Monster): number {
  return powerOf({
    attack: monster.attack,
    defend: monster.defend,
    skill: monster.skill,
    guts: monster.guts,
    wits: monster.wits,
    charm: monster.charm,
    fight: skill(monster, "fight"),
    magic: skill(monster, "magic"),
    thief: skill(monster, "thief"),
  });
}

/**
 * What it plays to, once it has decided to fight: `itMonster.useSkills`.
 *
 * It bolts when `roll(3)` reaches its stance, so a passive creature nearly always flees and an
 * aggressive one never does — which is why stance rising each round is what commits it to the
 * fight. Otherwise it uses what it has: opening, magic against thievery and swordsmanship, so a
 * magical thing hypnotises you before you have swung; afterwards only magic and fighting remain, so
 * it either hypnotises or goes berserk.
 */
function useSkills(monster: Monster, rng: GameRandom, first: boolean): string {
  if (rng.roll(3) >= monster.stance) {
    return "Runaway";
  }
  const fight = skill(monster, "fight");
  const magic = skill(monster, "magic");
  const thief = skill(monster, "thief");
  const ieatsu = skill(monster, "Ieatsu");

  if (first) {
    if (thief + magic + ieatsu >= 1) {
      if (rng.contest(magic, thief + ieatsu)) {
        return "Control";
      }
      if (rng.contest(ieatsu, thief)) {
        return "Ieatsu";
      }
      return rng.roll(2) === 0 ? "Swindle" : "Backstab";
    }
  } else if (magic + fight >= 1) {
    return rng.contest(magic, fight) ? "Control" : "Berzek";
  }
  return "Attack";
}

/**
 * What the monster does this round, ported from `itMonster.chooseActions`.
 *
 * The order matters and each step earns its place.
 *
 * **A monster with no actions left never reaches for anything** and goes straight to its skills.
 * That gate is easy to miss and decides a great deal: the field Wizard and the Wyvern carry no
 * Actions at all, so they always cast rather than throw dust, and skipping the gate turns the
 * Wyvern from something that hypnotises you almost every time into something that mostly does not.
 *
 * **A scripted move outranks everything** — a goat's charge, a worm's swallow — and is spent as it
 * is used.
 *
 * **Then dust against skill.** How much dust it can actually throw is capped by its actions, and
 * the skill side is weighted by how outmatched it is, so a creature facing someone far stronger
 * leans harder on what it knows.
 *
 * Not ported: the healing and stimulant handling, where a wounded monster drinks Troll Blood or
 * Ginseng to buy itself back actions. That is why trolls in particular still last longer in the
 * Java build than here.
 */
export function chooseMonsterAction(
  monster: Monster,
  rng: GameRandom,
  first = false,
  heroPower = 0,
): string {
  const actions = skill(monster, "Actions");
  if (actions < 1) {
    return useSkills(monster, rng, first);
  }

  if (monster.scripted.goat > 0) {
    monster.scripted.goat -= 1;
    return "goat";
  }
  if (monster.scripted.worm > 0) {
    monster.scripted.worm -= 1;
    return "worm";
  }

  const mine = monsterPower(monster);
  const danger = mine <= 0 ? 0 : Math.trunc(((heroPower - mine) * 4) / mine);

  let dust = packMagic(monster);
  const cap = actions + 2 * (monster.carrying.get("Ginseng Root") ?? 0);
  if (dust > cap) {
    dust = cap;
  }
  let known = guildSkill(monster);
  if (known > 0) {
    known += danger;
  }
  const against = first ? known - skill(monster, "fight") : known - skill(monster, "thief");

  return rng.contest(dust, against) ? "Spells" : useSkills(monster, rng, first);
}

/**
 * How dangerous a region's creatures are to someone of this level, on average.
 *
 * Weighted by how often each one turns up, because an area is as dangerous as what you actually
 * meet in it, not as its worst inhabitant. Scaled by level the same way {@link balance} scales it,
 * so the comparison is against the monster you would really be handed.
 */
export function typicalPower(
  entries: readonly { name: string; weight: number }[],
  prefix: string,
  content: Content,
  level: number,
): number {
  const ratio = 0.9 + level * 0.1;
  let total = 0;
  let weight = 0;
  for (const entry of entries) {
    const def = content.monsters.get(`${prefix}:${entry.name}`);
    if (def === undefined || entry.weight <= 0) {
      continue;
    }
    const guts = Math.trunc(def.guts * ratio);
    const wits = Math.trunc(def.wits * ratio);
    const charm = Math.trunc(def.charm * ratio);
    const stats = calcCombat({
      wits,
      charm,
      gear: [
        {
          attack: def.baseAttack,
          defend: def.baseDefend,
          skill: def.baseSkill,
          enchant: 0,
          forged: 0,
          tempered: 0,
          traits: new Set<string>(),
        },
      ],
      fightRank: 0,
      magicRank: 0,
      thiefRank: 0,
      traits: new Set<string>(),
    });
    total +=
      entry.weight * powerOf({ ...stats, guts, wits, charm, fight: def.skills.get("fight") ?? 0 });
    weight += entry.weight;
  }
  return weight === 0 ? 0 : Math.round(total / weight);
}
