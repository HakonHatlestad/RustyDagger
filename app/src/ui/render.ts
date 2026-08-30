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

import { Action } from "../rules/battle.js";
import {
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
import { SHOPS, sellPrice, shopByKey, stockOf } from "../game/shop.js";
import { REGIONS } from "../game/world.js";
import { BACKGROUNDS } from "../game/creation.js";
import { describeUse, effectOf, isUsable, isUsableHere } from "../game/items.js";
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
        enchant: 0,
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
  const pairs: [string, string][] = [
    ["Guts", String(character.guts)],
    ["Wits", String(character.wits)],
    ["Charm", String(character.charm)],
    ["Attack", String(fighter.attack)],
    ["Defence", String(fighter.defend)],
    ["Skill", String(fighter.skill)],
    ["Marks", String(character.marks)],
    ["Fame", String(character.fame)],
  ];
  for (const [label, value] of pairs) {
    const stat = el("span", "stat");
    stat.append(el("span", "stat__label", label), el("span", "stat__value", value));
    stats.append(stat);
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
      "Level",
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
        el("div", "detail__line", describeUse(effect, character.traits.has("Medic"))),
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
  return panel;
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

  const list = el("div", "choices");
  for (const region of REGIONS) {
    const quarry = [...game.content.monsters.keys()].filter((k) =>
      k.startsWith(`${region.prefix}:`),
    );
    const card = el("button", "choice");
    card.type = "button";
    card.disabled = quarry.length === 0;
    card.append(el("span", "choice__name", region.name));
    card.append(el("span", "choice__blurb", region.blurb));
    card.append(
      el(
        "span",
        "choice__stats",
        character !== null && character.level < region.advisedLevel
          ? `Dangerous below level ${String(region.advisedLevel)} — you are ${String(character.level)}.`
          : `Suits level ${String(region.advisedLevel)} and up.`,
      ),
    );
    card.addEventListener("click", () => {
      dispatch({
        kind: "startQuest",
        monsterKey: game.rng.select(quarry),
        weight: region.weight,
      });
      rerender();
    });
    list.append(card);
  }
  panel.append(list);
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
  } else {
    const actions = el("div", "actions");
    const choices: [string, string, string][] = [
      ["Attack", Action.ATTACK, "An ordinary swing."],
      ["Backstab", Action.BACKSTAB, "Double Guts and Speed, but it only gets one blow in."],
      ["Berzerk", Action.BERZERK, "Double Guts and Speed and four swings. You will be hit back."],
      ["Hypnotise", Action.CONTROL, "Opposed Wits. Wins the fight outright, or wastes the round."],
      ["Swindle", Action.SWINDLE, "Opposed Charm. Takes what it carries without a fight."],
      ["Run away", Action.RUNAWAY, "Leave. You always act last."],
    ];
    for (const [label, action, hint] of choices) {
      actions.append(
        button(
          label,
          () => {
            dispatch({ kind: "fight", action });
            rerender();
          },
          { primary: action === Action.ATTACK, hint },
        ),
      );
    }
    panel.append(actions);
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
        "You lose nothing but the fight itself.",
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

  const buying = el("section");
  buying.append(el("h2", undefined, "For sale"));
  const stock = el("ul", "itemlist");
  stock.setAttribute("role", "listbox");
  stock.setAttribute("aria-label", "For sale");
  for (const row of stockOf(game.content, shop)) {
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
  buying.append(stock);

  const selling = el("section");
  selling.append(el("h2", undefined, "Your pack"));
  if (character.pack.length === 0) {
    selling.append(el("div", "empty", "Nothing to sell."));
  } else {
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
