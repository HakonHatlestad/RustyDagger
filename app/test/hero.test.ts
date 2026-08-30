import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEntity } from "../src/format/parse.js";
import { serialiseEntity } from "../src/format/serialise.js";
import {
  SaveFormatError,
  heroLevel,
  heroMarks,
  heroPlace,
  heroState,
  parseHero,
  serialiseHero,
} from "../src/game/hero.js";

/**
 * Checked against the real save files in this repository, not fixtures.
 *
 * Importing existing characters is the reason the port keeps the 1997 format at all, so the test
 * that matters is that an actual `.hero` file loads, and that writing it back and reading it again
 * gives the same character.
 */

const savesDir = fileURLToPath(new URL("../../saves/", import.meta.url));
const saveFiles = readdirSync(savesDir).filter((f) => f.endsWith(".hero"));

function save(name: string): string {
  return readFileSync(savesDir + name, "utf8");
}

/**
 * The fixture, for anything that asserts what is *inside* a character.
 *
 * Deliberately not one of the files in `saves/`: those are played, the Java build writes to them,
 * and three tests here silently came to depend on items a play session had added. See
 * `test/fixtures/README.md`.
 */
const FIXTURE = readFileSync(
  fileURLToPath(new URL("./fixtures/hero.hero", import.meta.url)),
  "utf8",
);

/**
 * The real saves are still tested — but only for properties that hold whatever anyone has played.
 * A test that asserts a real save's *contents* is a test that breaks when its owner levels up.
 */
describe("the real saves in this repository", () => {
  it("there are some to test against", () => {
    expect(saveFiles.length).toBeGreaterThan(0);
  });

  it.each(saveFiles)("loads %s", (fileName) => {
    const hero = parseHero(save(fileName));
    expect(hero.name.length).toBeGreaterThan(0);
    expect(hero.guts).toBeGreaterThan(0);
    expect(heroLevel(hero)).toBeGreaterThanOrEqual(1);
    expect(["Alive", "Dead"]).toContain(heroState(hero));
  });

  it.each(saveFiles)("survives a write and a read of %s", (fileName) => {
    const original = parseHero(save(fileName));
    const again = parseHero(serialiseHero(original));
    expect(again).toEqual(original);
  });

  it.each(saveFiles)("keeps everything it does not understand in %s", (fileName) => {
    // A real save can carry things the port does not model -- a note with an embedded letter, say.
    // Whatever is in the pack must still be in the pack after a write.
    const before = parseHero(save(fileName));
    const written = serialiseHero(before);
    for (const item of before.pack) {
      expect(written).toContain(item.name);
    }
  });
});

describe("reading a hero", () => {
  const text = FIXTURE;
  const hero = parseHero(text);

  it("reads the name and the three base stats", () => {
    expect(hero.name).toBe("Timber");
    expect(hero.guts).toBe(10);
    expect(hero.wits).toBe(7);
    expect(hero.charm).toBe(4);
  });

  it("finds the money in the pack", () => {
    expect(heroMarks(hero)).toBe(100);
  });

  it("finds the level in the rank list", () => {
    expect(heroLevel(hero)).toBe(1);
  });

  it("finds where the hero is", () => {
    expect(heroPlace(hero)).toBe("fields");
    expect(heroState(hero)).toBe("Alive");
  });

  it("reads bare tokens in the stat list as flags", () => {
    expect(hero.statFlags).toContain("Guild");
    expect(hero.stat.get("Age")).toBe(16);
  });

  it("keeps a note it cannot model as an opaque item", () => {
    const note = hero.pack.find((c) => c.name === "Letter");
    expect(note?.kind).toBe("opaque");
  });

  it("finds lists by name rather than position", () => {
    // Real saves carry an empty field between the stats and the lists, so counting fields fails.
    const shuffled = text.replace(/\{~\|gear\}/, "").replace("{~|pack", "{~|gear}|{~|pack");
    const from = parseHero(shuffled);
    expect(from.guts).toBe(10);
    expect(heroMarks(from)).toBe(100);
  });
});

describe("rejecting what is not a hero", () => {
  it.each([
    ["a weapon", "{itArms|Knife|1|0|1|right}"],
    ["a bare list", "{~|pack|{#|Marks|10}}"],
  ])("refuses %s", (_name, text) => {
    expect(() => parseHero(text)).toThrow(SaveFormatError);
  });

  it("refuses text that is not an entity at all", () => {
    expect(() => parseHero("Timber, level 4")).toThrow();
  });
});

describe("the serialiser", () => {
  it("round-trips any entity, pretty or flat", () => {
    const entity = parseEntity(FIXTURE);
    expect(parseEntity(serialiseEntity(entity, { pretty: true }))).toEqual(entity);
    expect(parseEntity(serialiseEntity(entity, { pretty: false }))).toEqual(entity);
  });

  it("writes the short form for types that have one", () => {
    const out = serialiseEntity({ type: "itList", name: "pack", fields: [] });
    expect(out).toBe("{~|pack}");
  });

  it("writes the empty-list form", () => {
    expect(serialiseEntity({ type: "itList", name: "", fields: [] })).toBe("{~}");
  });

  it("keeps a weapon on one line even when pretty-printing", () => {
    const out = serialiseEntity(parseEntity("{itArms|Knife|1|0|1|right}"), { pretty: true });
    expect(out).not.toContain("\n");
  });

  it("preserves multi-line text inside a value", () => {
    const original = "{itNote|Letter|{=|body|line one\nline two}}";
    const entity = parseEntity(original);
    expect(parseEntity(serialiseEntity(entity))).toEqual(entity);
  });
});
