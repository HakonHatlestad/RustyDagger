/**
 * What a monster was carrying, and what you get for killing it.
 *
 * Every monster in the content has a pack and a gear list. The pack is what it is carrying — coins,
 * gems, potions — and the gear is what it is wielding, which also drops. Neither is a fixed list:
 * each entry is a chance or a range, rolled when the fight ends.
 *
 * The three token types mean different things and getting them backwards changes the economy:
 * `{@|Marks|25}` is *up to* 25 and a bit, `{%|Quartz|50}` is a coin flip weighted to 50, and
 * `{#|Cookie|3}` is exactly three.
 */

import type { Entity, Field } from "../format/parse.js";
import type { GameRandom } from "../rules/random.js";
import { armsOf, type Content } from "./content.js";
import type { Carried } from "./hero.js";

/** How many of a token to make, which depends on which kind it is. */
export function makeCount(type: string, count: number, rng: GameRandom): number {
  switch (type) {
    // A range: anything from none up to the stated number.
    case "itRandom":
      return rng.roll(1 + count);
    // A chance in a hundred of exactly one.
    case "itPercent":
      return rng.percent(count) ? 1 : 0;
    // Exactly what it says.
    default:
      return count;
  }
}

function isEntity(field: Field): field is Entity {
  return typeof field !== "string";
}

function listNamed(entity: Entity, name: string): Entity | null {
  for (const field of entity.fields) {
    if (isEntity(field) && field.type === "itList" && field.name === name) {
      return field;
    }
  }
  return null;
}

/**
 * Things that only ever meant anything between two players.
 *
 * The clan hall let you write to people: a Letter, a Postcard, a Petition to join their guild, a
 * Denial or a Grant in reply. There is nobody to write to, and a note addressed to a player who
 * cannot exist is not a collectible, it is a loose end. They are dropped on the floor rather than
 * into your pack.
 *
 * Two items that look like they belong on this list are deliberately *not* on it. **Thief
 * Insurance** stops a monster swindling you, which is a live rule again now that being swindled
 * costs something. **Bottled Faery** comes out of a single-player encounter in `arQuest`. Both are
 * real; only the post is dead.
 */
const PLAYER_MAIL = new Set(["Letter", "Postcard", "Petition", "Denial", "Grant"]);

export interface Loot {
  readonly marks: number;
  readonly items: readonly Carried[];
}

/**
 * Rolls what actually drops.
 *
 * Weapons and armour are chancier than supplies, and silver gear chancier still — a silver piece
 * has to pass its own roll and then a further one in ten, which is what keeps it rare.
 */
export function rollLoot(monster: Entity, content: Content, rng: GameRandom): Loot {
  let marks = 0;
  const items: Carried[] = [];

  const take = (entry: Field): void => {
    if (!isEntity(entry)) {
      return;
    }
    const payload = entry.fields[0];
    const count = typeof payload === "string" ? Number(payload) : 0;
    const name = entry.name;

    const weapon = content.weapons.get(name);
    if (weapon !== undefined) {
      // Equipment: the listed percentage chance, and that is the whole of it.
      //
      // The 1997 rule put a further one-in-ten on anything silver, which made the best gear in the
      // game a 0.1% drop off a 1% listing. That is a sensible rate for a game played daily for
      // months and an unreachable one here: measured, a Silver Gladius or Masamune never appeared
      // across three hundred loot rolls of every monster that can carry one. The same reasoning
      // that removed the daily quest ration applies -- this build's campaign is compressed, so a
      // rate tuned to 1997's pacing is not the same rate. See `docs/porting-notes.md`.
      if (!rng.percent(count)) {
        return;
      }
      items.push(armsOf(weapon));
      return;
    }

    const rolled = makeCount(entry.type, count, rng);
    if (rolled < 1 || PLAYER_MAIL.has(name)) {
      return;
    }
    if (name === "Marks") {
      marks += rolled;
      return;
    }
    items.push({ kind: "count", name, count: rolled });
  };

  for (const listName of ["pack", "gear"]) {
    const list = listNamed(monster, listName);
    if (list !== null) {
      for (const entry of list.fields) {
        take(entry);
      }
    }
  }

  return { marks, items };
}
