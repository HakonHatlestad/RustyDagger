import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadContent, type Content } from "../../src/game/content.js";
import { parseHero } from "../../src/game/hero.js";
import { apply, characterFrom, type Game } from "../../src/game/state.js";
import { GameRandom } from "../../src/rules/random.js";
import { render, type UiState } from "../../src/ui/render.js";

/**
 * The interface, driven the way a player drives it.
 *
 * jsdom rather than a browser, so this runs in CI and in a second. It checks the things that are
 * easy to break and hard to notice: that the bars move, that the stat comparison appears in the
 * inventory and not only in shops, and that a name out of a save file cannot inject markup.
 */

/**
 * Paths are resolved from the project root rather than from `import.meta.url`, because under jsdom
 * `import.meta.url` is not a file URL and cannot be converted to a path.
 */
function fromRoot(path: string): string {
  return resolve(process.cwd(), "..", path);
}

function json(path: string): never {
  return JSON.parse(readFileSync(fromRoot(path), "utf8")) as never;
}

const content: Content = loadContent({
  arms: json("content/arms.json"),
  monsters: json("content/monsters.json"),
  gear: json("content/gear.json"),
});

const TIMBER = readFileSync(fromRoot("saves/Timber.hero"), "utf8");

let root: HTMLElement;
let game: Game;
let ui: UiState;

function newGame(seed = 7, saveText: string = TIMBER): void {
  game = {
    content,
    rng: new GameRandom(seed),
    place: { kind: "fields" },
    character: characterFrom(parseHero(saveText)),
    quest: null,
    notices: [],
  };
  ui = { selected: null };
  render(root, game, ui);
}

function click(text: string): void {
  const target = [...root.querySelectorAll("button")].find((b) => b.textContent === text);
  if (target === undefined) {
    throw new Error(`no button labelled "${text}". Have: ${buttons().join(", ")}`);
  }
  target.click();
}

function buttons(): string[] {
  return [...root.querySelectorAll("button")].map((b) => b.textContent);
}

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById("app")!;
  newGame();
});

describe("the status bar", () => {
  it("shows who you are and the stats you fight with", () => {
    const text = root.textContent;
    expect(text).toContain("Timber");
    expect(text).toContain("Guts");
    expect(text).toContain("Attack");
    expect(text).toContain("Marks");
  });

  it("draws a health bar and an experience bar", () => {
    // The experience bar is the thing the 400x300 canvas had nowhere to put.
    const bars = root.querySelectorAll('[role="progressbar"]');
    expect(bars).toHaveLength(2);
    expect([...bars].map((b) => b.getAttribute("aria-label"))).toEqual(["Health", "Level"]);
  });

  it("moves the health bar as you take damage", () => {
    const width = (): string =>
      (root.querySelector(".bar__fill--health") as HTMLElement).style.width;
    expect(width()).toBe("100%");
    game.character!.wounds = Math.trunc(game.character!.guts / 2);
    render(root, game, ui);
    expect(width()).not.toBe("100%");
  });

  it("keeps the bar within bounds when wounds exceed health", () => {
    game.character!.wounds = game.character!.guts * 5;
    render(root, game, ui);
    expect((root.querySelector(".bar__fill--health") as HTMLElement).style.width).toBe("0%");
  });
});

describe("the fields", () => {
  it("offers questing", () => {
    expect(buttons()).toContain("Go questing");
  });

  it("starts a fight when you go questing", () => {
    click("Go questing");
    expect(game.place.kind).toBe("quest");
    expect(root.querySelector(".log")).not.toBeNull();
  });
});

describe("a fight", () => {
  beforeEach(() => {
    click("Go questing");
  });

  it("offers every action the rules support", () => {
    const labels = buttons();
    for (const action of ["Attack", "Backstab", "Berzerk", "Hypnotise", "Swindle", "Run away"]) {
      expect(labels).toContain(action);
    }
  });

  it("shows the enemy's health as a bar of its own", () => {
    expect(root.querySelectorAll('[role="progressbar"]').length).toBeGreaterThan(2);
  });

  it("writes a line to the log for every blow", () => {
    const before = root.querySelectorAll(".log p").length;
    click("Attack");
    expect(root.querySelectorAll(".log p").length).toBeGreaterThan(before);
  });

  it("replaces the actions with a way out once it is over", () => {
    let guard = 0;
    while (game.quest?.ending === null && guard < 200) {
      click("Attack");
      guard++;
    }
    expect(buttons()).toContain("Back to the fields");
    expect(buttons()).not.toContain("Backstab");
  });

  it("returns you to the fields afterwards", () => {
    let guard = 0;
    while (game.quest?.ending === null && guard < 200) {
      click("Attack");
      guard++;
    }
    if (game.place.kind === "dead") {
      click("Begin again");
    } else {
      click("Back to the fields");
    }
    expect(game.place.kind).toBe("fields");
    expect(buttons()).toContain("Go questing");
  });
});

describe("the character screen", () => {
  beforeEach(() => {
    click("Character");
  });

  it("shows what you are wearing and what you are carrying", () => {
    const text = root.textContent;
    expect(text).toContain("Worn");
    expect(text).toContain("Pack");
  });

  it("lists what is in the pack", () => {
    expect(root.textContent).toContain("Cookie");
  });

  it("invites you to pick something before it describes anything", () => {
    expect(root.textContent).toContain("Choose an item");
  });

  it("describes an item when you select it", () => {
    const row = root.querySelector<HTMLElement>(".itemlist li")!;
    row.click();
    expect(root.querySelector(".detail__title")?.textContent).toBe(
      row.querySelector(".item__name")?.textContent,
    );
  });

  it("shows a stat comparison in the inventory, not just in shops", () => {
    // The asymmetry this rewrite exists to close: the Java build shows this in shops only.
    game.character!.pack.push({
      kind: "arms",
      name: "Long Sword",
      attack: 15,
      defend: 0,
      skill: 0,
      traits: ["right"],
    });
    render(root, game, ui);
    expect(root.querySelector(".delta--better")?.textContent.trim()).toBe("+15");
  });

  it("equips an item when you press Enter on it", () => {
    game.character!.pack.push({
      kind: "arms",
      name: "Knife",
      attack: 2,
      defend: 0,
      skill: 1,
      traits: ["right"],
    });
    render(root, game, ui);
    const rows = [...root.querySelectorAll<HTMLElement>(".itemlist li")];
    const knife = rows.find((r) => r.textContent.includes("Knife"))!;
    knife.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(game.character!.gear.some((g) => g.name === "Knife")).toBe(true);
  });

  it("marks the selected row for a screen reader", () => {
    const row = root.querySelector<HTMLElement>(".itemlist li")!;
    row.click();
    expect(root.querySelector('[aria-selected="true"]')).not.toBeNull();
  });

  it("goes back to the fields", () => {
    click("Back");
    expect(game.place.kind).toBe("fields");
  });
});

describe("safety", () => {
  it("never lets a name out of a save file become markup", () => {
    // Save files are hand-editable and synced between machines; a name is not trusted input.
    const hostile = TIMBER.replace("{itHero|Timber|", "{itHero|<img src=x onerror=alert(1)>|");
    newGame(7, hostile);
    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("survives a save with no pack or gear at all", () => {
    newGame(7, "{itHero|Bare|10|10|10}");
    expect(root.textContent).toContain("Bare");
    click("Character");
    expect(root.textContent).toContain("Your pack is empty");
  });
});

describe("the whole loop, played through", () => {
  it("quests repeatedly without breaking", () => {
    for (let i = 0; i < 12 && game.place.kind !== "dead"; i++) {
      if (game.place.kind !== "fields") {
        apply(game, { kind: "goTo", place: { kind: "fields" } });
        render(root, game, ui);
      }
      click("Go questing");
      let guard = 0;
      while (game.quest?.ending === null && guard < 200) {
        click("Attack");
        guard++;
      }
      expect(guard).toBeLessThan(200);
    }
    expect(root.textContent.length).toBeGreaterThan(0);
  });
});
