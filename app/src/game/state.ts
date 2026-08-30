/**
 * The game as a state machine.
 *
 * Everything a player does moves between a handful of places — the town, the fields, a fight, a
 * shop — and the rules layer underneath knows nothing about any of it. Keeping the two apart is the
 * point: the rules are checked against the Java build, and the interface is free to look like
 * whatever suits a browser.
 *
 * Every transition goes through {@link apply}. That is the same discipline the Java build arrived
 * at with `DCourtPanel.setRegion`, and it is why autosaving on every move is a one-line hook here.
 *
 * ## What this is no longer
 *
 * The 1997 game is a *daily* game: you get a ration of quests, you spend it, you come back
 * tomorrow. Everything about that shape — the quest allowance, fatigue, gear wearing out, losing
 * things when you die — exists to make a player put the game down and return the next day, which is
 * how a 1997 browser game earned its living. None of it survives here, deliberately: this is a
 * single-player game you can sit down and finish. What replaces the pressure is the fight itself,
 * which is the one place the game was always tense. See `docs/porting-notes.md`.
 */

import {
  Action,
  State as FighterState,
  battleRound,
  endingOf,
  fleesBeforeFighting,
  noPending,
  oneSidedRound,
  type ActOutcome,
  type Ending,
  type Fighter,
} from "../rules/battle.js";
import { calcCombat, type Equipment } from "../rules/combat.js";
import { raiseFor, tryToLevel } from "../rules/levelling.js";
import type { GameRandom } from "../rules/random.js";
import type { Content, MonsterDefinition } from "./content.js";
import { advanceStance, balance, chooseMonsterAction, powerOf, type Monster } from "./monster.js";
import { rollLoot } from "./loot.js";
import { buyPrice, sellPrice, shopByKey, type ShopDefinition } from "./shop.js";
import { effectOf, endOfFight, isUsableHere, useItem } from "./items.js";
import { backgroundByKey, newHeroText } from "./creation.js";
import {
  heroExp,
  heroFame,
  heroLevel,
  heroMarks,
  parseHero,
  type Carried,
  type Hero,
} from "./hero.js";

/** Where the player is. */
export type Place =
  | { readonly kind: "creation" }
  | { readonly kind: "town" }
  | { readonly kind: "fields" }
  | { readonly kind: "status" }
  | { readonly kind: "shop"; readonly shop: string }
  | { readonly kind: "temple" }
  | { readonly kind: "quest" }
  | { readonly kind: "fallen" };

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
  /** Damage taken, which persists between fights until you rest. */
  wounds: number;
  /** Points of disease, which drag Skill down until cured. */
  disease: number;
  pack: Carried[];
  gear: Carried[];
  traits: Set<string>;
  /**
   * The save this character was read from.
   *
   * Kept so that writing it back cannot quietly drop the parts of a 1997 hero this port does not
   * model — guild ranks, looks, the store. A character who visits the new app should be able to go
   * back to the Java build unharmed.
   */
  readonly origin: Hero;
}

export interface QuestState {
  readonly monster: Monster;
  /** The content entry, kept so loot can be rolled from its pack and gear when the fight ends. */
  readonly definition: MonsterDefinition;
  /**
   * The hero as a combatant, built once when the fight starts.
   *
   * Deliberately kept for the whole fight rather than rebuilt each round: blinding, readied blast
   * powder and queued dust all live on the fighter, and rebuilding would silently wipe them at the
   * start of every round.
   */
  readonly hero: Fighter;
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
    // Wounds and disease live in the hero's `temp` list, which is where the Java keeps them, so a
    // character who was hurt when the tab closed is still hurt when it opens.
    wounds: hero.temp.get("Wounds") ?? 0,
    disease: hero.temp.get("Disease") ?? 0,
    pack: [...hero.pack].filter((c) => c.name !== "Marks"),
    gear: [...hero.gear],
    traits: new Set(hero.statFlags),
    origin: hero,
  };
}

/**
 * Writes a live character back into a save.
 *
 * Everything the port does not model is taken from the hero it was loaded from, which is why
 * {@link Character.origin} exists.
 */
export function toHero(character: Character): Hero {
  const origin = character.origin;
  const stat = new Map(origin.stat);
  stat.set("Exp", character.exp);
  stat.set("Fame", character.fame);

  const rank = new Map(origin.rank);
  rank.set("Level", character.level);

  const temp = new Map(origin.temp);
  temp.set("Wounds", character.wounds);
  temp.set("Disease", character.disease);

  const values = new Map(origin.values);
  values.set("state", "Alive");

  return {
    ...origin,
    name: character.name,
    guts: character.guts,
    wits: character.wits,
    charm: character.charm,
    // Money is an item in the pack, not a field, so it goes back the way it came out.
    pack: [{ kind: "count", name: "Marks", count: character.marks }, ...character.pack],
    gear: [...character.gear],
    stat,
    statFlags: [...character.traits],
    temp,
    rank,
    values,
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
      traits: new Set(c.traits.map(capitalise)),
    }));
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
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
    disease: character.disease,
    blinded: false,
    panicked: false,
    bonusSwings: 0,
    // What you strike with can carry its own effects: a diseased blade, a panicking rod.
    strikeTraits: new Set(
      character.gear
        .filter((c): c is Extract<Carried, { kind: "arms" }> => c.kind === "arms")
        .flatMap((c) => c.traits.map(capitalise)),
    ),
    pending: noPending(),
  };
}

/** Health left, and the fraction of it — what a health bar and an experience bar are drawn from. */
export const healthLeft = (c: Character): number => Math.max(0, c.guts - c.wounds);
export const healthFraction = (c: Character): number => (c.guts <= 0 ? 0 : healthLeft(c) / c.guts);
export const expFraction = (c: Character): number => {
  const needed = raiseFor(c.level);
  return needed <= 0 ? 0 : Math.min(1, c.exp / needed);
};

/** Every move the player can make. */
export type Move =
  | { readonly kind: "goTo"; readonly place: Place }
  | { readonly kind: "beginGame"; readonly name: string; readonly background: string }
  | { readonly kind: "startQuest"; readonly monsterKey: string; readonly weight: number }
  | { readonly kind: "fight"; readonly action: string }
  | { readonly kind: "useItem"; readonly index: number }
  | { readonly kind: "leaveQuest" }
  | { readonly kind: "rest" }
  | { readonly kind: "equip"; readonly index: number }
  | { readonly kind: "unequip"; readonly index: number }
  | { readonly kind: "buy"; readonly shop: string; readonly name: string }
  | { readonly kind: "sell"; readonly shop: string; readonly index: number };

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

    case "beginGame":
      return beginGame(game, move.name, move.background);

    case "startQuest":
      return startQuest(game, move.monsterKey, move.weight);

    case "fight":
      return fightRound(game, move.action);

    case "useItem":
      return useCarriedItem(game, move.index);

    case "leaveQuest":
      game.quest = null;
      game.place = { kind: "fields" };
      return game;

    case "rest":
      return rest(game);

    case "equip":
      return moveBetween(game, "pack", "gear", move.index);

    case "unequip":
      return moveBetween(game, "gear", "pack", move.index);

    case "buy":
      return buy(game, shopByKey(move.shop), move.name);

    case "sell":
      return sell(game, shopByKey(move.shop), move.index);
  }
}

function beginGame(game: Game, name: string, backgroundKey: string): Game {
  const hero = parseHero(newHeroText(name, backgroundByKey(backgroundKey)));
  game.character = characterFrom(hero);
  game.quest = null;
  game.place = { kind: "town" };
  game.notices = [`${game.character.name} arrives in town with what they stand up in.`];
  return game;
}

/**
 * Resting at the temple: free, and complete.
 *
 * Charging for this was considered and dropped. With no death penalty there is nothing to charge
 * *against* — a player who does not want to pay can simply walk into the fields and lose, and be
 * returned to town in exactly the same state. A fee that any player can decline by losing on
 * purpose is not a cost, it is a chore, so the tension is left where it is real: inside a fight,
 * where the only way back is something you are carrying.
 */
function rest(game: Game): Game {
  const character = game.character;
  if (character === null) {
    return game;
  }
  const hurt = character.wounds > 0 || character.disease > 0;
  character.wounds = 0;
  character.disease = 0;
  game.notices = [
    hurt
      ? "You sleep on the temple's hard benches and wake whole."
      : "Elden Bishop looks you over, finds nothing wrong, and offers you tea.",
  ];
  return game;
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

/** Adds to a stack if one is already there, so the pack does not fill with single potions. */
function addToPack(character: Character, item: Carried): void {
  if (item.kind === "count") {
    const existing = character.pack.find(
      (c): c is Extract<Carried, { kind: "count" }> => c.kind === "count" && c.name === item.name,
    );
    if (existing !== undefined) {
      const merged: Carried = {
        kind: "count",
        name: existing.name,
        count: existing.count + item.count,
      };
      character.pack[character.pack.indexOf(existing)] = merged;
      return;
    }
  }
  character.pack.push(item);
}

/** Takes one off a stack, removing it when the last is spent. */
function spendOne(character: Character, index: number): void {
  const item = character.pack[index];
  if (item === undefined) {
    return;
  }
  if (item.kind === "count" && item.count > 1) {
    character.pack[index] = { kind: "count", name: item.name, count: item.count - 1 };
    return;
  }
  character.pack.splice(index, 1);
}

function buy(game: Game, shop: ShopDefinition, name: string): Game {
  const character = game.character;
  if (character === null || !shop.stock.includes(name)) {
    return game;
  }
  const price = buyPrice(game.content, shop, name);
  if (price > character.marks) {
    game.notices = [`You cannot afford the ${name}.`];
    return game;
  }
  const weapon = game.content.weapons.get(name);
  if (weapon !== undefined) {
    character.pack.push({
      kind: "arms",
      name: weapon.key,
      attack: weapon.attack,
      defend: weapon.defend,
      skill: weapon.skill,
      traits: weapon.traits,
    });
  } else if (game.content.gear.has(name)) {
    addToPack(character, { kind: "count", name, count: 1 });
  } else {
    return game;
  }
  character.marks -= price;
  game.notices = [`You buy the ${name} for ${String(price)} Marks.`];
  return game;
}

function sell(game: Game, shop: ShopDefinition, index: number): Game {
  const character = game.character;
  if (character === null) {
    return game;
  }
  const item = character.pack[index];
  if (item === undefined) {
    return game;
  }
  const price = sellPrice(
    game.content,
    shop,
    item,
    character.charm,
    character.traits.has("Merchant"),
  );
  spendOne(character, index);
  character.marks += price;
  game.notices = [`You sell the ${item.name} for ${String(price)} Marks.`];
  return game;
}

/**
 * Using something out of the pack.
 *
 * The same move works in town and mid-fight, and the difference is what it costs: out of a fight it
 * is free, in one it is your round, and the monster takes it.
 */
function useCarriedItem(game: Game, index: number): Game {
  const character = game.character;
  if (character === null) {
    return game;
  }
  const item = character.pack[index];
  const quest = game.quest;
  const inFight = quest !== null && quest.ending === null;
  if (item === undefined || !isUsableHere(game.content, item, inFight)) {
    return game;
  }

  // TypeScript narrows `quest` through `inFight`, which is why it is not re-tested below.
  const self = inFight ? quest.hero : asFighter(character);
  const foe = inFight ? quest.monster : null;
  const result = useItem(
    effectOf(game.content, item.name),
    self,
    foe,
    character.traits.has("Medic"),
    item.name,
  );

  if (!result.used) {
    game.notices = [result.message];
    if (inFight) {
      quest.log.push(result.message);
    }
    return game;
  }

  spendOne(character, index);
  character.wounds = self.wounds;
  character.disease = self.disease;

  if (!inFight) {
    game.notices = [result.message];
    return game;
  }

  quest.log.push(result.message);
  // Reaching for something costs you the round. A panicked monster leaves rather than taking it.
  if (fleesBeforeFighting(quest.monster)) {
    quest.ending = "mobFled";
    quest.log.push(`${quest.monster.name} turns and runs.`);
    finishQuest(game, character, quest, "mobFled");
    return game;
  }
  const outcome = oneSidedRound(quest.monster, quest.hero, game.rng);
  quest.log.push(describe(outcome, quest.hero.name));
  character.wounds = quest.hero.wounds;
  character.disease = quest.hero.disease;
  quest.rounds += 1;

  const ending = endingOf(quest.hero, quest.monster);
  if (ending !== null) {
    quest.ending = ending;
    finishQuest(game, character, quest, ending);
    return game;
  }
  advanceStance(quest.monster);
  return game;
}

function startQuest(game: Game, monsterKey: string, weight: number): Game {
  const character = game.character;
  const def: MonsterDefinition | undefined = game.content.monsters.get(monsterKey);
  if (character === null || def === undefined) {
    return game;
  }
  const hero = asFighter(character);
  const monster = balance(def, character.level, weight, game.rng);
  // How dangerous the hero looks is what decides whether the monster reaches for magic. Leaving it
  // out makes every creature read you as harmless, which is a rule quietly missing, not a detail.
  const heroPower = powerOf(hero);
  monster.action = chooseMonsterAction(monster, game.rng, true, heroPower);
  const quest: QuestState = {
    monster,
    definition: def,
    hero,
    log: [`You meet ${monster.name}.`],
    weight,
    ending: null,
    rounds: 0,
  };
  game.quest = quest;
  game.place = { kind: "quest" };
  game.notices = [];
  // A monster that has already decided to run never fights you at all.
  if (fleesBeforeFighting(monster)) {
    quest.ending = "mobFled";
    quest.log.push(`${monster.name} takes one look at you and bolts.`);
  }
  return game;
}

/** Turns a round's outcomes into the lines a player reads. */
function describe(outcome: ActOutcome, defenderName: string): string {
  const bands = ["misses", "does no harm to", "scratches", "injures", "wounds", "kills"];
  const verb = bands[outcome.severity] ?? "strikes";
  const amount = outcome.woundsInflicted > 0 ? ` for ${String(outcome.woundsInflicted)}` : "";
  const notes = outcome.notes.length > 0 ? ` (${outcome.notes.join(", ")})` : "";
  return `${outcome.attacker} ${verb} ${defenderName}${amount}${notes}.`;
}

function fightRound(game: Game, action: string): Game {
  const character = game.character;
  const quest = game.quest;
  if (character === null || quest === null || quest.ending !== null) {
    return game;
  }

  const hero = quest.hero;
  hero.action = action;
  const monster = quest.monster;
  monster.action = chooseMonsterAction(monster, game.rng, false, powerOf(hero));
  if (fleesBeforeFighting(monster)) {
    quest.ending = "mobFled";
    quest.log.push(`${monster.name} breaks and runs.`);
    finishQuest(game, character, quest, "mobFled");
    return game;
  }

  const round = battleRound(hero, monster, game.rng);
  for (const outcome of round.outcomes) {
    quest.log.push(describe(outcome, outcome.attacker === hero.name ? monster.name : hero.name));
  }

  character.wounds = hero.wounds;
  character.disease = hero.disease;
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
        `You defeat ${quest.monster.name}, gaining ${String(quest.monster.experience)} experience.`,
      );
      const loot = rollLoot(quest.definition.entity, game.content, game.rng);
      if (loot.marks > 0) {
        character.marks += loot.marks;
        quest.log.push(`You take ${String(loot.marks)} Marks from the body.`);
      }
      for (const item of loot.items) {
        addToPack(character, item);
        quest.log.push(`You find: ${item.name}.`);
      }
      // A big win can carry a surplus into the next level, and then into the one after it.
      let levelled = tryToLevel(character.level, character.exp);
      while (levelled.levelled) {
        character.level = levelled.level;
        character.exp = levelled.exp;
        character.guts += levelled.statGain;
        character.wits += levelled.statGain;
        character.charm += levelled.statGain;
        character.fame += levelled.fameGain;
        quest.log.push(`You reach level ${String(character.level)}.`);
        levelled = tryToLevel(character.level, character.exp);
      }
      break;
    }
    case "heroDied":
      quest.log.push(`${quest.monster.name} strikes you down.`);
      game.place = { kind: "fallen" };
      break;
    case "heroControlled":
      quest.log.push(`${quest.monster.name} catches your eye, and you wander away.`);
      break;
    case "heroSwindled":
      quest.log.push(`${quest.monster.name} talks you out of the whole errand.`);
      break;
    case "mobControlled":
      quest.log.push(`${quest.monster.name} is mesmerised and wanders off.`);
      break;
    case "mobSwindled":
      quest.log.push(`You talk ${quest.monster.name} out of everything it was carrying.`);
      break;
    case "mobFled":
      quest.log.push(`${quest.monster.name} is gone.`);
      break;
    case "roundCap":
      quest.log.push("Neither of you can land a decisive blow.");
      break;
  }
  // Blinding, panic and readied dust belong to the encounter. Wounds and disease do not.
  endOfFight(quest.hero);
  character.wounds = quest.hero.wounds;
  character.disease = quest.hero.disease;
}

/**
 * Getting up again.
 *
 * Losing costs you nothing but the fight you lost. There is no corpse run, no lost gear, no lost
 * money and no lost level — see the note at the top of this file about what this game is no longer.
 */
export function recover(game: Game): Game {
  const character = game.character;
  if (character !== null) {
    character.wounds = 0;
    character.disease = 0;
  }
  game.quest = null;
  game.place = { kind: "town" };
  game.notices = ["Someone finds you in the long grass and walks you home."];
  return game;
}
