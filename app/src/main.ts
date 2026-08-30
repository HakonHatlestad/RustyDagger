/**
 * Starting the game in a browser.
 *
 * The content files are the ones the Java build exports, served as-is. They are copied into
 * `public/` by `pnpm sync-content` so the dev server and the built bundle both see the same data
 * the parity tests read.
 */

import { loadContent } from "./game/content.js";
import { characterFrom, type Game } from "./game/state.js";
import { parseHero } from "./game/hero.js";
import { GameRandom } from "./rules/random.js";
import { render, type UiState } from "./ui/render.js";

/**
 * A brand-new character.
 *
 * Starts with Marks and nothing else, which is how the original works: character creation hands you
 * money and you go and buy a weapon. That matters more than it sounds -- measured over 200 first
 * fights, a hero with no weapon at all dies more often than not, because Attack comes entirely from
 * what you are holding.
 */
const NEW_HERO =
  "{itHero|Wanderer|12|10|8|{~|pack|{#|Marks|250}}|{~|gear}|{~|stat|{#|Age|16}}|{~|temp}|{~|rank|{#|Level|1}}|{~|values|{=|state|Alive}|{=|place|fields}}}";

async function fetchJson(path: string): Promise<never> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`could not load ${path}: ${String(response.status)}`);
  }
  return (await response.json()) as never;
}

async function start(): Promise<void> {
  const root = document.getElementById("app");
  if (root === null) {
    throw new Error("no #app element to render into");
  }

  const [arms, monsters, gear] = await Promise.all([
    fetchJson("arms.json"),
    fetchJson("monsters.json"),
    fetchJson("gear.json"),
  ]);

  const saved = localStorage.getItem("rustydagger.hero");
  const hero = parseHero(saved ?? NEW_HERO);

  const game: Game = {
    content: loadContent({ arms, monsters, gear }),
    // Seeded from the clock so each session differs, as the original did.
    rng: new GameRandom(Date.now() & 0x7fffffff),
    place: { kind: "fields" },
    character: characterFrom(hero),
    quest: null,
    notices: [],
  };

  const ui: UiState = { selected: null };
  render(root, game, ui);
}

start().catch((error: unknown) => {
  const root = document.getElementById("app");
  if (root !== null) {
    root.textContent = `Could not start: ${error instanceof Error ? error.message : String(error)}`;
  }
});
