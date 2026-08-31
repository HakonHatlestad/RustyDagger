/**
 * Drawing the game.
 *
 * Plain DOM, no framework. The state is small, every move re-renders, and a dependency that
 * re-renders it for us would be more to keep working than to write. Everything here reads state and
 * emits moves; no rule lives in this file.
 *
 * Text is built with `textContent`, never by assembling HTML from strings — item and monster names
 * come from game content and from save files, and neither should ever be able to inject markup.
 */

import { Action, isAction, wildCharge } from "../rules/battle.js";
import {
  bestWornArms,
  apply,
  asFighter,
  expFraction,
  healthFraction,
  healthLeft,
  recover,
  type Character,
  type Game,
  type Move,
  type Place,
} from "../game/state.js";
import { raiseFor } from "../rules/levelling.js";
import { FORGE_SERVICES, forgeCost, timesDone, type ForgeService } from "../game/forge.js";
import { TRAINABLE, atCeiling, hardenCost } from "../game/training.js";
import { SHOPS, sellPrice, shopByKey, stockOf } from "../game/shop.js";
import { REGIONS, assess, canEnter, pickEncounter, tableFor } from "../game/world.js";
import { powerOf, typicalPower } from "../game/monster.js";
import { BACKGROUNDS } from "../game/creation.js";
import { describeUse, effectOf, isBulkSellable, isUsable, isUsableHere } from "../game/items.js";
import { describeScroll, isScroll } from "../game/scrolls.js";
import {
  JOINING_FEE,
  TRACKS,
  canJoin,
  canTrain,
  rankCost,
  refusal,
  totalRank,
} from "../game/guild.js";
import type { Carried } from "../game/hero.js";
import { compareToWorn, deltaClass, deltaLabel, describeItem, type ItemView } from "./describe.js";

type Dispatch = (move: Move) => void;

/** What the player has selected in a list, so a description can be shown beside it. */
export interface UiState {
  selected: { readonly list: "pack" | "gear"; readonly index: number } | null;
  /** The name being typed on the creation screen, kept across re-renders. */
  newName: string;
  /** The background chosen on the creation screen. */
  newBackground: string;
}

export function initialUi(): UiState {
  return { selected: null, newName: "", newBackground: BACKGROUNDS[0]!.key };
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The one document-level key listener, swapped on every render.
 *
 * A fight is hundreds of repetitions of the same click, which makes it the one screen where a
 * keyboard genuinely matters. Held here rather than on an element because a player expects to press
 * A and swing, not to click something first and then press A.
 */
let boundKeys: ((event: KeyboardEvent) => void) | null = null;

function bindKeys(handler: ((key: string) => boolean) | null): void {
  if (boundKeys !== null) {
    document.removeEventListener("keydown", boundKeys);
    boundKeys = null;
  }
  if (handler === null) {
    return;
  }
  boundKeys = (event: KeyboardEvent): void => {
    // Never steal a keystroke from someone typing a name, or from a browser shortcut.
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.target instanceof HTMLInputElement
    ) {
      return;
    }
    if (handler(event.key.toLowerCase())) {
      event.preventDefault();
    }
  };
  document.addEventListener("keydown", boundKeys);
}

function button(
  label: string,
  onClick: () => void,
  opts: { primary?: boolean; disabled?: boolean; hint?: string } = {},
): HTMLButtonElement {
  const node = el("button", opts.primary === true ? "primary" : undefined, label);
  node.disabled = opts.disabled ?? false;
  if (opts.hint !== undefined) {
    node.title = opts.hint;
  }
  node.addEventListener("click", onClick);
  return node;
}

/** Only equipment can be compared or described in stat terms. */
function toItemView(item: Carried): ItemView | null {
  return item.kind === "arms"
    ? {
        name: item.name,
        attack: item.attack,
        defend: item.defend,
        skill: item.skill,
        enchant: item.enchant,
        forged: item.forged,
        tempered: item.tempered,
        traits: item.traits,
      }
    : null;
}

function wornViews(character: Character): ItemView[] {
  return character.gear.map(toItemView).filter((v): v is ItemView => v !== null);
}

/* ---------------------------------------------------------------- bars ---- */

/**
 * A labelled bar.
 *
 * The experience bar is the clearest single example of what the rewrite bought: the original had a
 * fixed 400x300 canvas with every widget at a hard-coded position and simply nowhere to put one.
 */
function bar(label: string, fraction: number, value: string, kind: "health" | "exp"): HTMLElement {
  const row = el("div", "bar");
  row.append(el("span", "bar__label", label));
  const track = el("div", "bar__track");
  const fill = el("div", `bar__fill bar__fill--${kind}`);
  fill.style.width = `${String(Math.round(Math.max(0, Math.min(1, fraction)) * 100))}%`;
  track.append(fill);
  row.append(track, el("span", "bar__value", value));
  row.setAttribute("role", "progressbar");
  row.setAttribute("aria-label", label);
  row.setAttribute("aria-valuenow", String(Math.round(fraction * 100)));
  row.setAttribute("aria-valuemin", "0");
  row.setAttribute("aria-valuemax", "100");
  return row;
}

function statusPanel(character: Character): HTMLElement {
  const panel = el("section", "panel status");
  const fighter = asFighter(character);

  const left = el("div");
  left.append(el("div", "status__name", `${character.name}, level ${String(character.level)}`));
  const stats = el("div", "status__stats");
  // Six numbers with no explanation anywhere, three of them derived from the other three. The
  // original never says what any of them do; hovering one here does.
  const pairs: [string, string, string][] = [
    ["Guts", String(character.guts), "Your health, and how hard you hit. Grown by fighting."],
    ["Wits", String(character.wits), "Two thirds of your Skill. Grown by hypnotising things."],
    ["Charm", String(character.charm), "One third of your Skill, and what you sell things for."],
    ["Attack", String(fighter.attack), "Damage. Comes almost entirely from what you are holding."],
    ["Defence", String(fighter.defend), "Damage taken. Comes from armour and thieving ranks."],
    ["Skill", String(fighter.skill), "Whether a blow lands at all. Mostly Wits and Charm."],
    ["Marks", String(character.marks), "Money."],
    ["Fame", String(character.fame), "How well known you are. Currently a record, not a lever."],
  ];
  for (const [label, value, meaning] of pairs) {
    const stat = el("span", "stat");
    stat.title = meaning;
    stat.append(el("span", "stat__label", label), el("span", "stat__value", value));
    stats.append(stat);
  }
  const ranks = totalRank(character.ranks);
  if (ranks > 0) {
    const parts = TRACKS.filter((t) => character.ranks[t.key] > 0).map(
      (t) => `${t.name} ${String(character.ranks[t.key])}`,
    );
    left.append(el("div", "ranks", `Guild: ${parts.join(", ")}`));
  }
  left.append(stats);
  if (character.disease > 0) {
    left.append(
      el("div", "ailment", `Diseased: ${String(character.disease)} off your Skill until cured.`),
    );
  }

  const bars = el("div", "bars");
  bars.append(
    bar(
      "Health",
      healthFraction(character),
      `${String(healthLeft(character))} / ${String(character.guts)}`,
      "health",
    ),
    bar(
      // Not "Level": it sits directly under "Aldis, level 1" and the two numbers mean different
      // things, so sharing a word makes the bar read as the level rather than the road to it.
      "Next level",
      expFraction(character),
      `${String(character.exp)} / ${String(raiseFor(character.level))}`,
      "exp",
    ),
  );

  panel.append(left, bars);
  return panel;
}

/* --------------------------------------------------------------- lists ---- */

function itemRow(
  item: Carried,
  worn: readonly ItemView[],
  selected: boolean,
  onSelect: () => void,
  onActivate: () => void,
): HTMLLIElement {
  const row = el("li");
  row.tabIndex = 0;
  row.setAttribute("role", "option");
  row.setAttribute("aria-selected", String(selected));
  if (selected) {
    row.classList.add("is-selected");
  }
  row.append(el("span", "item__name", item.name));

  const meta = el("span", "item__meta");
  const view = toItemView(item);
  if (view === null) {
    meta.textContent = item.kind === "count" ? `x${String(item.count)}` : "";
  } else {
    meta.textContent = `${String(view.attack)}/${String(view.defend)}/${String(view.skill)}`;
    const comparison = compareToWorn(view, worn);
    const label = deltaLabel(comparison);
    if (label !== "") {
      meta.append(el("span", deltaClass(comparison), ` ${label}`));
    }
  }
  row.append(meta);

  row.addEventListener("click", onSelect);
  row.addEventListener("dblclick", onActivate);
  row.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate();
    }
  });
  return row;
}

function itemList(
  title: string,
  items: readonly Carried[],
  listName: "pack" | "gear",
  game: Game,
  ui: UiState,
  character: Character,
  dispatch: Dispatch,
  rerender: () => void,
  emptyText: string,
): HTMLElement {
  const section = el("section");
  section.append(el("h2", undefined, title));
  if (items.length === 0) {
    section.append(el("div", "empty", emptyText));
    return section;
  }
  const list = el("ul", "itemlist");
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", title);
  const worn = wornViews(character);
  items.forEach((item, index) => {
    const selected = ui.selected?.list === listName && ui.selected.index === index;
    list.append(
      itemRow(
        item,
        worn,
        selected,
        () => {
          ui.selected = { list: listName, index };
          rerender();
        },
        () => {
          // What activating a row means depends on the row: gear is worn, supplies are used.
          if (listName === "pack" && isUsable(game.content, item)) {
            dispatch({ kind: "useItem", index });
          } else {
            dispatch({ kind: listName === "pack" ? "equip" : "unequip", index });
            ui.selected = null;
          }
          rerender();
        },
      ),
    );
  });
  section.append(list);
  return section;
}

function detailPanel(game: Game, ui: UiState, character: Character): HTMLElement {
  const panel = el("div", "detail");
  const nothing = "Choose an item to see what it does.";
  const selection = ui.selected;
  if (selection === null) {
    panel.append(el("div", "detail__line", nothing));
    return panel;
  }
  const item = character[selection.list][selection.index];
  if (item === undefined) {
    panel.append(el("div", "detail__line", nothing));
    return panel;
  }
  panel.append(el("div", "detail__title", item.name));
  const view = toItemView(item);
  if (view === null) {
    if (item.kind === "count") {
      panel.append(el("div", "detail__line", `You are carrying ${String(item.count)}.`));
      const effect = effectOf(game.content, item.name);
      panel.append(
        el(
          "div",
          "detail__line",
          isScroll(game.content, item.name)
            ? `${describeScroll(effect)} Choose something you are wearing, then read it at that.`
            : describeUse(effect, character.traits.has("Medic")),
        ),
        el(
          "div",
          "detail__line",
          isUsable(game.content, item)
            ? "Double-click or press Enter to use it."
            : "Worth selling, if nothing else.",
        ),
      );
    } else {
      panel.append(el("div", "detail__line", "Not equipment."));
    }
    return panel;
  }
  const worn = selection.list === "gear" ? [] : wornViews(character);
  for (const line of describeItem(view, worn)) {
    panel.append(el("div", "detail__line", line));
  }
  panel.append(
    el(
      "div",
      "detail__line",
      selection.list === "pack" ? "Double-click or press Enter to equip." : "Enter to take it off.",
    ),
  );
  if (item.kind === "arms" && item.enchant > 0) {
    panel.append(el("div", "detail__line", `Enchanted to ${String(item.enchant)}.`));
  }
  return panel;
}

/**
 * Reading a scroll at what you are wearing.
 *
 * Deliberately one click from the item, rather than a workbench screen of its own: you pick the
 * thing, and the scrolls that would do something to it are right there. Only worn equipment can be
 * improved, which keeps the choice about the sword you actually swing.
 */
function scrollRow(
  game: Game,
  ui: UiState,
  character: Character,
  dispatch: Dispatch,
  rerender: () => void,
): HTMLElement | null {
  const selection = ui.selected;
  if (selection === null || selection.list !== "gear") {
    return null;
  }
  const target = character.gear[selection.index];
  if (target === undefined || target.kind !== "arms") {
    return null;
  }
  const scrolls = character.pack
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isScroll(game.content, item.name));
  if (scrolls.length === 0) {
    return null;
  }
  const row = el("div", "actions actions--items");
  row.append(el("span", "actions__label", `Read at the ${target.name}:`));
  for (const { item, index } of scrolls) {
    const count = item.kind === "count" && item.count > 1 ? ` x${String(item.count)}` : "";
    row.append(
      button(
        `${item.name}${count}`,
        () => {
          dispatch({ kind: "readScroll", scrollIndex: index, target: selection.index });
          rerender();
        },
        { hint: describeScroll(effectOf(game.content, item.name)) },
      ),
    );
  }
  return row;
}

/* ------------------------------------------------------------ fragments ---- */

function notices(game: Game): HTMLElement | null {
  if (game.notices.length === 0) {
    return null;
  }
  const box = el("div", "notices");
  for (const notice of game.notices) {
    box.append(el("p", "notice", notice));
  }
  return box;
}

function backTo(
  place: Place,
  dispatch: Dispatch,
  rerender: () => void,
  label = "Back",
): HTMLElement {
  const actions = el("div", "actions");
  actions.append(
    button(
      label,
      () => {
        dispatch({ kind: "goTo", place });
        rerender();
      },
      { primary: true },
    ),
  );
  return actions;
}

/* ------------------------------------------------------------- screens ---- */

function creationScreen(ui: UiState, dispatch: Dispatch, rerender: () => void): HTMLElement {
  const panel = el("section", "panel");
  panel.append(el("h1", undefined, "Dragon Court"));
  panel.append(
    el(
      "p",
      undefined,
      "You have walked to town with nothing and a little money. Who were you before that?",
    ),
  );

  const nameRow = el("div", "field");
  const label = el("label", undefined, "Name");
  label.htmlFor = "hero-name";
  const input = el("input");
  input.id = "hero-name";
  input.type = "text";
  input.value = ui.newName;
  input.placeholder = "Wanderer";
  input.maxLength = 24;
  input.addEventListener("input", () => {
    ui.newName = input.value;
  });
  nameRow.append(label, input);
  panel.append(nameRow);

  const choices = el("div", "choices");
  for (const background of BACKGROUNDS) {
    const card = el("button", "choice");
    card.type = "button";
    if (background.key === ui.newBackground) {
      card.classList.add("is-selected");
    }
    card.setAttribute("aria-pressed", String(background.key === ui.newBackground));
    card.append(el("span", "choice__name", background.name));
    card.append(el("span", "choice__blurb", background.blurb));
    card.append(
      el(
        "span",
        "choice__stats",
        `Guts ${String(background.guts)} · Wits ${String(background.wits)} · Charm ${String(background.charm)}`,
      ),
    );
    for (const effect of background.effects) {
      card.append(el("span", "choice__effect", effect));
    }
    card.addEventListener("click", () => {
      ui.newBackground = background.key;
      rerender();
    });
    choices.append(card);
  }
  panel.append(choices);

  const actions = el("div", "actions");
  actions.append(
    button(
      "Begin",
      () => {
        dispatch({ kind: "beginGame", name: ui.newName, background: ui.newBackground });
        ui.selected = null;
        rerender();
      },
      { primary: true },
    ),
  );
  panel.append(actions);
  return panel;
}

function townScreen(game: Game, dispatch: Dispatch, rerender: () => void): HTMLElement {
  const panel = el("section", "panel");
  panel.append(el("h1", undefined, "Town"));
  panel.append(
    el(
      "p",
      undefined,
      "Mud, shops and a temple. Everything you need is on this square, and nothing on it will kill you.",
    ),
  );
  const box = notices(game);
  if (box !== null) {
    panel.append(box);
  }

  // Attack comes entirely from what you are holding, so an unarmed hero loses almost every fight.
  // The original never says this and simply lets you walk out and die.
  const character = game.character;
  if (character !== null && !character.gear.some((c) => c.kind === "arms")) {
    panel.append(
      el(
        "p",
        "aside",
        "You are carrying no weapon. Attack comes entirely from what you hold — buy something at " +
          "Bill Smith's and equip it on the character screen before you go out.",
      ),
    );
  }

  const actions = el("div", "actions");
  const go = (place: Place, label: string, primary = false): void => {
    actions.append(
      button(
        label,
        () => {
          dispatch({ kind: "goTo", place });
          rerender();
        },
        { primary },
      ),
    );
  };
  go({ kind: "fields" }, "Go hunting", true);
  // Resting is free and unlimited, so making the player walk to the temple for it is pure friction:
  // measured over a long session it is four clicks, roughly every fourteenth quest. The temple is
  // still where it happens and still worth visiting; this is the same action, offered where the
  // player already is.
  if (character !== null && (character.wounds > 0 || character.disease > 0)) {
    actions.append(
      button(
        "Rest at the temple",
        () => {
          dispatch({ kind: "rest" });
          rerender();
        },
        { hint: "Heals every wound and clears any disease, for nothing." },
      ),
    );
  }
  for (const shop of SHOPS) {
    go({ kind: "shop", shop: shop.key }, shop.name.replace(/'s .*/, "'s"));
  }
  go({ kind: "temple" }, "Temple");
  go({ kind: "guild" }, "Guild");
  go({ kind: "status" }, "Character");
  panel.append(actions);
  return panel;
}

/**
 * Choosing where to hunt.
 *
 * Four regions rather than one, which costs nothing: every monster in them is already in the
 * exported content. They are ordered by how hard they hit and say so plainly, because the game has
 * no other way to warn you and the Hills will kill a new character in two rounds.
 */
function fieldsScreen(game: Game, dispatch: Dispatch, rerender: () => void): HTMLElement {
  const panel = el("section", "panel");
  panel.append(el("h1", undefined, "Where to?"));
  const character = game.character;

  const known = new Set(game.content.monsters.keys());
  const list = el("div", "choices");
  for (const region of REGIONS) {
    const open = character !== null && canEnter(region, character.pack);
    const card = el("button", "choice");
    card.type = "button";
    card.disabled = !open;
    if (!open) {
      card.classList.add("is-locked");
    }
    card.append(el("span", "choice__name", region.name));
    card.append(el("span", "choice__blurb", region.blurb));
    if (!open && region.key_item !== null) {
      // Named, not hinted at. A locked door you cannot identify is just a disabled button.
      card.append(el("span", "choice__locked", `Needs: ${region.key_item}`));
    }
    if (character !== null) {
      // Worked out against what actually lives there, not against a number written down once.
      const theirs = typicalPower(
        tableFor(region, character.level),
        region.prefix,
        game.content,
        character.level,
      );
      const verdict = assess(powerOf(asFighter(character)), theirs);
      card.append(
        el("span", `choice__verdict choice__verdict--${verdict.verdict}`, verdict.advice),
      );
    }
    card.addEventListener("click", () => {
      const quarry = pickEncounter(region, character?.level ?? 1, known, game.rng);
      if (quarry === null) {
        return;
      }
      dispatch({ kind: "startQuest", monsterKey: quarry, weight: region.weight });
      rerender();
    });
    list.append(card);
  }
  panel.append(list);
  if (character !== null && REGIONS.some((r) => !canEnter(r, character.pack))) {
    panel.append(
      el("p", "aside", "The ways onward are bought and found. Sally Trader sells most of them."),
    );
  }
  panel.append(backTo({ kind: "town" }, dispatch, rerender));
  return panel;
}

/** The things you are carrying that would do something right now. */
function usableRow(
  game: Game,
  character: Character,
  inFight: boolean,
  dispatch: Dispatch,
  rerender: () => void,
): HTMLElement | null {
  const usable = character.pack
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isUsableHere(game.content, item, inFight));
  if (usable.length === 0) {
    return null;
  }
  const row = el("div", "actions actions--items");
  row.append(el("span", "actions__label", "Use:"));
  for (const { item, index } of usable) {
    const count = item.kind === "count" ? ` x${String(item.count)}` : "";
    row.append(
      button(
        `${item.name}${count}`,
        () => {
          dispatch({ kind: "useItem", index });
          rerender();
        },
        { hint: describeUse(effectOf(game.content, item.name), character.traits.has("Medic")) },
      ),
    );
  }
  return row;
}

function questScreen(game: Game, dispatch: Dispatch, rerender: () => void): HTMLElement {
  const panel = el("section", "panel");
  const quest = game.quest;
  const character = game.character;
  if (quest === null || character === null) {
    panel.append(el("p", undefined, "The road is quiet."));
    return panel;
  }

  const monster = quest.monster;
  panel.append(el("h1", undefined, monster.name));
  panel.append(
    el(
      "p",
      undefined,
      `Attack ${String(monster.attack)} · defence ${String(monster.defend)} · skill ${String(monster.skill)}` +
        (monster.blinded ? " · blinded" : ""),
    ),
  );
  panel.append(
    bar(
      "Enemy",
      monster.guts <= 0 ? 0 : 1 - monster.wounds / monster.guts,
      `${String(Math.max(0, monster.guts - monster.wounds))} / ${String(monster.guts)}`,
      "health",
    ),
  );

  const log = el("div", "log");
  for (const line of quest.log) {
    const kind = /strikes you down|kills/.test(line)
      ? "kill"
      : /You reach level|You defeat|You find|You take/.test(line)
        ? "level"
        : /misses/.test(line)
          ? ""
          : "hit";
    log.append(el("p", kind, line));
  }
  panel.append(log);

  if (quest.ending !== null) {
    // Losing never reaches here: that ending sends the player to the fallen screen instead.
    panel.append(backTo({ kind: "fields" }, dispatch, rerender, "Back to the hunt"));
    bindKeys((key) => {
      if (key !== "enter" && key !== " ") {
        return false;
      }
      dispatch({ kind: "leaveQuest" });
      rerender();
      return true;
    });
  } else {
    const actions = el("div", "actions");
    const choices: { label: string; action: string; key: string; hint: string }[] = [
      {
        label: "Attack",
        action: Action.ATTACK,
        key: "a",
        hint: "An ordinary swing, and how you get your breath back after a charge.",
      },
      {
        label: "Backstab",
        action: Action.BACKSTAB,
        key: "b",
        hint: "Double Guts and Speed and they get one blow — but only from surprise, before they are fighting you.",
      },
      {
        label: "Berzerk",
        action: Action.BERZERK,
        key: "z",
        hint: "Double Guts and Speed and four swings. They swing first, your guard is halved, and you are winded after.",
      },
      {
        label: "Hypnotise",
        action: Action.CONTROL,
        key: "h",
        hint: "Opposed Wits. Wins the fight outright, or wastes the round — and they will not fall for it twice.",
      },
      {
        label: "Swindle",
        action: Action.SWINDLE,
        key: "s",
        hint: "Opposed Charm. Takes what it carries without a fight, and only works once.",
      },
      { label: "Run away", action: Action.RUNAWAY, key: "r", hint: "Leave. You always act last." },
    ];
    const swing = (action: string): void => {
      dispatch({ kind: "fight", action });
      rerender();
    };
    // A move that can only make things worse is a trap, not a choice. Two of these become
    // strictly dominated mid-fight: a charge while winded drops none of its multipliers in but
    // still costs the guard and the initiative, and a talk-down against something already wise to
    // it cannot succeed and still spends the round. Both are closed rather than merely warned
    // about — the same reasoning that put a cost on Berzerk in the first place.
    const barred = (action: string): string | null => {
      if (wildCharge(action) && quest.hero.winded) {
        return "Still winded — this would cost your guard and the round for nothing.";
      }
      if (
        (isAction(action, Action.CONTROL) || isAction(action, Action.SWINDLE)) &&
        quest.monster.wise
      ) {
        return "They are wise to it — this cannot work now.";
      }
      return null;
    };

    for (const choice of choices) {
      const why = barred(choice.action);
      const node = button(
        choice.label,
        () => {
          swing(choice.action);
        },
        {
          primary: choice.action === Action.ATTACK,
          disabled: why !== null,
          hint: why ?? `${choice.hint} (${choice.key.toUpperCase()})`,
        },
      );
      // Drawn by CSS from the attribute rather than appended as a node, so the shortcut never
      // becomes part of the button's accessible name: it is still called "Attack", not "AttackA".
      node.dataset["key"] = choice.key.toUpperCase();
      actions.append(node);
    }
    panel.append(actions);
    bindKeys((key) => {
      const chosen = choices.find((c) => c.key === key);
      if (chosen === undefined || barred(chosen.action) !== null) {
        return false;
      }
      swing(chosen.action);
      return true;
    });

    // What the six moves cost, foldable. These used to live only in `title` tooltips, which are
    // unreachable on a touchscreen and awkward with a keyboard — and since three of them now carry
    // real rules rather than flavour, a player who cannot read them cannot play well. Closed by
    // default because six rules every round is noise once you know them; the browser remembers.
    const legend = el("details", "legend");
    legend.append(el("summary", undefined, "What these do"));
    const list = el("dl");
    for (const choice of choices) {
      list.append(el("dt", undefined, choice.label), el("dd", undefined, choice.hint));
    }
    legend.append(list);
    panel.append(legend);
    // Two rules now change what these buttons do, and both are invisible state on the fighter.
    // A disabled-looking outcome with no stated reason reads as a bug, so say them out loud —
    // the tooltips carry the standing rules, but these are about *this* round.
    const hero = quest.hero;
    const notes: string[] = [];
    if (hero.winded) {
      notes.push("Still off balance from that charge — another will not connect as one.");
    }
    if (hero.roundsFought > 0) {
      notes.push("They are fighting you now, so a backstab lands as an ordinary swing.");
    }
    if (quest.monster.wise) {
      notes.push("They have seen your patter fail once and will not fall for it again.");
    }
    if (notes.length > 0) {
      panel.append(el("p", "aside", notes.join(" ")));
    }

    const items = usableRow(game, character, true, dispatch, rerender);
    if (items !== null) {
      panel.append(items);
      panel.append(
        el("p", "aside", "Reaching for something costs you the round — it still gets to swing."),
      );
    }
  }
  // Keep the newest line in view without the player scrolling.
  queueMicrotask(() => {
    log.scrollTop = log.scrollHeight;
  });
  return panel;
}

function statusScreen(
  game: Game,
  ui: UiState,
  dispatch: Dispatch,
  rerender: () => void,
): HTMLElement {
  const panel = el("section", "panel");
  const character = game.character;
  if (character === null) {
    return panel;
  }
  panel.append(el("h1", undefined, "Character"));
  const box = notices(game);
  if (box !== null) {
    panel.append(box);
  }

  const columns = el("div", "columns");
  columns.append(
    itemList(
      "Worn",
      character.gear,
      "gear",
      game,
      ui,
      character,
      dispatch,
      rerender,
      "Nothing equipped.",
    ),
    itemList(
      "Pack",
      character.pack,
      "pack",
      game,
      ui,
      character,
      dispatch,
      rerender,
      "Your pack is empty.",
    ),
    (() => {
      const section = el("section");
      section.append(el("h2", undefined, "Description"));
      section.append(detailPanel(game, ui, character));
      const scrolls = scrollRow(game, ui, character, dispatch, rerender);
      if (scrolls !== null) {
        section.append(scrolls);
      }
      return section;
    })(),
  );
  panel.append(columns);
  panel.append(backTo({ kind: "town" }, dispatch, rerender));
  return panel;
}

function templeScreen(game: Game, dispatch: Dispatch, rerender: () => void): HTMLElement {
  const panel = el("section", "panel");
  const character = game.character;
  panel.append(el("h1", undefined, "Elden Bishop's Temple of Brotherly Sharing"));
  panel.append(
    el(
      "p",
      undefined,
      "The Bishop shares what he has, which is mostly floor space. Resting here costs nothing.",
    ),
  );
  const box = notices(game);
  if (box !== null) {
    panel.append(box);
  }

  // The Bishop's other trade. Attack and Defence are rounding error against what lives in the far
  // regions -- 500 Guts and 600 Skill apiece -- and these three are what actually get you there.
  if (character !== null) {
    const bench = el("section", "bench");
    bench.append(el("h2", undefined, "Hard training, for a donation"));
    bench.append(
      el(
        "p",
        "aside",
        "Ten Marks for every point you already have, so each one costs more than the last. " +
          "This is what a long campaign's winnings are for.",
      ),
    );
    const row = el("div", "actions");
    for (const stat of TRAINABLE) {
      const current = character[stat.key];
      const cost = hardenCost(current);
      const capped = atCeiling(stat.key, current, character.level);
      row.append(
        button(
          capped
            ? `${stat.name} ${String(current)} — as far as level ${String(character.level)} will carry`
            : `${stat.name} ${String(current)} to ${String(current + 1)} — ${String(cost)} Marks`,
          () => {
            dispatch({ kind: "harden", stat: stat.key });
            rerender();
          },
          { disabled: capped || character.marks < cost, hint: stat.what },
        ),
      );
    }
    bench.append(row);
    panel.append(bench);
  }

  const actions = el("div", "actions");
  actions.append(
    button(
      "Rest",
      () => {
        dispatch({ kind: "rest" });
        rerender();
      },
      {
        primary: true,
        disabled: character !== null && character.wounds === 0 && character.disease === 0,
        hint: "Heals every wound and clears any disease.",
      },
    ),
    button("Go hunting", () => {
      dispatch({ kind: "goTo", place: { kind: "fields" } });
      rerender();
    }),
    button("Back", () => {
      dispatch({ kind: "goTo", place: { kind: "town" } });
      rerender();
    }),
  );
  panel.append(actions);
  return panel;
}

/**
 * The guild.
 *
 * The one place in the game where you choose *what kind* of stronger you get. Levelling grants the
 * same +2 to everything however you play; a rank is bought, one at a time, in one of three
 * directions, and every one of them is immediately visible in the numbers at the top of the screen.
 */
function guildScreen(game: Game, dispatch: Dispatch, rerender: () => void): HTMLElement {
  const panel = el("section", "panel");
  const character = game.character;
  panel.append(el("h1", undefined, "The Adventurer's Guild"));
  if (character === null) {
    return panel;
  }
  const member = character.traits.has("Guild");
  panel.append(
    el(
      "p",
      undefined,
      member
        ? "A hall of people who have survived things, and will tell you how for money."
        : `A hall of people who have survived things. Membership is ${String(JOINING_FEE)} Marks, and they do not haggle.`,
    ),
  );
  const box = notices(game);
  if (box !== null) {
    panel.append(box);
  }

  if (!member) {
    const actions = el("div", "actions");
    actions.append(
      button(
        `Join — ${String(JOINING_FEE)} Marks`,
        () => {
          dispatch({ kind: "joinGuild" });
          rerender();
        },
        { primary: true, disabled: !canJoin(member, character.marks) },
      ),
    );
    panel.append(actions);
    const why = refusal(character.ranks, character.level, member, character.marks);
    if (why !== null) {
      panel.append(el("p", "aside", why));
    }
    panel.append(backTo({ kind: "town" }, dispatch, rerender));
    return panel;
  }

  const cost = rankCost(character.ranks);
  const trainable = canTrain(character.ranks, character.level, member, character.marks);
  panel.append(
    el(
      "p",
      undefined,
      `You hold ${String(totalRank(character.ranks))} ranks and are level ${String(character.level)}. ` +
        `The next rank costs ${cost === 0 ? "nothing" : `${String(cost)} Marks`}.`,
    ),
  );

  const choices = el("div", "choices");
  for (const track of TRACKS) {
    const card = el("button", "choice");
    card.type = "button";
    card.disabled = !trainable;
    card.append(
      el("span", "choice__name", `${track.name} — rank ${String(character.ranks[track.key])}`),
    );
    card.append(el("span", "choice__blurb", track.blurb));
    card.append(el("span", "choice__effect", track.effect));
    card.addEventListener("click", () => {
      dispatch({ kind: "train", track: track.key });
      rerender();
    });
    choices.append(card);
  }
  panel.append(choices);

  const why = refusal(character.ranks, character.level, member, character.marks);
  if (why !== null) {
    panel.append(el("p", "aside", why));
  }
  panel.append(backTo({ kind: "town" }, dispatch, rerender));
  return panel;
}

/**
 * Losing.
 *
 * You keep your level, your money, your loot and everything you were wearing. What losing costs is
 * the fight you lost and the walk back, which in a single-player game is enough.
 */
function fallenScreen(game: Game, rerender: () => void): HTMLElement {
  const panel = el("section", "panel");
  panel.append(el("h1", undefined, "You go down"));
  panel.append(
    el(
      "p",
      undefined,
      `${game.character?.name ?? "Your hero"} loses the fight, and the grass closes over. ` +
        "It costs you a tenth of your Marks. You keep your level, your gear and everything " +
        "you were carrying.",
    ),
  );
  const actions = el("div", "actions");
  actions.append(
    button(
      "Wake up in town",
      () => {
        recover(game);
        rerender();
      },
      { primary: true },
    ),
  );
  panel.append(actions);
  return panel;
}

/**
 * A shop.
 *
 * Both halves show the same stat comparison the inventory does, so what a weapon is worth to *you*
 * is visible whether you are buying it, selling it, or just looking at what you already own.
 */
function shopScreen(
  game: Game,
  shopKey: string,
  dispatch: Dispatch,
  rerender: () => void,
): HTMLElement {
  const panel = el("section", "panel");
  const character = game.character;
  if (character === null) {
    return panel;
  }
  const shop = shopByKey(shopKey);
  panel.append(el("h1", undefined, shop.name));
  panel.append(el("p", undefined, shop.greeting));
  const box = notices(game);
  if (box !== null) {
    panel.append(box);
  }

  const worn = wornViews(character);
  const columns = el("div", "columns");

  // The smith's other trade: a permanent point on what you are already wearing, at a price that
  // goes up by half every time. It is the only thing in the game that will take any amount of
  // money, which is what a game with no ending needs.
  const service = (Object.keys(FORGE_SERVICES) as ForgeService[]).find(
    (k) => FORGE_SERVICES[k].shop === shopKey,
  );
  if (service !== undefined) {
    const item = bestWornArms(character, service);
    const bench = el("section", "bench");
    const spec = FORGE_SERVICES[service];
    bench.append(el("h2", undefined, `${spec.label} what you are wearing`));
    if (item === null) {
      bench.append(el("p", "aside", `Wearing nothing I could ${spec.label.toLowerCase()}.`));
    } else {
      const done = timesDone(item, service);
      const cost = forgeCost(done);
      bench.append(
        el(
          "p",
          "aside",
          `${spec.label} the ${item.name}: ${String(cost)} Marks for another point of ` +
            `${spec.gives}.` +
            (done > 0 ? ` Done ${String(done)} times so far.` : "") +
            " Safe, and it costs half again as much each time.",
        ),
      );
      bench.append(
        button(
          `${spec.label} — ${String(cost)} Marks`,
          () => {
            dispatch({ kind: "forge", service });
            rerender();
          },
          { disabled: character.marks < cost },
        ),
      );
    }
    panel.append(bench);
  }

  const buying = el("section");

  // Sally sells fish at two Marks and a Rutter for Shangala at twelve thousand off the same shelf.
  // One is lunch and the other is the next third of the game, so they are not the same list: a
  // player deciding what to save for should not have to read past the food to find the ladder.
  const all = stockOf(game.content, shop);
  const isWayOnward = (name: string): boolean => /^Map to |^Rutter for |Permit$/.test(name);
  const onward = all.filter((row) => isWayOnward(row.name));
  const supplies = all.filter((row) => !isWayOnward(row.name));

  const stockList = (rows: typeof all): HTMLElement => {
    const stock = el("ul", "itemlist");
    stock.setAttribute("role", "listbox");
    stock.setAttribute("aria-label", "For sale");
    for (const row of rows) {
      const li = el("li");
      li.tabIndex = 0;
      li.setAttribute("role", "option");
      li.append(el("span", "item__name", row.name));
      const meta = el("span", "item__meta", `${String(row.price)} Marks`);
      const view = toItemView(row.item);
      if (view !== null) {
        const comparison = compareToWorn(view, worn);
        const label = deltaLabel(comparison);
        if (label !== "") {
          meta.append(el("span", deltaClass(comparison), ` ${label}`));
        }
      }
      li.append(meta);
      const affordable = row.price <= character.marks;
      if (!affordable) {
        li.classList.add("is-dear");
      }
      const activate = (): void => {
        dispatch({ kind: "buy", shop: shop.key, name: row.name });
        rerender();
      };
      li.addEventListener("click", activate);
      li.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      });
      stock.append(li);
    }
    return stock;
  };

  const shelf = (heading: string, rows: typeof all): HTMLElement | null => {
    if (rows.length === 0) {
      return null;
    }
    const section = el("section");
    section.append(el("h2", undefined, heading));
    section.append(stockList(rows));
    return section;
  };

  for (const section of [
    shelf(onward.length > 0 ? "Supplies" : "For sale", supplies),
    shelf("The way onward", onward),
  ]) {
    if (section !== null) {
      buying.append(section);
    }
  }

  const selling = el("section");
  selling.append(el("h2", undefined, "Your pack"));
  if (character.pack.length === 0) {
    selling.append(el("div", "empty", "Nothing to sell."));
  } else {
    // A long session comes home with sixty-odd rows, most of them the same dagger. One button
    // rather than sixty clicks -- and it can only ever take loot, never a potion or a map.
    const bulk = el("div", "actions actions--items");
    const arms = character.pack.filter((i) => i.kind === "arms").length;
    const valuables = character.pack.filter(
      (i) => i.kind !== "arms" && isBulkSellable(game.content, i),
    ).length;
    if (arms > 0) {
      bulk.append(
        button(
          `Sell all ${String(arms)} weapons and armour`,
          () => {
            dispatch({ kind: "sellAll", shop: shop.key, what: "arms" });
            rerender();
          },
          { hint: "Everything in your pack. Nothing you are wearing is in your pack." },
        ),
      );
    }
    if (valuables > 0) {
      bulk.append(
        button(
          `Sell all ${String(valuables)} trophies and gems`,
          () => {
            dispatch({ kind: "sellAll", shop: shop.key, what: "valuables" });
            rerender();
          },
          { hint: "Junk, trophies and gems only — never a potion, a scroll or a map." },
        ),
      );
    }
    if (bulk.childElementCount > 0) {
      selling.append(bulk);
    }
    const list = el("ul", "itemlist");
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Your pack");
    character.pack.forEach((item, index) => {
      const li = el("li");
      li.tabIndex = 0;
      li.setAttribute("role", "option");
      const count = item.kind === "count" && item.count > 1 ? ` x${String(item.count)}` : "";
      li.append(el("span", "item__name", `${item.name}${count}`));
      const price = sellPrice(
        game.content,
        shop,
        item,
        character.charm,
        character.traits.has("Merchant"),
      );
      li.append(el("span", "item__meta", price > 0 ? `sells for ${String(price)}` : "worthless"));
      const activate = (): void => {
        dispatch({ kind: "sell", shop: shop.key, index });
        rerender();
      };
      li.addEventListener("click", activate);
      li.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      });
      list.append(li);
    });
    selling.append(list);
  }

  const help = el("section");
  help.append(el("h2", undefined, "Haggling"));
  const detail = el("div", "detail");
  detail.append(
    el(
      "div",
      "detail__line",
      "Click to buy or sell. The coloured number is how much better or worse a piece of equipment is than what you are wearing.",
    ),
    el(
      "div",
      "detail__line",
      `Your Charm of ${String(character.charm)} is what gets you a fair price when selling.` +
        (character.traits.has("Merchant") ? " Being a Merchant gets you more still." : ""),
    ),
    el("div", "detail__line", `${shop.name} pays ${String(shop.resale)}% of the table price.`),
  );
  help.append(detail);

  columns.append(buying, selling, help);
  panel.append(columns);
  panel.append(backTo({ kind: "town" }, dispatch, rerender));
  return panel;
}

/** Draws the whole game into `root`. */
export function render(root: HTMLElement, game: Game, ui: UiState, onChange?: () => void): void {
  const rerender = (): void => {
    render(root, game, ui, onChange);
  };
  const dispatch: Dispatch = (move) => {
    apply(game, move);
    onChange?.();
  };

  root.replaceChildren();
  // Cleared here and re-bound only by the screens that want it, so a binding never outlives its
  // screen -- pressing A in a shop must not swing at something that is no longer there.
  bindKeys(null);
  if (game.character !== null && game.place.kind !== "creation") {
    root.append(statusPanel(game.character));
  }

  switch (game.place.kind) {
    case "creation":
      root.append(creationScreen(ui, dispatch, rerender));
      break;
    case "quest":
      root.append(questScreen(game, dispatch, rerender));
      break;
    case "status":
      root.append(statusScreen(game, ui, dispatch, rerender));
      break;
    case "shop":
      root.append(shopScreen(game, game.place.shop, dispatch, rerender));
      break;
    case "temple":
      root.append(templeScreen(game, dispatch, rerender));
      break;
    case "guild":
      root.append(guildScreen(game, dispatch, rerender));
      break;
    case "fallen":
      root.append(fallenScreen(game, rerender));
      break;
    case "fields":
      root.append(fieldsScreen(game, dispatch, rerender));
      break;
    default:
      root.append(townScreen(game, dispatch, rerender));
      break;
  }
}
