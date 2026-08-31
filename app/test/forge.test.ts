import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadContent, type Content } from "../src/game/content.js";
import { apply, asFighter, characterFrom, toHero, type Game } from "../src/game/state.js";
import { parseHero } from "../src/game/hero.js";
import { newHeroText, backgroundByKey } from "../src/game/creation.js";
import { WEAPON_SHOP, stockOf } from "../src/game/shop.js";
import { GameRandom } from "../src/rules/random.js";
import { FORGE_BASE, forgeCost } from "../src/game/forge.js";
import { serialiseHero } from "../src/game/hero.js";

/**
 * The late-game money sink.
 *
 * Marks used to have nowhere to go: both gear shops come to about three thousand, the region
 * ladder to forty and a half, and a long campaign simply accumulated past both. A game with no
 * ending needs a sink with no bottom.
 */
function json(path: string): never {
  return JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")) as never;
}
const content: Content = loadContent({
  arms: json("../../content/arms.json"),
  monsters: json("../../content/monsters.json"),
  gear: json("../../content/gear.json"),
});

function armedHero(marks: number): Game {
  const game: Game = {
    content,
    rng: new GameRandom(7),
    place: { kind: "town" },
    character: characterFrom(parseHero(newHeroText("Smith", backgroundByKey("squire")))),
    quest: null,
    notices: [],
  };
  const character = game.character!;
  const sword = stockOf(content, WEAPON_SHOP).find((r) => r.name === "Long Sword")!;
  apply(game, { kind: "buy", shop: WEAPON_SHOP.key, name: sword.name });
  const index = character.pack.findIndex((c) => c.name === sword.name);
  apply(game, { kind: "equip", index });
  character.marks = marks;
  return game;
}

describe("paying a smith, which is what late money is for", () => {
  it("puts a permanent point of Attack on what you are wearing", () => {
    const game = armedHero(10_000);
    const before = asFighter(game.character!).attack;
    apply(game, { kind: "forge", service: "forged" });
    expect(asFighter(game.character!).attack).toBe(before + 1);
    expect(game.character!.marks).toBe(10_000 - FORGE_BASE);
  });

  it("costs half again as much every time, so no purse ever outruns it", () => {
    expect(forgeCost(0)).toBe(FORGE_BASE);
    expect(forgeCost(1)).toBe(3000);
    expect(forgeCost(2)).toBe(4500);
    // Twenty reforgings costs more than six million Marks: the curve has no ceiling, which is the
    // whole point of it for a game that never ends.
    expect(forgeCost(20)).toBeGreaterThan(6_000_000);
  });

  it("turns you away rather than going into debt", () => {
    const game = armedHero(500);
    apply(game, { kind: "forge", service: "forged" });
    expect(game.character!.marks).toBe(500);
    expect(game.notices.join(" ")).toContain("2000 Marks");
  });

  it("survives a save and reload, because it is stored inside the item", () => {
    const game = armedHero(10_000);
    apply(game, { kind: "forge", service: "forged" });
    apply(game, { kind: "forge", service: "forged" });
    const attack = asFighter(game.character!).attack;
    const text = serialiseHero(toHero(game.character!));
    const reloaded = characterFrom(parseHero(text));
    expect(asFighter(reloaded).attack).toBe(attack);
  });

  it("leaves an unforged weapon byte for byte what it was", () => {
    // The count is only written when there is one, so an ordinary sword round-trips unchanged and
    // the save format needs no version bump.
    const game = armedHero(10_000);
    const text = serialiseHero(toHero(game.character!));
    expect(text).not.toContain("Forged");
  });
});
