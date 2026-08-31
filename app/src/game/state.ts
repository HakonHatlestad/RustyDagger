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
  isAction,
  endingOf,
  fleesBeforeFighting,
  noPending,
  oneSidedRound,
  type ActOutcome,
  type Ending,
  type Fighter,
} from "../rules/battle.js";
import { WEAR_SLOT_SET, calcCombat, type Equipment } from "../rules/combat.js";
import { raiseFor, tryToLevel } from "../rules/levelling.js";
import type { GameRandom } from "../rules/random.js";
import { armsOf, type Content, type MonsterDefinition } from "./content.js";
import {
  Stance,
  advanceStance,
  balance,
  chooseMonsterAction,
  hypnosisExperience,
  killExperience,
  powerOf,
  swindleExperience,
  type Monster,
} from "./monster.js";
import { GROWTH, grows } from "../rules/growth.js";
import { rollLoot } from "./loot.js";
import { buyPrice, sellPrice, shopByKey, type ShopDefinition } from "./shop.js";
import { effectOf, endOfFight, isBulkSellable, isUsableHere, useItem } from "./items.js";
import { isScroll, readScroll } from "./scrolls.js";
import { backgroundByKey, newHeroText } from "./creation.js";
import {
  FORGE_SERVICES,
  forgeCost,
  forged as forgedItem,
  refusal as forgeRefusal,
  timesDone,
  type ForgeService,
} from "./forge.js";
import { TRAINABLE, hardenCost, refusal as hardenRefusal, type TrainableKey } from "./training.js";

import {
  JOINING_FEE,
  TRACKS,
  canJoin,
  canTrain,
  rankCost,
  refusal,
  type Ranks,
  type TrackKey,
} from "./guild.js";
import {
  heroExp,
  heroFame,
  heroLevel,
  heroMarks,
  parseHero,
  type Carried,
  type CarriedArms,
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
  | { readonly kind: "guild" }
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
  /** Guild ranks, which feed straight into Attack, Defence and Skill. */
  ranks: Ranks;
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
    // Named in lower case in the save, as `Constants.FIGHT` and its siblings are.
    ranks: {
      fight: hero.rank.get("fight") ?? 0,
      magic: hero.rank.get("magic") ?? 0,
      thief: hero.rank.get("thief") ?? 0,
    },
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
  rank.set("fight", character.ranks.fight);
  rank.set("magic", character.ranks.magic);
  rank.set("thief", character.ranks.thief);

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
      enchant: c.enchant,
      forged: c.forged,
      tempered: c.tempered,
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
    fightRank: character.ranks.fight,
    magicRank: character.ranks.magic,
    thiefRank: character.ranks.thief,
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
    roundsFought: 0,
    wise: false,
    winded: false,
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
  | { readonly kind: "joinGuild" }
  | { readonly kind: "train"; readonly track: TrackKey }
  | { readonly kind: "forge"; readonly service: ForgeService }
  | { readonly kind: "harden"; readonly stat: TrainableKey }
  | { readonly kind: "readScroll"; readonly scrollIndex: number; readonly target: number }
  | { readonly kind: "equip"; readonly index: number }
  | { readonly kind: "unequip"; readonly index: number }
  | { readonly kind: "buy"; readonly shop: string; readonly name: string }
  | { readonly kind: "sell"; readonly shop: string; readonly index: number }
  | { readonly kind: "sellAll"; readonly shop: string; readonly what: "arms" | "valuables" };

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

    case "joinGuild":
      return joinGuild(game);

    case "train":
      return train(game, move.track);

    case "forge":
      return forge(game, move.service);

    case "harden":
      return harden(game, move.stat);

    case "readScroll":
      return applyScroll(game, move.scrollIndex, move.target);

    case "equip":
      return wear(game, move.index);

    case "unequip":
      return takeOff(game, move.index);

    case "buy":
      return buy(game, shopByKey(move.shop), move.name);

    case "sell":
      return sell(game, shopByKey(move.shop), move.index);

    case "sellAll":
      return sellAll(game, shopByKey(move.shop), move.what);
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

/** Paying to join. The trait is what the guild checks, and what the save carries. */
function joinGuild(game: Game): Game {
  const character = game.character;
  if (character === null || !canJoin(character.traits.has("Guild"), character.marks)) {
    return game;
  }
  character.marks -= JOINING_FEE;
  character.traits.add("Guild");
  game.notices = ["You are signed into the book, and nobody looks up."];
  return game;
}

/**
 * Buying a rank.
 *
 * A rank is permanent and immediately real: `asFighter` reads the ranks straight into Attack,
 * Defence and Skill, so the number on the character screen moves the moment you pay.
 */
/**
 * Buying a permanent point of Guts, Wits or Charm.
 *
 * The one sink that reaches the far regions: measured, Attack and Defence are rounding error
 * against creatures with 500 Guts and 600 Skill, and these three are not. See `game/training.ts`.
 */
function harden(game: Game, stat: TrainableKey): Game {
  const character = game.character;
  if (character === null) {
    return game;
  }
  const current = character[stat];
  const why = hardenRefusal(current, character.marks);
  if (why !== null) {
    game.notices = [why];
    return game;
  }
  const cost = hardenCost(current);
  character.marks -= cost;
  character[stat] += 1;
  const name = TRAINABLE.find((t) => t.key === stat)?.name ?? stat;
  game.notices = [
    `${String(cost)} Marks, and a great deal of it hurts. ${name} ${String(character[stat])}.`,
  ];
  return game;
}

/**
 * The worn piece a smith would work on: the one already carrying the most of what they add.
 *
 * Chosen by contribution rather than by slot, so "Reforge" always means the weapon actually doing
 * the hitting, and there is no way to forge a knife cheaply and then wield a sword.
 */
export function bestWornArms(character: Character, service: ForgeService): CarriedArms | null {
  const arms = character.gear.filter((c): c is CarriedArms => c.kind === "arms");
  if (arms.length === 0) {
    return null;
  }
  const score = (item: CarriedArms): number =>
    service === "forged" ? item.attack + item.forged : item.defend + item.tempered;
  return arms.reduce((best, item) => (score(item) > score(best) ? item : best));
}

/**
 * Paying a smith to put another permanent point into what you are wearing.
 *
 * Works on the *worn* item rather than one picked out of the pack, so it is unambiguous which
 * thing is being improved and the price cannot be dodged by forging a knife and wielding a sword.
 */
function forge(game: Game, service: ForgeService): Game {
  const character = game.character;
  if (character === null) {
    return game;
  }
  const worn = bestWornArms(character, service);
  const why = forgeRefusal(worn, service, character.marks);
  if (why !== null) {
    game.notices = [why];
    return game;
  }
  const item = worn!;
  const cost = forgeCost(timesDone(item, service));
  character.marks -= cost;
  const index = character.gear.indexOf(item);
  character.gear[index] = forgedItem(item, service);
  game.notices = [
    `${String(cost)} Marks. The ${item.name} comes back a little better — ` +
      `${FORGE_SERVICES[service].gives} ${String(timesDone(item, service) + 1)} above what it was.`,
  ];
  return game;
}

function train(game: Game, track: TrackKey): Game {
  const character = game.character;
  if (character === null) {
    return game;
  }
  const member = character.traits.has("Guild");
  if (!canTrain(character.ranks, character.level, member, character.marks)) {
    const why = refusal(character.ranks, character.level, member, character.marks);
    game.notices = [why ?? "Not today."];
    return game;
  }
  const cost = rankCost(character.ranks);
  character.marks -= cost;
  character.ranks[track] += 1;
  const name = TRACKS.find((t) => t.key === track)?.name ?? track;
  game.notices = [
    cost === 0
      ? `They take you on as a novice of ${name}, and waive the fee.`
      : `${String(cost)} Marks, and a rank of ${name}.`,
  ];
  return game;
}

/**
 * Reading a scroll at something you are wearing.
 *
 * The target is an index into `gear` on purpose: you improve what you are actually using, which
 * keeps the choice concrete and means the stat change is visible the moment it happens.
 */
function applyScroll(game: Game, scrollIndex: number, target: number): Game {
  const character = game.character;
  if (character === null) {
    return game;
  }
  const scroll = character.pack[scrollIndex];
  const item = character.gear[target];
  if (scroll === undefined || item === undefined || item.kind !== "arms") {
    return game;
  }
  const effect = effectOf(game.content, scroll.name);
  if (!isScroll(game.content, scroll.name)) {
    return game;
  }

  const result = readScroll(effect, item, character.wits, character.ranks.magic, game.rng);
  if (!result.used) {
    game.notices = [result.message];
    return game;
  }
  spendOne(character, scrollIndex);
  if (result.item === null) {
    character.gear.splice(target, 1);
    character.wounds += result.wounds;
  } else {
    character.gear[target] = result.item;
  }
  game.notices = [result.message];
  // An enchantment can go badly enough to kill you outright.
  if (character.wounds >= character.guts) {
    game.place = { kind: "fallen" };
  }
  return game;
}

/**
 * Putting something on, which is not the same as adding it to a list.
 *
 * Every piece of equipment claims one or more of five slots — head, body, feet, right hand, left
 * hand — and wearing it **displaces whatever already occupies each of them**, back into the pack.
 * A two-handed weapon claims both hands, so a pike costs you the shield as well as the sword.
 * Something claiming no slot at all cannot be worn.
 *
 * The port had none of this and simply appended: you could wear five right-hand weapons at once,
 * two-handed pike included, for 55 Attack where one weapon gives 14. Worse, the inventory has been
 * telling you all along which item a swap "would replace" — `describe.ts` computes exactly that —
 * so the interface promised a rule the game did not have.
 *
 * From `arStatus.wearGear`.
 */
function wear(game: Game, index: number): Game {
  const character = game.character;
  if (character === null) {
    return game;
  }
  const item = character.pack[index];
  if (item === undefined || item.kind !== "arms") {
    return game;
  }
  const slots = item.traits.map((t) => t.toLowerCase()).filter((t) => WEAR_SLOT_SET.has(t));
  if (slots.length === 0) {
    game.notices = [`The ${item.name} is not something you can wear.`];
    return game;
  }

  const displaced = character.gear.filter(
    (worn): worn is Extract<Carried, { kind: "arms" }> =>
      worn.kind === "arms" && worn.traits.some((t) => slots.includes(t.toLowerCase())),
  );
  // A cursed item cannot be taken off, and blocks the whole swap rather than half of it.
  const stuck = displaced.find((worn) => worn.traits.some((t) => t.toLowerCase() === "cursed"));
  if (stuck !== undefined) {
    game.notices = [`You cannot remove the ${stuck.name}. The thing is cursed.`];
    return game;
  }

  character.pack.splice(index, 1);
  for (const worn of displaced) {
    character.gear.splice(character.gear.indexOf(worn), 1);
    character.pack.push(worn);
  }
  character.gear.push(item);
  game.notices =
    displaced.length === 0
      ? [`You put on the ${item.name}.`]
      : [
          `You put on the ${item.name}, and take off the ${displaced.map((d) => d.name).join(" and ")}.`,
        ];
  return game;
}

/** Taking something off is unconditional, unless it is cursed on. */
function takeOff(game: Game, index: number): Game {
  const character = game.character;
  if (character === null) {
    return game;
  }
  const item = character.gear[index];
  if (item === undefined || item.kind !== "arms") {
    return game;
  }
  if (item.traits.some((t) => t.toLowerCase() === "cursed")) {
    game.notices = [`You cannot remove the ${item.name}. The thing is cursed.`];
    return game;
  }
  character.gear.splice(index, 1);
  character.pack.push(item);
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
    character.pack.push(armsOf(weapon));
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
    finishQuest(game, character, quest, "mobFled", "");
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
    // Reaching for something is not a way of winning, so it teaches nothing.
    finishQuest(game, character, quest, ending, "");
    return game;
  }
  advanceStance(quest.monster);
  return game;
}

/**
 * Clearing out the pack in one go.
 *
 * Measured over 300 quests in the Fields, a character comes home with sixty-four rows, fifty-five
 * of them weapons and most of those the same Rusty Dagger. Selling that one row at a time is
 * fifty-five clicks at a shop counter, which is not a decision, it is a chore.
 *
 * Nothing you are wearing can be caught by this — worn gear is not in the pack — and nothing
 * useful is either: it takes weapons, or it takes junk, trophies and gems, and never a potion, a
 * scroll or a map. See `isBulkSellable`, which is a whitelist for exactly that reason.
 */
function sellAll(game: Game, shop: ShopDefinition, what: "arms" | "valuables"): Game {
  const character = game.character;
  if (character === null) {
    return game;
  }
  const merchant = character.traits.has("Merchant");
  let earned = 0;
  let sold = 0;
  const keeping: Carried[] = [];
  for (const item of character.pack) {
    const wanted = what === "arms" ? item.kind === "arms" : item.kind !== "arms";
    if (!wanted || !isBulkSellable(game.content, item)) {
      keeping.push(item);
      continue;
    }
    const each = sellPrice(game.content, shop, item, character.charm, merchant);
    const many = item.kind === "count" ? item.count : 1;
    if (each <= 0) {
      // Worth nothing to this shop: leave it rather than quietly binning it.
      keeping.push(item);
      continue;
    }
    earned += each * many;
    sold += many;
    character.marks += each * many;
  }
  character.pack = keeping;
  game.notices = [
    sold === 0
      ? "Nothing here is worth anything to them."
      : `You sell ${String(sold)} for ${String(earned)} Marks.`,
  ];
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
    finishQuest(game, character, quest, "mobFled", action);
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
    finishQuest(game, character, quest, ending, action);
    return game;
  }
  advanceStance(monster);
  return game;
}

/**
 * Everything a monster was carrying, handed over without a fight.
 *
 * `arQuest.heroControls` merges the monster's pack into yours, which is the same pack
 * `heroWins` merges — so talking something down is worth exactly what killing it is worth, in
 * goods. What differs is everything else: it costs you no health, it pays less experience, and it
 * grows the stat that did the talking rather than your Guts.
 */
function takeEverything(game: Game, character: Character, quest: QuestState): string[] {
  const lines: string[] = [];
  const loot = rollLoot(quest.definition.entity, game.content, game.rng);
  if (loot.marks > 0) {
    character.marks += loot.marks;
    lines.push(`It hands over ${String(loot.marks)} Marks.`);
  }
  for (const item of loot.items) {
    addToPack(character, item);
    lines.push(`You are given: ${item.name}.`);
  }
  return lines;
}

/** Experience in, levels out, carrying any surplus into the level after. */
function award(character: Character, quest: QuestState, exp: number): void {
  character.exp += exp;
  character.fame += quest.monster.fame;
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
}

/**
 * A win teaches you the thing that won it.
 *
 * The weight carries the region's depth, so the same victory teaches more the further out you got
 * it. See `rules/growth.ts` for why the chance falls away as a stat rises.
 */
function teach(game: Game, character: Character, quest: QuestState, action: string): void {
  const weight = quest.weight;
  const learn = (stat: "guts" | "wits" | "charm", strength: number, said: string): void => {
    if (grows(character[stat], weight * strength, game.rng)) {
      character[stat] += 1;
      quest.log.push(said);
    }
  };

  if (isAction(action, Action.BERZERK)) {
    learn("guts", GROWTH.BERZERK_GUTS, "Something in you hardens. +1 Guts.");
  } else if (isAction(action, Action.BACKSTAB)) {
    learn("charm", GROWTH.BACKSTAB_CHARM, "You are getting good at this. +1 Charm.");
    learn("guts", GROWTH.BACKSTAB_GUTS, "Something in you hardens. +1 Guts.");
  } else {
    learn("guts", GROWTH.ATTACK_GUTS, "Something in you hardens. +1 Guts.");
  }
}

function finishQuest(
  game: Game,
  character: Character,
  quest: QuestState,
  ending: Ending,
  action: string,
): void {
  const mob = quest.monster;
  switch (ending) {
    case "heroWon": {
      const exp = killExperience(mob, quest.weight);
      quest.log.push(`You defeat ${mob.name}, gaining ${String(exp)} experience.`);
      const loot = rollLoot(quest.definition.entity, game.content, game.rng);
      if (loot.marks > 0) {
        character.marks += loot.marks;
        quest.log.push(`You take ${String(loot.marks)} Marks from the body.`);
      }
      for (const item of loot.items) {
        addToPack(character, item);
        quest.log.push(`You find: ${item.name}.`);
      }
      award(character, quest, exp);
      teach(game, character, quest, action);
      break;
    }

    case "wonByHypnosis": {
      const exp = hypnosisExperience(mob);
      quest.log.push(`${mob.name} meets your eye and forgets what it was doing.`);
      quest.log.push(...takeEverything(game, character, quest));
      award(character, quest, exp);
      if (grows(character.wits, quest.weight * GROWTH.HYPNOSIS_WITS, game.rng)) {
        character.wits += 1;
        quest.log.push("You are sharper for it. +1 Wits.");
      }
      break;
    }

    case "wonBySwindle": {
      const exp = swindleExperience(mob);
      quest.log.push(`You lay out a deal ${mob.name} cannot follow, and it thanks you for it.`);
      quest.log.push(...takeEverything(game, character, quest));
      award(character, quest, exp);
      if (grows(character.charm, quest.weight * GROWTH.SWINDLE_CHARM, game.rng)) {
        character.charm += 1;
        quest.log.push("You are getting good at this. +1 Charm.");
      }
      break;
    }

    case "heroDied":
      quest.log.push(`${mob.name} strikes you down.`);
      game.place = { kind: "fallen" };
      break;

    case "lostToHypnosis":
      // An aggressive creature does not simply let you wander off.
      if (mob.stance >= Stance.AGGRESSIVE) {
        quest.log.push(
          `${mob.name} catches your eye and, out of sheer malice, walks you off a cliff.`,
        );
        quest.hero.state = FighterState.DEAD;
        game.place = { kind: "fallen" };
      } else {
        quest.log.push(`${mob.name} catches your eye, and you wander away with nothing.`);
      }
      break;

    case "lostToSwindle": {
      // Thief Insurance exists for exactly this and nothing else, which is why it survived the cull
      // of the multiplayer-only items: it is the one thing that stops the sales pitch working.
      const insured = character.pack.findIndex((c) => c.name === "Thief Insurance");
      if (insured >= 0) {
        spendOne(character, insured);
        quest.log.push(
          `${mob.name} starts an irresistible sales pitch, spots your Thief Insurance, and gives up.`,
        );
        break;
      }
      // The original empties your whole pack for this. A half-share of the purse is the same idea
      // scaled to a game that no longer punishes you for losing -- see docs/porting-notes.md.
      const taken = Math.trunc(character.marks / 2);
      character.marks -= taken;
      quest.log.push(
        taken > 0
          ? `${mob.name} makes an irresistible sales pitch. It costs you ${String(taken)} Marks.`
          : `${mob.name} tries to sell you something, finds your purse empty, and wanders off.`,
      );
      break;
    }

    case "mobFled":
      quest.log.push(`${mob.name} is gone.`);
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

/** A tenth of your purse, which is what losing costs. */
export const LOSS_SHARE = 10;

/**
 * The most anyone can take off you while you are unconscious.
 *
 * Without a ceiling the penalty scales with your wealth, and wealth outgrows what any region pays.
 * Measured on a level-17 veteran who sells what he finds: uncapped, the Goblin Mound netted 10.7
 * Marks a fight against the starting region's 36, despite a 79% win rate there. The rational play
 * was to farm the safest region in the game forever, which is the opposite of what ten regions are
 * for.
 *
 * At 750 the same veteran nets 255 in the Mound, 332 in the Forest and 61 in the Hills, where the
 * death rate is 47% — so depth pays, and recklessness still does not. A tenth of a small purse is
 * untouched by the cap, so an early death stings exactly as it always did.
 */
export const LOSS_CAP = 750;

export function lossOnFalling(marks: number): number {
  return Math.min(Math.trunc(marks / LOSS_SHARE), LOSS_CAP);
}

/**
 * Getting up again.
 *
 * Losing costs a **tenth of your Marks** and nothing else: no lost gear, no lost level, no lost
 * loot, no corpse run. That is deliberately proportional rather than flat. A flat fee is either
 * nothing to a rich hero or ruinous to a new one, whereas a tenth is always the same *decision* —
 * enough to make retreating worth considering, never enough to undo an afternoon.
 *
 * The original took far more than this. See `docs/porting-notes.md` for what else it took.
 */
export function recover(game: Game): Game {
  const character = game.character;
  if (character === null) {
    game.place = { kind: "town" };
    return game;
  }
  const lost = lossOnFalling(character.marks);
  character.marks -= lost;
  character.wounds = 0;
  character.disease = 0;
  game.quest = null;
  game.place = { kind: "town" };
  game.notices = [
    lost > 0
      ? `Someone walks you home, and helps themselves to ${String(lost)} Marks on the way.`
      : "Someone finds you in the long grass and walks you home. You had nothing worth taking.",
  ];
  return game;
}
