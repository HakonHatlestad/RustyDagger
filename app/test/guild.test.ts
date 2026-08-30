import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadContent, type Content } from "../src/game/content.js";
import { apply, asFighter, characterFrom, toHero, type Game } from "../src/game/state.js";
import { parseHero } from "../src/game/hero.js";
import { newHeroText, backgroundByKey } from "../src/game/creation.js";
import { JOINING_FEE, canTrain, rankCost, refusal, totalRank } from "../src/game/guild.js";
import { rollLoot } from "../src/game/loot.js";
import { parseEntity } from "../src/format/parse.js";
import { GameRandom } from "../src/rules/random.js";

function json(path: string): never {
  return JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")) as never;
}

const content: Content = loadContent({
  arms: json("../../content/arms.json"),
  monsters: json("../../content/monsters.json"),
  gear: json("../../content/gear.json"),
});

function game(marks = 100000, level = 10): Game {
  const g: Game = {
    content,
    rng: new GameRandom(1),
    place: { kind: "guild" },
    character: characterFrom(parseHero(newHeroText("Rank", backgroundByKey("squire")))),
    quest: null,
    notices: [],
  };
  g.character!.marks = marks;
  g.character!.level = level;
  return g;
}

describe("joining", () => {
  it("costs the membership fee and lets you train", () => {
    const g = game();
    apply(g, { kind: "joinGuild" });
    expect(g.character!.marks).toBe(100000 - JOINING_FEE);
    expect(g.character!.traits.has("Guild")).toBe(true);
  });

  it("will not take money you do not have", () => {
    const g = game(10);
    apply(g, { kind: "joinGuild" });
    expect(g.character!.traits.has("Guild")).toBe(false);
    expect(g.character!.marks).toBe(10);
  });

  it("will not charge you twice", () => {
    const g = game();
    apply(g, { kind: "joinGuild" });
    const after = g.character!.marks;
    apply(g, { kind: "joinGuild" });
    expect(g.character!.marks).toBe(after);
  });

  it("turns nobody away without saying why", () => {
    expect(refusal({ fight: 0, magic: 0, thief: 0 }, 5, false, 10)).toContain("Membership");
    expect(refusal({ fight: 0, magic: 0, thief: 0 }, 5, false, 99999)).toContain("joined");
    expect(refusal({ fight: 5, magic: 0, thief: 0 }, 5, true, 99999)).toContain("level");
    expect(refusal({ fight: 1, magic: 0, thief: 0 }, 9, true, 10)).toContain("next rank");
    expect(refusal({ fight: 1, magic: 0, thief: 0 }, 9, true, 99999)).toBeNull();
  });
});

describe("ranks", () => {
  it("makes the first free and each one after it dearer", () => {
    expect(rankCost({ fight: 0, magic: 0, thief: 0 })).toBe(0);
    expect(rankCost({ fight: 1, magic: 0, thief: 0 })).toBe(1000);
    expect(rankCost({ fight: 2, magic: 1, thief: 0 })).toBe(3000);
  });

  it("is what the money is actually for: a rank shows up in the numbers at once", () => {
    // A Pedlar, whose traits are Merchant and Stubborn -- neither touches the combat stats. A
    // Squire would pass too, but not by one: Strong and Sturdy take a tenth of the rank as well.
    const g = game();
    g.character!.traits = new Set(["Merchant"]);
    apply(g, { kind: "joinGuild" });
    const before = asFighter(g.character!);
    apply(g, { kind: "train", track: "fight" });
    expect(asFighter(g.character!).attack).toBe(before.attack + 1);
    apply(g, { kind: "train", track: "thief" });
    expect(asFighter(g.character!).defend).toBe(before.defend + 1);
    apply(g, { kind: "train", track: "magic" });
    expect(asFighter(g.character!).skill).toBe(before.skill + 1);
  });

  it("lets you choose what kind of stronger you get, which levelling does not", () => {
    const g = game();
    apply(g, { kind: "joinGuild" });
    for (let i = 0; i < 5; i++) {
      apply(g, { kind: "train", track: "fight" });
    }
    expect(g.character!.ranks).toEqual({ fight: 5, magic: 0, thief: 0 });
    expect(asFighter(g.character!).attack).toBeGreaterThan(4);
  });

  it("will not sell you more ranks than your level", () => {
    const g = game(100000, 3);
    apply(g, { kind: "joinGuild" });
    for (let i = 0; i < 10; i++) {
      apply(g, { kind: "train", track: "fight" });
    }
    expect(totalRank(g.character!.ranks)).toBe(3);
  });

  it("will not train someone who never joined", () => {
    const g = game();
    apply(g, { kind: "train", track: "fight" });
    expect(totalRank(g.character!.ranks)).toBe(0);
    expect(g.notices.join(" ")).toContain("joined");
  });

  it("takes no money when it refuses", () => {
    const g = game(100000, 1);
    apply(g, { kind: "joinGuild" });
    apply(g, { kind: "train", track: "fight" });
    const after = g.character!.marks;
    apply(g, { kind: "train", track: "magic" });
    expect(g.character!.marks).toBe(after);
  });

  it("survives a trip through a save file", () => {
    const g = game();
    apply(g, { kind: "joinGuild" });
    apply(g, { kind: "train", track: "magic" });
    apply(g, { kind: "train", track: "thief" });
    const again = characterFrom(toHero(g.character!));
    expect(again.ranks).toEqual({ fight: 0, magic: 1, thief: 1 });
    expect(again.traits.has("Guild")).toBe(true);
  });

  it("agrees with canTrain about who it will teach", () => {
    expect(canTrain({ fight: 0, magic: 0, thief: 0 }, 1, true, 0)).toBe(true);
    expect(canTrain({ fight: 1, magic: 0, thief: 0 }, 1, true, 99999)).toBe(false);
    expect(canTrain({ fight: 0, magic: 0, thief: 0 }, 1, false, 99999)).toBe(false);
  });
});

describe("what was retired", () => {
  it("never drops a letter to a player who cannot exist", () => {
    // Clan-hall mail: Letter, Postcard, Petition, Denial, Grant. Nobody is there to read them.
    const carrier = parseEntity(
      "{itMonster|Postman|10|10|10|1|1|1|{~|pack|{#|Letter|3}|{#|Postcard|3}|{#|Petition|3}|" +
        "{#|Denial|3}|{#|Grant|3}|{#|Thief Insurance|1}|{#|Marks|5}}}",
    );
    const rng = new GameRandom(2);
    const loot = rollLoot(carrier, content, rng);
    const names = loot.items.map((i) => i.name);
    for (const dead of ["Letter", "Postcard", "Petition", "Denial", "Grant"]) {
      expect(names, dead).not.toContain(dead);
    }
    // But the two that still do something are still handed over.
    expect(names).toContain("Thief Insurance");
    expect(loot.marks).toBe(5);
  });
});
