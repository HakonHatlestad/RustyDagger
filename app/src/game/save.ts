/**
 * Keeping a character between sessions.
 *
 * The port could already read a `.hero` save and write one back, and did neither after the first
 * load — so a session's marks, loot and levels vanished on refresh. This is the missing half: one
 * place that knows where a character lives and when to write it.
 *
 * The stored text is the same `{type|field|field}` a `.hero` file holds, not JSON, so a character
 * can be pasted straight into the Java build and back again.
 */

import { parseHero, serialiseHero, SaveFormatError, type Hero } from "./hero.js";
import { toHero, type Character } from "./state.js";

export const SAVE_KEY = "rustydagger.hero";

/** Somewhere to put a save. The browser has one; a test wants a plain object. */
export interface SaveStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The browser's storage, or nothing.
 *
 * Private-browsing modes throw on the first touch of `localStorage` rather than returning null, so
 * the whole game would fail to start over a feature it can do without. It degrades to not saving.
 */
export function browserStore(): SaveStore | null {
  try {
    const probe = "rustydagger.probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Reads the stored character, or null when there is none or it is unreadable. */
export function loadSaved(store: SaveStore | null): Hero | null {
  if (store === null) {
    return null;
  }
  const text = store.getItem(SAVE_KEY);
  if (text === null || text.trim() === "") {
    return null;
  }
  try {
    return parseHero(text);
  } catch (error) {
    // A save we cannot read is kept, not overwritten: it is the player's only copy, and a parser
    // bug that silently ate characters would be far worse than starting a new one.
    if (error instanceof SaveFormatError) {
      return null;
    }
    return null;
  }
}

export function saveCharacter(store: SaveStore | null, character: Character): void {
  if (store === null) {
    return;
  }
  store.setItem(SAVE_KEY, serialiseHero(toHero(character)));
}

export function clearSave(store: SaveStore | null): void {
  store?.removeItem(SAVE_KEY);
}

/** A character as downloadable `.hero` text, for keeping a copy or moving between machines. */
export function exportText(character: Character): string {
  return serialiseHero(toHero(character));
}
