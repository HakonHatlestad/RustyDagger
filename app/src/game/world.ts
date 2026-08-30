/**
 * Where you can go hunting.
 *
 * The exported content already holds every monster in the 1997 game, grouped by the area it belongs
 * to, so opening the other regions costs nothing but naming them. They are ordered by how hard they
 * hit, and each says what level it suits — the game has no other way to warn you, and the Hills
 * will kill a new character inside two rounds.
 *
 * `weight` is the quest's depth, which the game folds into how much Fame killing something is
 * worth. It is not a difficulty multiplier: what actually makes a region hard is the creatures in
 * it, which are far larger than the ones in the fields.
 */

export interface Region {
  readonly key: string;
  /** The prefix its monsters carry in the content, e.g. `Fields:Goblin`. */
  readonly prefix: string;
  readonly name: string;
  readonly blurb: string;
  readonly weight: number;
  /** The level from which this stops being suicide. */
  readonly advisedLevel: number;
}

export const REGIONS: readonly Region[] = [
  {
    key: "fields",
    prefix: "Fields",
    name: "The Fields",
    blurb:
      "Open country outside the walls. Rodents, goblins, and the occasional bad-tempered gypsy.",
    weight: 2,
    advisedLevel: 1,
  },
  {
    key: "forest",
    prefix: "Forest",
    name: "The Forest",
    blurb: "Old woods, and the paths through them are not yours. Orcs, elves, and worse things.",
    weight: 3,
    advisedLevel: 4,
  },
  {
    key: "hills",
    prefix: "Hills",
    name: "The Hills",
    blurb: "Bare rock. What lives up here has been here a long time, and includes a dragon.",
    weight: 4,
    advisedLevel: 10,
  },
  {
    key: "mound",
    prefix: "Mound",
    name: "The Goblin Mound",
    blurb: "Warrens under the hill. Everything inside wants what you are carrying.",
    weight: 5,
    advisedLevel: 8,
  },
];

export function regionByKey(key: string): Region {
  return REGIONS.find((r) => r.key === key) ?? REGIONS[0]!;
}
