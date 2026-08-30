import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { characterFrom, type Character } from "../src/game/state.js";
import { parseHero } from "../src/game/hero.js";
import {
  clearSave,
  exportText,
  loadSaved,
  saveCharacter,
  SAVE_KEY,
  type SaveStore,
} from "../src/game/save.js";

/**
 * Saving, which the port could do and never did.
 *
 * The bug this covers was not a broken writer — `serialiseHero` was written and tested from the
 * start. Nothing called it, so a session's marks, loot and levels vanished on refresh. These tests
 * are about the *round trip through storage*, which is the part that was missing.
 */

function store(): SaveStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const TIMBER = readFileSync(
  fileURLToPath(new URL("../../saves/Timber.hero", import.meta.url)),
  "utf8",
);

function character(): Character {
  return characterFrom(parseHero(TIMBER));
}

describe("keeping a character between sessions", () => {
  it("writes a character and reads the same one back", () => {
    const s = store();
    const c = character();
    c.marks = 1234;
    c.level = 5;
    c.wounds = 8;
    saveCharacter(s, c);

    const again = loadSaved(s);
    expect(again).not.toBeNull();
    const restored = characterFrom(again!);
    expect(restored.marks).toBe(1234);
    expect(restored.level).toBe(5);
    expect(restored.wounds).toBe(8);
    expect(restored.name).toBe(c.name);
  });

  it("survives a full round trip twice, so saving is not lossy over a campaign", () => {
    const s = store();
    const first = character();
    first.marks = 999;
    saveCharacter(s, first);
    const second = characterFrom(loadSaved(s)!);
    saveCharacter(s, second);
    const third = characterFrom(loadSaved(s)!);
    expect(third.marks).toBe(999);
    expect(third.gear.map((g) => g.name)).toEqual(first.gear.map((g) => g.name));
    expect(third.pack.map((p) => p.name)).toEqual(first.pack.map((p) => p.name));
  });

  it("reports no character when there is nothing stored", () => {
    expect(loadSaved(store())).toBeNull();
  });

  it("reports no character rather than throwing when the save is rubbish", () => {
    // A corrupt save must not stop the game from starting at all.
    const s = store();
    s.setItem(SAVE_KEY, "not a hero at all");
    expect(loadSaved(s)).toBeNull();
  });

  it("leaves a save it could not read in place rather than overwriting it", () => {
    const s = store();
    s.setItem(SAVE_KEY, "{itArms|Knife|2|0|1}");
    loadSaved(s);
    expect(s.getItem(SAVE_KEY)).toBe("{itArms|Knife|2|0|1}");
  });

  it("does nothing at all when there is nowhere to store anything", () => {
    // Private browsing has no usable localStorage. The game still has to run.
    expect(() => {
      saveCharacter(null, character());
      clearSave(null);
    }).not.toThrow();
    expect(loadSaved(null)).toBeNull();
  });

  it("clears a save when asked", () => {
    const s = store();
    saveCharacter(s, character());
    clearSave(s);
    expect(loadSaved(s)).toBeNull();
  });

  it("exports text the ordinary loader can read straight back", () => {
    const c = character();
    c.marks = 42;
    expect(characterFrom(parseHero(exportText(c))).marks).toBe(42);
  });
});
