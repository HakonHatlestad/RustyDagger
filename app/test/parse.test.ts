import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEntity, ParseError, isEntity, type Entity } from "../src/format/parse.js";

/**
 * The parser is checked twice over: against hand-written cases that pin down the grammar's corners,
 * and against every piece of content the Java build exports. The second is the one that matters --
 * 146 real entities, including monsters nested several lists deep, straight out of the game.
 */

function content(file: string): unknown {
  const path = fileURLToPath(new URL(`../../content/${file}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

describe("the grammar", () => {
  it("reads a flat entity", () => {
    expect(parseEntity("{itArms|Bill Hook|17|0|5|right|left}")).toEqual({
      type: "itArms",
      name: "Bill Hook",
      fields: ["17", "0", "5", "right", "left"],
    });
  });

  it("expands an icon to the type it abbreviates", () => {
    expect(parseEntity("{=|pic|Fields/Centaur.jpg}").type).toBe("itValue");
    expect(parseEntity("{~|pack}").type).toBe("itList");
    expect(parseEntity("{#|Marks|400}").type).toBe("itCount");
    expect(parseEntity("{%|Quartz|50}").type).toBe("itPercent");
    expect(parseEntity("{@|Marks|25}").type).toBe("itRandom");
  });

  it("nests entities inside fields", () => {
    const e = parseEntity("{~|pack|{@|Marks|25}|{%|Quartz|50}}");
    expect(e.fields).toHaveLength(2);
    expect((e.fields[0] as Entity).name).toBe("Marks");
    expect((e.fields[1] as Entity).type).toBe("itPercent");
  });

  it("nests several levels deep", () => {
    const e = parseEntity("{~|a|{~|b|{~|c|{=|d|e}}}}");
    const b = e.fields[0] as Entity;
    const c = b.fields[0] as Entity;
    const d = c.fields[0] as Entity;
    expect(d).toEqual({ type: "itValue", name: "d", fields: ["e"] });
  });

  it("ignores the layout whitespace the game writes between fields", () => {
    const pretty = "{itList|pack|\n\t{#|Marks|4000}|\n\t\t{%|Ring|30}}";
    const flat = "{itList|pack|{#|Marks|4000}|{%|Ring|30}}";
    expect(parseEntity(pretty)).toEqual(parseEntity(flat));
  });

  it("accepts an empty list, with and without a name", () => {
    expect(parseEntity("{~}")).toEqual({ type: "itList", name: "", fields: [] });
    expect(parseEntity("{~|gear}")).toEqual({ type: "itList", name: "gear", fields: [] });
  });

  it("keeps empty fields rather than dropping them", () => {
    // Monster stat blocks routinely carry blank fields; losing them shifts every later field.
    expect(parseEntity("{itArms|X|1||3}").fields).toEqual(["1", "", "3"]);
  });

  it("preserves spaces inside a name", () => {
    expect(parseEntity("{itArms|Silver Masamune|120}").name).toBe("Silver Masamune");
  });
});

describe("malformed input", () => {
  it.each([
    ["not an entity at all", "hello"],
    ["unterminated", "{itArms|Knife|1"],
    ["unterminated nested", "{~|pack|{#|Marks|1}"],
    ["trailing text", "{~|pack} and then some"],
    ["empty", ""],
  ])("rejects %s", (_name, text) => {
    expect(() => parseEntity(text)).toThrow(ParseError);
    expect(isEntity(text)).toBe(false);
  });

  it("reports where it gave up", () => {
    try {
      parseEntity("{itArms|Knife|1");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      expect((e as ParseError).offset).toBe(15);
    }
  });
});

describe("against the content the Java build exports", () => {
  const files = [
    ["arms", "arms.json"],
    ["monsters", "monsters.json"],
  ] as const;

  for (const [key, file] of files) {
    const data = content(file) as Record<string, { key: string; source: string }[]>;
    const entries = data[key]!;

    it(`parses every one of the ${entries.length} ${key}`, () => {
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(() => parseEntity(entry.source), entry.key).not.toThrow();
      }
    });
  }

  it("reads the stats the exporter recorded alongside each weapon", () => {
    // A real cross-check: the numbers came out of the Java objects, the parse comes out of their
    // text. If the field order is misread, these disagree.
    const arms = (
      content("arms.json") as {
        arms: { key: string; source: string; attack: number; defend: number; skill: number }[];
      }
    ).arms;
    for (const a of arms) {
      const e = parseEntity(a.source);
      expect(e.type, a.key).toBe("itArms");
      expect(e.name, a.key).toBe(a.key);
      expect(Number(e.fields[0]), a.key).toBe(a.attack);
      expect(Number(e.fields[1]), a.key).toBe(a.defend);
      expect(Number(e.fields[2]), a.key).toBe(a.skill);
    }
  });

  it("reads the stats the exporter recorded alongside each monster", () => {
    const monsters = (
      content("monsters.json") as {
        monsters: { key: string; source: string; guts: number; wits: number; charm: number }[];
      }
    ).monsters;
    for (const m of monsters) {
      const e = parseEntity(m.source);
      expect(e.type, m.key).toBe("itMonster");
      expect(Number(e.fields[0]), m.key).toBe(m.guts);
      expect(Number(e.fields[1]), m.key).toBe(m.wits);
      expect(Number(e.fields[2]), m.key).toBe(m.charm);
    }
  });
});
