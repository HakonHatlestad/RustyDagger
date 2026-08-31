import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadContent, type Content } from "../../src/game/content.js";
import { JOINING_FEE } from "../../src/game/guild.js";
import { parseHero } from "../../src/game/hero.js";
import { apply, asFighter, characterFrom, type Game } from "../../src/game/state.js";
import { GameRandom } from "../../src/rules/random.js";
import { initialUi, render, type UiState } from "../../src/ui/render.js";
import { REGIONS } from "../../src/game/world.js";
import { TRAINABLE, hardenCost } from "../../src/game/training.js";
import { forgeCost } from "../../src/game/forge.js";

/**
 * The interface, driven the way a player drives it.
 *
 * jsdom rather than a browser, so this runs in CI and in a second. It checks the things that are
 * easy to break and hard to notice: that the bars move, that the stat comparison appears in the
 * inventory and not only in shops, that a name out of a save file cannot inject markup, and that
 * the loop the player actually walks — town, region, fight, town — holds together.
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

const TIMBER = readFileSync(resolve(process.cwd(), "test/fixtures/hero.hero"), "utf8");

let root: HTMLElement;
let game: Game;
let ui: UiState;

function newGame(seed = 7, saveText: string = TIMBER): void {
  game = {
    content,
    rng: new GameRandom(seed),
    place: { kind: "town" },
    character: characterFrom(parseHero(saveText)),
    quest: null,
    notices: [],
  };
  ui = initialUi();
  render(root, game, ui);
}

function click(text: string): void {
  const target = [...root.querySelectorAll("button")].find((b) => b.textContent === text);
  if (target === undefined) {
    throw new Error(`no button labelled "${text}". Have: ${buttons().join(", ")}`);
  }
  target.click();
}

/** The region and background cards carry several lines, so they match on a prefix. */
function clickCard(name: string): void {
  const target = [...root.querySelectorAll<HTMLElement>("button.choice")].find((b) =>
    b.textContent.startsWith(name),
  );
  if (target === undefined) {
    throw new Error(`no card named "${name}"`);
  }
  target.click();
}

function buttons(): string[] {
  return [...root.querySelectorAll("button")].map((b) => b.textContent);
}

function goHunting(region = "The Fields"): void {
  if (game.place.kind !== "fields") {
    apply(game, { kind: "goTo", place: { kind: "fields" } });
    render(root, game, ui);
  }
  clickCard(region);
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

  it("no longer counts quests, because nothing rations them", () => {
    expect(root.textContent).not.toContain("Quests");
  });

  it("draws a health bar and an experience bar", () => {
    // The experience bar is the thing the 400x300 canvas had nowhere to put.
    const bars = root.querySelectorAll('[role="progressbar"]');
    expect(bars).toHaveLength(2);
    expect([...bars].map((b) => b.getAttribute("aria-label"))).toEqual(["Health", "Next level"]);
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

  it("says so when you are diseased, because the number is otherwise invisible", () => {
    game.character!.disease = 6;
    render(root, game, ui);
    expect(root.textContent).toContain("Diseased");
  });
});

describe("making a character", () => {
  beforeEach(() => {
    game.character = null;
    game.place = { kind: "creation" };
    render(root, game, ui);
  });

  it("offers every background", () => {
    expect(root.querySelectorAll("button.choice").length).toBe(4);
    expect(root.textContent).toContain("Squire");
    expect(root.textContent).toContain("Barber-Surgeon");
  });

  it("says what each background's traits actually do", () => {
    expect(root.textContent).toContain("a tenth more Attack");
  });

  it("makes the character you asked for and puts them in town", () => {
    const input = root.querySelector<HTMLInputElement>("#hero-name")!;
    input.value = "Ash";
    input.dispatchEvent(new Event("input"));
    clickCard("Poacher");
    click("Begin");
    expect(game.character?.name).toBe("Ash");
    expect(game.character?.traits.has("Agile")).toBe(true);
    expect(game.place.kind).toBe("town");
  });

  it("falls back to a name rather than accepting an empty one", () => {
    click("Begin");
    expect(game.character?.name).toBe("Wanderer");
  });
});

describe("the town", () => {
  it("offers the hunt, the shops and the temple", () => {
    const labels = buttons().join(" ");
    expect(labels).toContain("Go hunting");
    expect(labels).toContain("Bill Smith's");
    expect(labels).toContain("Aileen Suitor's");
    expect(labels).toContain("Sally Trader's");
    expect(labels).toContain("Temple");
  });
});

describe("choosing where to hunt", () => {
  beforeEach(() => {
    click("Go hunting");
  });

  it("offers the whole world, not one field", () => {
    expect(root.querySelectorAll("button.choice").length).toBe(REGIONS.length);
    expect(root.textContent).toContain("The Goblin Mound");
    expect(root.textContent).toContain("Shangala");
  });

  it("locks what you have no way into, and names what would open it", () => {
    // A disabled button with no explanation is just a dead end. This says which map to go and buy.
    const locked = [...root.querySelectorAll<HTMLButtonElement>("button.choice")].filter(
      (b) => b.disabled,
    );
    expect(locked.length).toBeGreaterThan(0);
    expect(root.textContent).toContain("Needs: Castle Permit");
  });

  it("opens a region the moment you are carrying its key", () => {
    game.character!.pack.push({ kind: "count", name: "Castle Permit", count: 1 });
    render(root, game, ui);
    const dungeons = [...root.querySelectorAll<HTMLButtonElement>("button.choice")].find((b) =>
      b.textContent.startsWith("The Castle Dungeons"),
    )!;
    expect(dungeons.disabled).toBe(false);
    dungeons.click();
    expect(game.place.kind).toBe("quest");
    expect(game.quest?.monster.key.startsWith("Dunjeon:")).toBe(true);
  });

  it("does not consume the key: a map does not wear out", () => {
    game.character!.pack.push({ kind: "count", name: "Castle Permit", count: 1 });
    render(root, game, ui);
    clickCard("The Castle Dungeons");
    expect(game.character!.pack.some((c) => c.name === "Castle Permit")).toBe(true);
  });

  it("says where a new character stands, in words rather than a level number", () => {
    // A hand-written "advised level" cannot know about guild ranks or stats grown by use, so the
    // card works it out against what actually lives there and against your own power.
    expect(root.textContent).toContain("outmatched");
    expect(root.querySelector(".choice__verdict--deadly")).not.toBeNull();
    // And not the same verdict everywhere, or it is telling the player nothing.
    const verdicts = new Set(
      [...root.querySelectorAll(".choice__verdict")].map((v) => v.className),
    );
    expect(verdicts.size).toBeGreaterThan(1);
  });

  it("starts an encounter in the region you picked", () => {
    clickCard("The Fields");
    expect(game.place.kind).toBe("quest");
    expect(game.quest?.monster.key.startsWith("Fields:")).toBe(true);
    expect(root.querySelector(".log")).not.toBeNull();
  });

  it("lets a timid creature simply run, without a fight", () => {
    // Not every encounter is a battle, and the interface has to cope with one that ends at once.
    let fled = false;
    for (let attempt = 0; attempt < 80 && !fled; attempt++) {
      goHunting();
      fled = game.quest?.ending === "mobFled";
    }
    expect(fled).toBe(true);
    expect(buttons()).toContain("Back to the hunt");
  });
});

/**
 * Goes hunting until something actually stands and fights.
 *
 * Timid creatures bolt the moment they see you and the encounter ends before a blow is struck, so
 * a test that assumes a quest always produces a fight is flaky by construction.
 */
function huntUntilEngaged(): void {
  for (let attempt = 0; attempt < 60; attempt++) {
    goHunting();
    if (buttons().includes("Attack")) {
      return;
    }
  }
  throw new Error("nothing stood and fought in 60 quests");
}

describe("a fight", () => {
  beforeEach(() => {
    huntUntilEngaged();
  });

  it("offers every action the rules support", () => {
    const labels = buttons();
    for (const action of ["Attack", "Backstab", "Berzerk", "Hypnotise", "Swindle", "Run away"]) {
      expect(labels).toContain(action);
    }
  });

  it("can be fought entirely from the keyboard, which is the most repeated thing in the game", () => {
    const before = game.quest!.log.length;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(game.quest!.log.length).toBeGreaterThan(before);
  });

  it("shows the shortcut without putting it in the button's name", () => {
    const attack = [...root.querySelectorAll("button")].find((b) => b.textContent === "Attack")!;
    expect(attack.dataset["key"]).toBe("A");
  });

  it("stops listening for fight keys once you have left the fight", () => {
    // A binding that outlives its screen would have you swinging at something that is not there.
    apply(game, { kind: "leaveQuest" });
    render(root, game, ui);
    const wounds = game.character!.wounds;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(game.place.kind).toBe("fields");
    expect(game.character!.wounds).toBe(wounds);
  });

  it("explains what each action does, which the original never did", () => {
    const backstab = [...root.querySelectorAll("button")].find(
      (b) => b.textContent === "Backstab",
    )!;
    expect(backstab.title.length).toBeGreaterThan(10);
  });

  it("shows the enemy's health as a bar of its own", () => {
    expect(root.querySelectorAll('[role="progressbar"]').length).toBeGreaterThan(2);
  });

  it("writes a line to the log for every blow", () => {
    // Asserted against the game rather than the DOM: a blow can end the fight, and a fight that
    // ends in a death navigates away from the log entirely.
    const before = game.quest!.log.length;
    click("Attack");
    expect(game.quest!.log.length).toBeGreaterThan(before);
  });

  it("offers what you are carrying, and warns that using it costs the round", () => {
    game.character!.pack.push({ kind: "count", name: "Healing Salve", count: 2 });
    game.character!.wounds = 20;
    render(root, game, ui);
    expect(buttons().join(" ")).toContain("Healing Salve");
    expect(root.textContent).toContain("costs you the round");
  });

  it("heals you when you use a salve mid-fight", () => {
    game.character!.pack.push({ kind: "count", name: "Healing Salve", count: 1 });
    game.character!.wounds = 30;
    game.quest!.hero.wounds = 30;
    render(root, game, ui);
    click("Healing Salve x1");
    expect(game.character!.wounds).toBeLessThan(30);
    expect(game.character!.pack.some((c) => c.name === "Healing Salve")).toBe(false);
  });

  it("replaces the actions with a way out once it is over", () => {
    let guard = 0;
    while (game.quest?.ending === null && guard < 200) {
      click("Attack");
      guard++;
    }
    if (game.place.kind === "fallen") {
      expect(buttons()).toContain("Wake up in town");
    } else {
      expect(buttons()).toContain("Back to the hunt");
      expect(buttons()).not.toContain("Backstab");
    }
  });

  it("returns you to the world afterwards", () => {
    let guard = 0;
    while (game.quest?.ending === null && guard < 200) {
      click("Attack");
      guard++;
    }
    if (game.place.kind === "fallen") {
      click("Wake up in town");
      expect(game.place.kind).toBe("town");
    } else {
      click("Back to the hunt");
      expect(game.place.kind).toBe("fields");
    }
  });
});

describe("losing", () => {
  beforeEach(() => {
    game.place = { kind: "fallen" };
    game.character!.wounds = game.character!.guts;
    game.character!.marks = 500;
    render(root, game, ui);
  });

  it("says what losing actually costs", () => {
    expect(root.textContent).toMatch(/tenth of your Marks/);
  });

  it("takes a tenth of your money and nothing else", () => {
    const level = game.character!.level;
    const gear = game.character!.gear.length;
    const pack = game.character!.pack.length;
    click("Wake up in town");
    expect(game.character!.marks).toBe(450);
    expect(game.character!.level).toBe(level);
    expect(game.character!.gear).toHaveLength(gear);
    expect(game.character!.pack).toHaveLength(pack);
    expect(game.character!.wounds).toBe(0);
    expect(game.place.kind).toBe("town");
  });
});

describe("resting", () => {
  it("is offered in town when you need it, without a walk to the temple", () => {
    game.character!.wounds = 10;
    render(root, game, ui);
    expect(buttons()).toContain("Rest at the temple");
    click("Rest at the temple");
    expect(game.character!.wounds).toBe(0);
    expect(game.place.kind).toBe("town");
  });

  it("is not offered in town when there is nothing wrong with you", () => {
    game.character!.wounds = 0;
    game.character!.disease = 0;
    render(root, game, ui);
    expect(buttons()).not.toContain("Rest at the temple");
  });
});

describe("the temple", () => {
  beforeEach(() => {
    click("Temple");
  });

  it("heals you for nothing", () => {
    game.character!.wounds = 20;
    game.character!.disease = 4;
    render(root, game, ui);
    click("Rest");
    expect(game.character!.wounds).toBe(0);
    expect(game.character!.disease).toBe(0);
    expect(game.character!.marks).toBeGreaterThan(0);
  });

  it("sends you straight back out, rather than back through town", () => {
    click("Go hunting");
    expect(game.place.kind).toBe("fields");
  });

  it("does not offer a rest you do not need", () => {
    game.character!.wounds = 0;
    game.character!.disease = 0;
    render(root, game, ui);
    const rest = [...root.querySelectorAll("button")].find((b) => b.textContent === "Rest")!;
    expect(rest.disabled).toBe(true);
  });

  it("sells a point of Guts, and charges what the button says", () => {
    // The screen where late money turns into power. Untested, this could have been a dead button
    // and every other test in the suite would still have passed.
    const character = game.character!;
    character.level = 30;
    character.guts = 100;
    character.marks = 50_000;
    render(root, game, ui);
    const label = buttons().find((b) => b.startsWith("Guts "));
    expect(label).toBe(`Guts 100 to 101 — ${String(hardenCost(100))} Marks`);
    click(label!);
    expect(character.guts).toBe(101);
    expect(character.marks).toBe(50_000 - hardenCost(100));
  });

  it("offers all three stats, and prices each off its own value", () => {
    const character = game.character!;
    character.level = 30;
    character.guts = 100;
    character.wits = 40;
    character.charm = 20;
    character.marks = 50_000;
    render(root, game, ui);
    for (const stat of TRAINABLE) {
      const current = character[stat.key];
      expect(buttons()).toContain(
        `${stat.name} ${String(current)} to ${String(current + 1)} — ${String(hardenCost(current))} Marks`,
      );
    }
  });

  it("says so on the button when your level will carry no more Guts", () => {
    // Guts is capped at ten a level, because it multiplies damage as well as being health. A
    // disabled button with no explanation would read as a bug, so the label carries the reason.
    const character = game.character!;
    character.level = 12;
    character.guts = 120;
    character.marks = 500_000;
    render(root, game, ui);
    const label = buttons().find((b) => b.startsWith("Guts "))!;
    expect(label).toBe("Guts 120 — as far as level 12 will carry");
    const target = [...root.querySelectorAll("button")].find((b) =>
      b.textContent.startsWith("Guts "),
    )!;
    expect(target.disabled).toBe(true);
    // Wits has no ceiling, so it is still on offer with the same purse.
    expect(buttons().some((b) => b.startsWith("Wits ") && b.includes("Marks"))).toBe(true);
  });

  it("will not let you train what you cannot pay for", () => {
    const character = game.character!;
    character.level = 30;
    character.guts = 100;
    character.marks = 10;
    render(root, game, ui);
    const target = [...root.querySelectorAll("button")].find((b) =>
      b.textContent.startsWith("Guts "),
    )!;
    expect(target.disabled).toBe(true);
  });
});

describe("the list of places to hunt", () => {
  it("says how dangerous a locked region is, not only what it needs", () => {
    // Otherwise the ladder asks you to spend twelve thousand Marks on a Rutter for Shangala with
    // nothing to judge it by. Every key item is a real decision and it needs both halves: what it
    // costs to open, and what is waiting behind it.
    click("Go hunting");
    const card = [...root.querySelectorAll<HTMLButtonElement>("button.choice")].find((b) =>
      b.textContent.startsWith("Shangala"),
    )!;
    expect(card.disabled).toBe(true);
    expect(card.textContent).toContain("Needs: Rutter for Shangala");
    expect(card.textContent).toMatch(/outmatched|even match|manage|more than a match/);
  });
});

describe("the fight screen's legend", () => {
  it("explains every action it offers, without being asked twice", () => {
    // These lived only in `title` tooltips, which a touchscreen cannot reach and a keyboard reaches
    // awkwardly. Three of the six now carry real rules rather than flavour, so a player who cannot
    // read them cannot play well. Folded away, because six rules a round is noise once you know them.
    click("Go hunting");
    clickCard("The Fields");
    const summary = root.querySelector("details.legend summary")!;
    expect(summary.textContent).toBe("What these do");
    const terms = [...root.querySelectorAll("details.legend dt")].map((n) => n.textContent);
    const labels = [...root.querySelectorAll("div.actions button")].map((n) => n.textContent);
    // Every button gets a line, and no line describes a button that is not there.
    expect(terms).toEqual(labels);
    const backstab = [...root.querySelectorAll("details.legend dd")][terms.indexOf("Backstab")]!;
    expect(backstab.textContent).toContain("only from surprise");
  });
});

describe("what the fight screen tells you about this round", () => {
  // Three rules change what the buttons do, and all three live as invisible state on the fighter.
  // A move that silently does something else is the worst kind of interface bug: the player has no
  // way to learn the rule and no way to tell it from a fault.
  //
  // The state is set directly rather than fought into being. That the rules *set* it is pinned in
  // balance.test.ts; what belongs here is that the screen says so, and driving a real fight to
  // reach each state means picking Guts values where neither side dies, which is a fragile way to
  // test a sentence.
  beforeEach(() => {
    click("Go hunting");
    clickCard("The Fields");
  });

  it("says when a charge has left you winded", () => {
    expect(root.textContent).not.toContain("off balance");
    game.quest!.hero.winded = true;
    render(root, game, ui);
    expect(root.textContent).toContain("off balance");
  });

  it("says when the moment for a backstab has passed", () => {
    expect(root.textContent).not.toContain("lands as an ordinary swing");
    game.quest!.hero.roundsFought = 1;
    render(root, game, ui);
    expect(root.textContent).toContain("lands as an ordinary swing");
  });

  it("says when a creature has stopped falling for your patter", () => {
    expect(root.textContent).not.toContain("will not fall for it again");
    game.quest!.monster.wise = true;
    render(root, game, ui);
    expect(root.textContent).toContain("will not fall for it again");
  });

  it("closes the moves that could only make things worse", () => {
    // Winded, a charge keeps none of its multipliers and still costs the guard and the initiative
    // — strictly worse than an ordinary swing. Against something already wise to your patter, a
    // talk-down cannot succeed and still spends the round. Neither is a decision, so neither is
    // offered: a button that can only hurt you is a trap, and this game has had enough of those.
    const enabled = (label: string): boolean =>
      ![...root.querySelectorAll("button")].find((b) => b.textContent === label)!.disabled;

    expect(enabled("Berzerk")).toBe(true);
    game.quest!.hero.winded = true;
    render(root, game, ui);
    expect(enabled("Berzerk")).toBe(false);
    expect(enabled("Attack")).toBe(true);

    game.quest!.hero.winded = false;
    game.quest!.monster.wise = true;
    render(root, game, ui);
    expect(enabled("Hypnotise")).toBe(false);
    expect(enabled("Swindle")).toBe(false);
    expect(enabled("Berzerk")).toBe(true);
  });

  it("will not let the keyboard reach a move the buttons have closed", () => {
    // The shortcut keys bypass the button entirely, so barring one and not the other would leave
    // the trap open to anyone playing with their hands on the keys.
    game.quest!.hero.winded = true;
    render(root, game, ui);
    const key = (k: string): void => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
    };
    const before = game.quest!.rounds;
    key("z");
    expect(game.quest!.rounds).toBe(before);
    key("a");
    expect(game.quest!.rounds).toBeGreaterThan(before);
  });

  it("puts what is true of this round above the standing rules", () => {
    // The note is about the round you are in and the legend is reference. Reading order should
    // match: seen in a browser, the note sat under a collapsed "What these do" and was the last
    // thing on the screen.
    game.quest!.hero.winded = true;
    render(root, game, ui);
    const note = [...root.querySelectorAll("p.aside")].find((n) =>
      n.textContent.includes("off balance"),
    )!;
    const legend = root.querySelector("details.legend")!;
    expect(note.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says nothing at all on the opening round, when none of it applies", () => {
    const text = root.textContent;
    expect(text).not.toContain("off balance");
    expect(text).not.toContain("lands as an ordinary swing");
    expect(text).not.toContain("will not fall for it again");
  });
});

describe("the shelves in a shop", () => {
  it("keeps the way onward off the same shelf as the fish", () => {
    // Sally sells Fish at two Marks and a Rutter for Shangala at twelve thousand. One is lunch and
    // the other is the next third of the game; a player deciding what to save for should not have
    // to read past the food to find the ladder.
    click("Sally Trader's");
    const headings = [...root.querySelectorAll("h2")].map((h) => h.textContent);
    expect(headings).toContain("Supplies");
    expect(headings).toContain("The way onward");
    const lists = [...root.querySelectorAll("ul.itemlist")];
    const onward = lists.find((l) => l.textContent.includes("Rutter for Shangala"))!;
    expect(onward.textContent).toContain("Castle Permit");
    expect(onward.textContent).not.toContain("Fish");
  });

  it("does not split a shop that has no way onward to sell", () => {
    // Bill sells weapons and nothing else, so a second heading would be an empty promise.
    click("Bill Smith's");
    const headings = [...root.querySelectorAll("h2")].map((h) => h.textContent);
    expect(headings).toContain("For sale");
    expect(headings).not.toContain("The way onward");
  });
});

describe("the smith's bench", () => {
  it("reforges the weapon you are wearing, for what the button says", () => {
    const character = game.character!;
    character.marks = 50_000;
    click("Bill Smith's");
    const label = buttons().find((b) => b.startsWith("Reforge"));
    expect(label).toBe(`Reforge — ${String(forgeCost(0))} Marks`);
    const before = asFighter(character).attack;
    click(label!);
    expect(asFighter(character).attack).toBe(before + 1);
    expect(character.marks).toBe(50_000 - forgeCost(0));
  });

  it("gets dearer each time, and says so on the button", () => {
    const character = game.character!;
    character.marks = 500_000;
    click("Bill Smith's");
    click(buttons().find((b) => b.startsWith("Reforge"))!);
    render(root, game, ui);
    expect(buttons()).toContain(`Reforge — ${String(forgeCost(1))} Marks`);
    expect(forgeCost(1)).toBeGreaterThan(forgeCost(0));
  });

  it("tempers at the armourer rather than reforging, and adds Defence", () => {
    const character = game.character!;
    character.marks = 50_000;
    click("Aileen Suitor's");
    const label = buttons().find((b) => b.startsWith("Temper"));
    expect(label).toBeDefined();
    expect(buttons().find((b) => b.startsWith("Reforge"))).toBeUndefined();
    const before = asFighter(character).defend;
    click(label!);
    expect(asFighter(character).defend).toBe(before + 1);
  });

  it("offers no bench at the shops that have no smith", () => {
    click("Sally Trader's");
    expect(buttons().some((b) => b.startsWith("Reforge") || b.startsWith("Temper"))).toBe(false);
  });
});

describe("the shops", () => {
  it("sells armour as well as weapons", () => {
    apply(game, { kind: "goTo", place: { kind: "shop", shop: "armour" } });
    render(root, game, ui);
    expect(root.textContent).toContain("Chain Suit");
  });

  it("sells supplies you can actually use", () => {
    apply(game, { kind: "goTo", place: { kind: "shop", shop: "trader" } });
    render(root, game, ui);
    expect(root.textContent).toContain("Healing Salve");
  });

  it("offers to clear the pack out in one go, once there is a pack to clear", () => {
    game.character!.pack.push({
      kind: "arms",
      name: "Rusty Dagger",
      attack: 1,
      defend: 0,
      skill: 0,
      traits: ["right"],
      enchant: 0,
      forged: 0,
      tempered: 0,
    });
    game.character!.pack.push({ kind: "count", name: "Ruby", count: 2 });
    apply(game, { kind: "goTo", place: { kind: "shop", shop: "weapons" } });
    render(root, game, ui);
    const labels = buttons().join(" | ");
    expect(labels).toContain("Sell all 1 weapons and armour");
    expect(labels).toContain("Sell all 1 trophies and gems");
  });

  it("does not offer a bulk sell when there is nothing it could take", () => {
    game.character!.pack = [{ kind: "count", name: "Healing Salve", count: 3 }];
    apply(game, { kind: "goTo", place: { kind: "shop", shop: "weapons" } });
    render(root, game, ui);
    expect(buttons().join(" | ")).not.toContain("Sell all");
  });

  it("buys a potion into the pack as a stack", () => {
    apply(game, { kind: "goTo", place: { kind: "shop", shop: "trader" } });
    game.character!.marks = 10000;
    render(root, game, ui);
    const row = [...root.querySelectorAll<HTMLElement>(".itemlist li")].find((li) =>
      li.textContent.startsWith("Healing Salve"),
    )!;
    row.click();
    row.click();
    const salve = game.character!.pack.find((c) => c.name === "Healing Salve");
    expect(salve?.kind === "count" ? salve.count : 0).toBe(2);
  });
});

describe("the guild", () => {
  /** Timber is a real 1997 save and is already a member, so joining is tested on a fresh one. */
  // Enough to join and still have a purse afterwards. The assertions below derive from it
  // rather than restating the arithmetic, so a change to the fee cannot leave them stale.
  const OUTSIDER_MARKS = 20000;

  function asOutsider(): void {
    game.character!.traits.delete("Guild");
    game.character!.ranks = { fight: 0, magic: 0, thief: 0 };
    game.character!.marks = OUTSIDER_MARKS;
    apply(game, { kind: "goTo", place: { kind: "guild" } });
    render(root, game, ui);
  }

  it("reads the ranks out of a real save", () => {
    // Timber carries `{#|fight|1}` in its rank list and the Guild trait in its stat flags.
    expect(game.character!.ranks.fight).toBe(1);
    expect(game.character!.traits.has("Guild")).toBe(true);
    expect(root.textContent).toContain("Guild: Fighting 1");
  });

  it("asks an outsider to join before it teaches anything", () => {
    asOutsider();
    expect(root.textContent).toContain(`Membership is ${String(JOINING_FEE)} Marks`);
  });

  it("takes the fee and then offers all three tracks", () => {
    asOutsider();
    click(`Join — ${String(JOINING_FEE)} Marks`);
    expect(game.character!.marks).toBe(OUTSIDER_MARKS - JOINING_FEE);
    expect(root.querySelectorAll("button.choice").length).toBe(3);
  });

  it("says what each track actually buys you", () => {
    asOutsider();
    click(`Join — ${String(JOINING_FEE)} Marks`);
    expect(root.textContent).toContain("+1 Attack per rank");
    expect(root.textContent).toContain("+1 Defence per rank");
  });

  it("trains a rank and shows it on the status panel", () => {
    asOutsider();
    game.character!.level = 5;
    click(`Join — ${String(JOINING_FEE)} Marks`);
    clickCard("Fighting");
    expect(game.character!.ranks.fight).toBe(1);
    expect(root.textContent).toContain("Guild: Fighting 1");
  });

  it("explains itself rather than just refusing", () => {
    asOutsider();
    game.character!.level = 1;
    click(`Join — ${String(JOINING_FEE)} Marks`);
    clickCard("Fighting");
    render(root, game, ui);
    // One rank at level 1 is the cap, so it has to say why there is no second.
    expect(root.textContent).toMatch(/Come back when you have grown/);
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

  it("says what a potion would do for you", () => {
    game.character!.pack.push({ kind: "count", name: "Gold Apple", count: 1 });
    render(root, game, ui);
    const row = [...root.querySelectorAll<HTMLElement>(".itemlist li")].find((li) =>
      li.textContent.startsWith("Gold Apple"),
    )!;
    row.click();
    expect(root.textContent).toContain("Heals 30 points");
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
      enchant: 0,
      forged: 0,
      tempered: 0,
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
      enchant: 0,
      forged: 0,
      tempered: 0,
    });
    render(root, game, ui);
    const rows = [...root.querySelectorAll<HTMLElement>(".itemlist li")];
    const knife = rows.find((r) => r.textContent.includes("Knife"))!;
    knife.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(game.character!.gear.some((g) => g.name === "Knife")).toBe(true);
  });

  it("uses a potion when you press Enter on it, rather than trying to wear it", () => {
    game.character!.wounds = 20;
    game.character!.pack.push({ kind: "count", name: "Healing Salve", count: 1 });
    render(root, game, ui);
    const row = [...root.querySelectorAll<HTMLElement>(".itemlist li")].find((r) =>
      r.textContent.includes("Healing Salve"),
    )!;
    row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(game.character!.wounds).toBe(5);
    expect(game.character!.gear.some((g) => g.name === "Healing Salve")).toBe(false);
  });

  it("marks the selected row for a screen reader", () => {
    const row = root.querySelector<HTMLElement>(".itemlist li")!;
    row.click();
    expect(root.querySelector('[aria-selected="true"]')).not.toBeNull();
  });

  it("goes back to town", () => {
    click("Back");
    expect(game.place.kind).toBe("town");
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
  it("hunts repeatedly without breaking, and never runs out of quests", () => {
    for (let i = 0; i < 15; i++) {
      if (game.place.kind === "fallen") {
        click("Wake up in town");
      }
      goHunting();
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
