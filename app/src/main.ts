/**
 * Starting the game in a browser.
 *
 * The content files are the ones the Java build exports, served as-is. They are copied into
 * `public/` by `pnpm sync-content` so the dev server and the built bundle both see the same data
 * the parity tests read.
 *
 * This is also where saving is wired in. Every move goes through one dispatcher in `render`, so
 * autosaving is a single hook there rather than a call at each of thirty call sites — the same
 * chokepoint argument that made autosave a four-line change in the Java build.
 */

import { loadContent } from "./game/content.js";
import { characterFrom, type Game } from "./game/state.js";
import {
  browserStore,
  clearSave,
  exportText,
  importText,
  loadSaved,
  saveCharacter,
} from "./game/save.js";
import { GameRandom } from "./rules/random.js";
import { initialUi, render } from "./ui/render.js";

async function fetchJson(path: string): Promise<never> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`could not load ${path}: ${String(response.status)}`);
  }
  return (await response.json()) as never;
}

/** Offers the character as a `.hero` file, which the Java build can also read. */
function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name.replace(/[^\w-]+/g, "_")}.hero`;
  link.click();
  URL.revokeObjectURL(url);
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

  const store = browserStore();
  const saved = loadSaved(store);

  const game: Game = {
    content: loadContent({ arms, monsters, gear }),
    // Seeded from the clock so each session differs, as the original did.
    rng: new GameRandom(Date.now() & 0x7fffffff),
    // No save means no character yet, and the first thing to do is make one.
    place: saved === null ? { kind: "creation" } : { kind: "town" },
    character: saved === null ? null : characterFrom(saved),
    quest: null,
    notices: [],
  };

  const ui = initialUi();
  const autosave = (): void => {
    if (game.character !== null) {
      saveCharacter(store, game.character);
    }
  };
  const draw = (): void => {
    render(root, game, ui, autosave);
  };

  wireToolbar(game, store, draw);
  draw();
}

/** The bits that sit outside the game itself: keeping a copy, and starting over. */
function wireToolbar(game: Game, store: ReturnType<typeof browserStore>, draw: () => void): void {
  const save = document.getElementById("export-save");
  save?.addEventListener("click", () => {
    if (game.character !== null) {
      download(game.character.name, exportText(game.character));
    }
  });

  const load = document.getElementById("load-save");
  const picker = document.getElementById("load-file");
  load?.addEventListener("click", () => {
    (picker as HTMLInputElement | null)?.click();
  });
  picker?.addEventListener("change", () => {
    const input = picker as HTMLInputElement;
    const file = input.files?.[0];
    if (file === undefined) {
      return;
    }
    void file.text().then((text) => {
      const result = importText(text);
      // The picker is cleared either way, or choosing the same file twice does nothing.
      input.value = "";
      if ("error" in result) {
        window.alert(result.error);
        return;
      }
      if (
        game.character !== null &&
        !window.confirm(`Replace ${game.character.name} with ${result.hero.name}?`)
      ) {
        return;
      }
      game.character = characterFrom(result.hero);
      game.quest = null;
      game.notices = [`${result.hero.name} takes over.`];
      game.place = { kind: "town" };
      saveCharacter(store, game.character);
      draw();
    });
  });

  const fresh = document.getElementById("new-game");
  fresh?.addEventListener("click", () => {
    // Destructive and irreversible, so it asks — and it offers the old character first.
    if (game.character !== null && !window.confirm("Abandon this character and start again?")) {
      return;
    }
    game.character = null;
    game.quest = null;
    game.notices = [];
    game.place = { kind: "creation" };
    clearSave(store);
    draw();
  });
}

start().catch((error: unknown) => {
  const root = document.getElementById("app");
  if (root !== null) {
    root.textContent = `Could not start: ${error instanceof Error ? error.message : String(error)}`;
  }
});
