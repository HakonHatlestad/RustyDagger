/**
 * The game as a state machine.
 *
 * Everything a player does moves between a handful of places — the fields, a quest, a shop, the
 * status screen — and the rules layer underneath knows nothing about any of it. Keeping the two
 * apart is the point: the rules are checked against the Java build, and the interface is free to
 * look like whatever suits a browser.
 *
 * Every transition goes through {@link apply}. That is the same discipline the Java build arrived
 * at with `DCourtPanel.setRegion`, and it is why saving on every move was a four-line change there.
 */

import {
  Action,
  State as FighterState,
  battleRound,
  endingOf,
  type ActOutcome,
  type Ending,
  type Fighter,
} from "../rules/battle.js";
import { calcCombat, type Equipment } from "../rules/combat.js";
import { questsAvailable, raiseFor, tryToLevel } from "../rules/levelling.js";
import type { GameRandom } from "../rules/random.js";
import type { Content, MonsterDefinition } from "./content.js";
import { advanceStance, balance, chooseMonsterAction, type Monster } from "./monster.js";
import { heroExp, heroFame, heroLevel, heroMarks, type Carried, type Hero } from "./hero.js";

/** Where the player is. */
export type Place =
  | { readonly kind: "entry" }
  | { readonly kind: "fields" }
  | { readonly kind: "status" }
  | { readonly kind: "shop"; readonly shop: string }
  | { readonly kind: "quest" }
  | { readonly kind: "dead" };

/** A live character: the saved hero, plus what the current session has done to it. */
export interface Character {
  name: string;
  guts: number;
  wits: number;
  charm: number;
  level: number;
  exp: number;
  fame: number;
  marks: number;
  wounds: number;
  fatigue: number;
  pack: Carried[];
  gear: Carried[];
  traits: Set<string>;
}

export interface QuestState {
  readonly monster: Monster;
  /** Everything that has happened in this fight, newest last. */
  readonly log: string[];
  readonly weight: number;
  ending: Ending | null;
  rounds: number;
}

export interface Game {
  readonly content: Content;
  readonly rng: GameRandom;
  place: Place;
  character: Character | null;
  quest: QuestState | null;
  /** Messages for the player since the last screen change. */
  notices: string[];
}

/** Builds a live character from a loaded save. */
export function characterFrom(hero: Hero): Character {
  return {
    name: hero.name,
    guts: hero.guts,
    wits: hero.wits,
    charm: hero.charm,
    level: heroLevel(hero),
    exp: heroExp(hero),
    fame: heroFame(hero),
    marks: heroMarks(hero),
    wounds: 0,
    fatigue: 0,
    pack: [...hero.pack].filter((c) => c.name !== "Marks"),
    gear: [...hero.gear],
    traits: new Set(hero.statFlags),
  };
}

/** Equipment the combat rules can read, from what the character is wearing. */
function equipmentOf(character: Character): Equipment[] {
  return character.gear
    .filter((c): c is Extract<Carried, { kind: "arms" }> => c.kind === "arms")
    .map((c) => ({
      attack: c.attack,
      defend: c.defend,
      skill: c.skill,
      enchant: 0,
      traits: new Set(c.traits.map((t) => t.charAt(0).toUpperCase() + t.slice(1))),
    }));
}

/** The character as a combatant, with gear folded in. */
export function asFighter(character: Character): Fighter {
  const stats = calcCombat({
    wits: character.wits,
    charm: character.charm,
    gear: equipmentOf(character),
    fightRank: 0,
    magicRank: 0,
    thiefRank: 0,
    traits: character.traits,
  });
  return {
    name: character.name,
    guts: character.guts,
    wits: character.wits,
    charm: character.charm,
    attack: stats.attack,
    defend: stats.defend,
    skill: stats.skill,
    wounds: character.wounds,
    state: FighterState.ALIVE,
    action: Action.ATTACK,
    traits: character.traits,
    blastCharges: 0,
    disease: 0,
  };
}

/** How many quests the character has left today. */
export function questsLeft(character: Character): number {
  return questsAvailable({ level: character.level, fatigue: character.fatigue });
}

/** Health left, and the fraction of it — what an experience bar and a health bar are drawn from. */
export const healthLeft = (c: Character): number => Math.max(0, c.guts - c.wounds);
export const healthFraction = (c: Character): number => (c.guts <= 0 ? 0 : healthLeft(c) / c.guts);
export const expFraction = (c: Character): number => {
  const needed = raiseFor(c.level);
  return needed <= 0 ? 0 : Math.min(1, c.exp / needed);
};

/** Every move the player can make. */
export type Move =
  | { readonly kind: "goTo"; readonly place: Place }
  | { readonly kind: "startQuest"; readonly monsterKey: string; readonly weight: number }
  | { readonly kind: "fight"; readonly action: string }
  | { readonly kind: "leaveQuest" }
  | { readonly kind: "equip"; readonly index: number }
  | { readonly kind: "unequip"; readonly index: number };

/**
 * Applies a move and returns the game.
 *
 * Mutating rather than returning a new object is deliberate: the state is small, the interface
 * re-reads it after every move, and structural sharing would buy nothing but ceremony here.
 */
export function apply(game: Game, move: Move): Game {
  switch (move.kind) {
    case "goTo":
      game.place = move.place;
      game.notices = [];
      if (move.place.kind !== "quest") {
        game.quest = null;
      }
      return game;

    case "startQuest":
      return startQuest(game, move.monsterKey, move.weight);

    case "fight":
      return fightRound(game, move.action);

    case "leaveQuest":
      game.quest = null;
      game.place = { kind: "fields" };
      return game;

    case "equip":
      return moveBetween(game, "pack", "gear", move.index);

    case "unequip":
      return moveBetween(game, "gear", "pack", move.index);
  }
}

function moveBetween(game: Game, from: "pack" | "gear", to: "pack" | "gear", index: number): Game {
  const character = game.character;
  if (character === null) {
    return game;
  }
  const item = character[from][index];
  if (item === undefined || item.kind !== "arms") {
    return game;
  }
  character[from].splice(index, 1);
  character[to].push(item);
  return game;
}

function startQuest(game: Game, monsterKey: string, weight: number): Game {
  const character = game.character;
  const def: MonsterDefinition | undefined = game.content.monsters.get(monsterKey);
  if (character === null || def === undefined) {
    return game;
  }
  const monster = balance(def, character.level, weight, game.rng);
  monster.action = chooseMonsterAction(monster, game.rng);
  character.fatigue += 1;
  game.quest = {
    monster,
    log: [`You meet ${monster.name}.`],
    weight,
    ending: null,
    rounds: 0,
  };
  game.place = { kind: "quest" };
  return game;
}

/** Turns a round's outcomes into the lines a player reads. */
function describe(outcome: ActOutcome, defenderName: string): string {
  const bands = ["misses", "does no harm to", "scratches", "injures", "wounds", "kills"];
  const verb = bands[outcome.severity] ?? "strikes";
  const amount = outcome.woundsInflicted > 0 ? ` for ${outcome.woundsInflicted}` : "";
  return `${outcome.attacker} ${verb} ${defenderName}${amount}.`;
}

function fightRound(game: Game, action: string): Game {
  const character = game.character;
  const quest = game.quest;
  if (character === null || quest === null || quest.ending !== null) {
    return game;
  }

  const hero = asFighter(character);
  hero.action = action;
  const monster = quest.monster;
  monster.action = chooseMonsterAction(monster, game.rng);

  const round = battleRound(hero, monster, game.rng);
  for (const outcome of round.outcomes) {
    quest.log.push(describe(outcome, outcome.attacker === hero.name ? monster.name : hero.name));
  }

  character.wounds = hero.wounds;
  quest.rounds += 1;

  const ending = endingOf(hero, monster);
  if (ending !== null) {
    quest.ending = ending;
    finishQuest(game, character, quest, ending);
    return game;
  }
  advanceStance(monster);
  return game;
}

function finishQuest(game: Game, character: Character, quest: QuestState, ending: Ending): void {
  switch (ending) {
    case "heroWon": {
      character.exp += quest.monster.experience;
      character.fame += quest.monster.fame;
      quest.log.push(
        `You defeat ${quest.monster.name}, gaining ${quest.monster.experience} experience.`,
      );
      const levelled = tryToLevel(character.level, character.exp);
      if (levelled.levelled) {
        character.level = levelled.level;
        character.exp = levelled.exp;
        character.guts += levelled.statGain;
        character.wits += levelled.statGain;
        character.charm += levelled.statGain;
        character.fame += levelled.fameGain;
        quest.log.push(`You reach level ${character.level}.`);
      }
      break;
    }
    case "heroDied":
      quest.log.push(`${quest.monster.name} kills you.`);
      game.place = { kind: "dead" };
      break;
    case "heroControlled":
      quest.log.push(`${quest.monster.name} is mesmerised and wanders off.`);
      break;
    case "heroSwindled":
      quest.log.push(`You talk ${quest.monster.name} out of everything it was carrying.`);
      break;
    case "mobControlled":
    case "mobSwindled":
      quest.log.push(`${quest.monster.name} gets the better of you and you stumble away.`);
      break;
    case "roundCap":
      quest.log.push("Neither of you can land a decisive blow.");
      break;
  }
}
