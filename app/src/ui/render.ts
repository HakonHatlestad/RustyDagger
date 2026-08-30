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

import { Action, type Fighter } from "../rules/battle.js";
import {
  apply,
  asFighter,
  expFraction,
  healthFraction,
  healthLeft,
  questsLeft,
  type Character,
  type Game,
  type Move,
} from "../game/state.js";
import { raiseFor } from "../rules/levelling.js";
import type { Carried } from "../game/hero.js";
import { compareToWorn, deltaClass, deltaLabel, describeItem, type ItemView } from "./describe.js";

type Dispatch = (move: Move) => void;

/** What the player has selected in a list, so a description can be shown beside it. */
export interface UiState {
  selected: { readonly list: "pack" | "gear"; readonly index: number } | null;
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
  opts: { primary?: boolean; disabled?: boolean } = {},
): HTMLButtonElement {
  const node = el("button", opts.primary === true ? "primary" : undefined, label);
  node.disabled = opts.disabled ?? false;
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
  const fighter: Fighter = asFighter(character);

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
    ["Quests", String(questsLeft(character))],
  ];
  for (const [label, value] of pairs) {
    const stat = el("span", "stat");
    stat.append(el("span", "stat__label", label), el("span", "stat__value", value));
    stats.append(stat);
  }
  left.append(stats);

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
      const delta = el("span", deltaClass(comparison), ` ${label}`);
      meta.append(delta);
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
          dispatch({ kind: listName === "pack" ? "equip" : "unequip", index });
          ui.selected = null;
          rerender();
        },
      ),
    );
  });
  section.append(list);
  return section;
}

function detailPanel(ui: UiState, character: Character): HTMLElement {
  const panel = el("div", "detail");
  const selection = ui.selected;
  if (selection === null) {
    panel.append(el("div", "detail__line", "Choose an item to see what it does."));
    return panel;
  }
  const item = character[selection.list][selection.index];
  if (item === undefined) {
    panel.append(el("div", "detail__line", "Choose an item to see what it does."));
    return panel;
  }
  panel.append(el("div", "detail__title", item.name));
  const view = toItemView(item);
  if (view === null) {
    panel.append(
      el(
        "div",
        "detail__line",
        item.kind === "count" ? `You are carrying ${String(item.count)}.` : "Not equipment.",
      ),
    );
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

/* ------------------------------------------------------------- screens ---- */

function fieldsScreen(game: Game, dispatch: Dispatch, rerender: () => void): HTMLElement {
  const panel = el("section", "panel");
  panel.append(el("h1", undefined, "The Fields"));
  panel.append(
    el(
      "p",
      undefined,
      "Open country outside the town walls. Something is usually moving in the long grass.",
    ),
  );

  const quests = [...game.content.monsters.keys()].filter((k) => k.startsWith("Fields:"));
  const actions = el("div", "actions");
  actions.append(
    button(
      "Go questing",
      () => {
        const key = game.rng.select(quests);
        dispatch({ kind: "startQuest", monsterKey: key, weight: 2 });
        rerender();
      },
      { primary: true },
    ),
    button("Character", () => {
      dispatch({ kind: "goTo", place: { kind: "status" } });
      rerender();
    }),
  );
  panel.append(actions);
  return panel;
}

function questScreen(game: Game, dispatch: Dispatch, rerender: () => void): HTMLElement {
  const panel = el("section", "panel");
  const quest = game.quest;
  if (quest === null) {
    panel.append(el("p", undefined, "The road is quiet."));
    return panel;
  }

  panel.append(el("h1", undefined, quest.monster.name));
  panel.append(
    el(
      "p",
      undefined,
      `Guts ${String(quest.monster.guts - quest.monster.wounds)} of ${String(quest.monster.guts)} · ` +
        `attack ${String(quest.monster.attack)} · defence ${String(quest.monster.defend)} · ` +
        `skill ${String(quest.monster.skill)}`,
    ),
  );
  panel.append(
    bar(
      "Enemy",
      quest.monster.guts <= 0 ? 0 : 1 - quest.monster.wounds / quest.monster.guts,
      `${String(Math.max(0, quest.monster.guts - quest.monster.wounds))} / ${String(quest.monster.guts)}`,
      "health",
    ),
  );

  const log = el("div", "log");
  for (const line of quest.log) {
    const kind = line.includes("kills")
      ? "kill"
      : line.includes("level")
        ? "level"
        : line.includes("misses")
          ? ""
          : "hit";
    log.append(el("p", kind, line));
  }
  panel.append(log);

  const actions = el("div", "actions");
  const over = quest.ending !== null;
  if (over) {
    actions.append(
      button(
        "Back to the fields",
        () => {
          dispatch({ kind: "leaveQuest" });
          rerender();
        },
        { primary: true },
      ),
    );
  } else {
    const choices: [string, string][] = [
      ["Attack", Action.ATTACK],
      ["Backstab", Action.BACKSTAB],
      ["Berzerk", Action.BERZERK],
      ["Hypnotise", Action.CONTROL],
      ["Swindle", Action.SWINDLE],
      ["Run away", Action.RUNAWAY],
    ];
    for (const [label, action] of choices) {
      actions.append(
        button(
          label,
          () => {
            dispatch({ kind: "fight", action });
            rerender();
          },
          { primary: action === Action.ATTACK },
        ),
      );
    }
  }
  panel.append(actions);
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

  const columns = el("div", "columns");
  columns.append(
    itemList(
      "Worn",
      character.gear,
      "gear",
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
      ui,
      character,
      dispatch,
      rerender,
      "Your pack is empty.",
    ),
    (() => {
      const section = el("section");
      section.append(el("h2", undefined, "Description"));
      section.append(detailPanel(ui, character));
      return section;
    })(),
  );
  panel.append(columns);

  const actions = el("div", "actions");
  actions.append(
    button(
      "Back",
      () => {
        dispatch({ kind: "goTo", place: { kind: "fields" } });
        rerender();
      },
      { primary: true },
    ),
  );
  panel.append(actions);
  return panel;
}

function deadScreen(game: Game, dispatch: Dispatch, rerender: () => void): HTMLElement {
  const panel = el("section", "panel");
  panel.append(el("h1", undefined, "You have died"));
  panel.append(
    el("p", undefined, `${game.character?.name ?? "Your hero"} falls, and the fields fall quiet.`),
  );
  const actions = el("div", "actions");
  actions.append(
    button(
      "Begin again",
      () => {
        const character = game.character;
        if (character !== null) {
          character.wounds = 0;
        }
        dispatch({ kind: "goTo", place: { kind: "fields" } });
        rerender();
      },
      { primary: true },
    ),
  );
  panel.append(actions);
  return panel;
}

/** Draws the whole game into `root`. */
export function render(root: HTMLElement, game: Game, ui: UiState): void {
  const rerender = (): void => {
    render(root, game, ui);
  };
  const dispatch: Dispatch = (move) => {
    apply(game, move);
  };

  root.replaceChildren();
  if (game.character !== null) {
    root.append(statusPanel(game.character));
  }

  switch (game.place.kind) {
    case "quest":
      root.append(questScreen(game, dispatch, rerender));
      break;
    case "status":
      root.append(statusScreen(game, ui, dispatch, rerender));
      break;
    case "dead":
      root.append(deadScreen(game, dispatch, rerender));
      break;
    default:
      root.append(fieldsScreen(game, dispatch, rerender));
      break;
  }
}
