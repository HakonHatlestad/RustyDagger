/**
 * Where you can go, what it takes to get there, and what you meet when you arrive.
 *
 * ## Encounters are weighted, not uniform
 *
 * Each area has its own table of creatures with a weight apiece, and picks against it — `arField`,
 * `arForest`, `arHills`, `arMound` and `arCastle` each hold one, and `WildsScreen.selectQuest` rolls
 * it. That is not a detail. The port used to pick uniformly from every monster carrying the area's
 * prefix, which is wrong twice over: the common creatures stopped being common, and **creatures
 * that are not random encounters at all started turning up**. The Dragon is not in the Hills table.
 * Neither is the Mound's Queen a third of the time. Measured, a level-10 character sent to the
 * Hills under the old uniform pick died in about four fights out of five and could never accumulate
 * enough gold to leave.
 *
 * The Fields go further and swap tables at level 3, so a new character meets rodents and merchants
 * and never a soldier. It is the only difficulty ramp in the original and it was missing entirely.
 *
 * ## Where the numbers come from
 *
 * Every weight below is the Java's, and so is every `weight` field — those are the arguments each
 * area passes to `new arQuest(...)`, not invented difficulty tiers. They decide what a kill is
 * worth, how fast a win teaches you, and how much Fame it carries.
 *
 * ## The way onward
 *
 * Six regions are locked behind a key item, and that ladder is what gold is for: both gear shops
 * together come to about three thousand Marks, and the ladder is fifty-eight thousand. Every one of
 * those items is in the 1997 gear table at exactly that price — this is the original's progression,
 * which the port had never connected to anything.
 */

export interface Encounter {
  readonly name: string;
  readonly weight: number;
}

export interface Region {
  readonly key: string;
  /** The prefix its monsters carry in the content, e.g. `Fields:Goblin`. */
  readonly prefix: string;
  readonly name: string;
  readonly blurb: string;
  /** What `arQuest` is given for this area, which scales experience, Fame and how fast you learn. */
  readonly weight: number;
  /**
   * Roughly when this becomes reasonable — used to order the list, and nothing else.
   *
   * Deliberately not shown to the player. What they see is {@link assess}, worked out against the
   * creatures actually in the table and against their own power, because a number written down
   * once cannot know about guild ranks or the stats a character grew by using them.
   */
  readonly advisedLevel: number;
  /** What you might meet, and how often. */
  readonly table: readonly Encounter[];
  /** A gentler table used below {@link RAMP_LEVEL}. Only the Fields has one. */
  readonly earlyTable?: readonly Encounter[];
  /** The item that opens it, kept rather than consumed — a map does not wear out. */
  readonly key_item: string | null;
}

/** The Fields use their gentler table below this level. `arField.pickQuest`. */
export const RAMP_LEVEL = 3;

/** One creature in a hundred is the Faery, wherever you are. `WildsScreen.selectQuest`. */
export const WANDERING = { name: "Faery", chance: 1 } as const;

function table(names: readonly string[], weights: readonly number[]): Encounter[] {
  return names.map((name, i) => ({ name, weight: weights[i] ?? 0 }));
}

export const REGIONS: readonly Region[] = [
  {
    key: "fields",
    prefix: "Fields",
    name: "The Fields",
    blurb:
      "Open country outside the walls. Rodents, goblins, and the occasional bad-tempered gypsy.",
    weight: 1,
    advisedLevel: 1,
    table: table(
      ["Rodent", "Goblin", "Centaur", "Merchant", "Wizard", "Gypsy", "Soldier"],
      [8, 6, 4, 5, 2, 5, 2],
    ),
    earlyTable: table(
      ["Rodent", "Goblin", "Centaur", "Merchant", "Wizard", "Gypsy", "Soldier"],
      [12, 10, 6, 10, 2, 1, 0],
    ),
    key_item: null,
  },
  {
    key: "forest",
    prefix: "Forest",
    name: "The Forest",
    blurb: "Old woods, and the paths through them are not yours. Orcs, elves, and worse things.",
    weight: 2,
    advisedLevel: 4,
    table: table(["Boar", "Orc", "Elf", "Gryphon", "Snot", "Unicorn"], [10, 9, 8, 6, 4, 3]),
    key_item: null,
  },
  {
    key: "mound",
    prefix: "Mound",
    name: "The Goblin Mound",
    blurb: "Warrens under the hill. Worms, thieves and a gang around every corner.",
    weight: 3,
    advisedLevel: 10,
    table: table(["Worm", "Thief", "Mage", "Gang", "Rager"], [5, 7, 3, 8, 4]),
    key_item: null,
  },
  {
    key: "dunjeon",
    prefix: "Dunjeon",
    name: "The Castle Dungeons",
    blurb: "Under Dragon Keep. Nobody has mapped these twice. Bring a torch and low expectations.",
    weight: 2,
    advisedLevel: 12,
    table: table(["Rodent", "Snot", "Rager", "Gang", "Troll", "Mage"], [7, 6, 5, 4, 3, 2]),
    key_item: "Castle Permit",
  },
  {
    key: "hills",
    prefix: "Hills",
    name: "The Hills",
    blurb: "Bare rock. Goats, trolls, and things with wings. The dragon does not come out for you.",
    weight: 3,
    // Measured, not guessed, and deliberately out of step with the 1997 map order: played through,
    // the Hills kill a hero that walks the Goblin Mound comfortably. A campaign that took them in
    // the old third slot met a 0.52 win rate and a 0.32 death rate, against 0.92 and 0.01 in the
    // Mound it was supposedly harder than. Its creatures are simply bigger -- a Giant carries 225
    // Guts where a Mound Rager carries 97 -- and this number only orders the list, so ordering it
    // by what actually happens is the honest thing.
    advisedLevel: 12,
    table: table(["Goat", "Basilisk", "Troll", "Wyvern", "Giant", "Sphinx"], [7, 5, 5, 4, 3, 3]),
    key_item: null,
  },
  {
    key: "vault",
    prefix: "Mound",
    name: "The Mound Treasury",
    blurb: "Deeper in, where the goblins keep what they have taken. Guards, and a vault.",
    weight: 3,
    advisedLevel: 13,
    table: table(["Worm", "Thief", "Mage", "Guard", "Vault"], [5, 5, 5, 7, 3]),
    key_item: "Map to Treasury",
  },
  {
    key: "ocean",
    prefix: "Ocean",
    name: "The Ocean",
    blurb: "A rutter is a book of sailing directions. Without one you are simply lost at sea.",
    weight: 3,
    advisedLevel: 15,
    table: table(["Traders", "Serpent", "Mermaid"], [5, 3, 2]),
    key_item: "Rutter for Hie Brasil",
  },
  {
    key: "throne",
    prefix: "Mound",
    name: "The Goblin Throne Room",
    blurb: "The bottom of the mound. A queen sits here, and she has been expecting somebody.",
    weight: 3,
    advisedLevel: 16,
    table: table(["Worm", "Thief", "Mage", "Queen", "Champ"], [5, 5, 5, 4, 2]),
    key_item: "Map to Throne Room",
  },
  {
    key: "brasil",
    prefix: "Brasil",
    name: "Hie Brasil",
    blurb:
      "An island that is not always there. Gladiators, golems, and something with snakes for hair.",
    weight: 4,
    advisedLevel: 20,
    table: table(["Harpy", "Fighter", "Golem", "Medusa", "Hero"], [6, 5, 4, 3, 2]),
    key_item: "Rutter for Hie Brasil",
  },
  {
    key: "shang",
    prefix: "Shang",
    name: "Shangala",
    blurb: "Further east than anyone sensible sails. A shogun there has heard of you.",
    weight: 5,
    advisedLevel: 25,
    table: table(
      ["Gunner", "Peasant", "Ninja", "Plague", "Shogun", "Panda", "Samurai"],
      [6, 7, 2, 6, 5, 3, 2],
    ),
    key_item: "Rutter for Shangala",
  },
];

/** How a region looks to a particular hero, right now. */
export type Verdict = "safe" | "fair" | "risky" | "deadly";

export interface Assessment {
  readonly verdict: Verdict;
  /** What to tell the player, in words rather than a number they cannot act on. */
  readonly advice: string;
}

/**
 * Whether going here is a good idea, worked out rather than written down.
 *
 * An earlier version of this carried a hand-picked "advised level" per region and printed it. That
 * was a guess, it did not survive contact with a character who had grown by use or bought guild
 * ranks, and a wrong warning is worse than none — it sends a player somewhere that empties their
 * purse and tells them it was fine.
 *
 * So it compares your power against the average of what actually lives there, scaled to your level
 * exactly as `balance` will scale it. Both sides use `powerOf`, which is the game's own way of
 * weighing two fighters, so the answer moves as you do.
 */
export function assess(yours: number, theirs: number): Assessment {
  if (theirs <= 0) {
    return { verdict: "fair", advice: "Nobody has been here recently." };
  }
  const ratio = yours / theirs;
  if (ratio >= 1.6) {
    return { verdict: "safe", advice: "You are more than a match for anything here." };
  }
  if (ratio >= 1.05) {
    return { verdict: "fair", advice: "You should manage, if you pick your fights." };
  }
  if (ratio >= 0.7) {
    return { verdict: "risky", advice: "An even match at best. Bring something to drink." };
  }
  return {
    verdict: "deadly",
    advice: `Badly outmatched — they are about ${String(Math.round(theirs / Math.max(1, yours)))} times your weight.`,
  };
}

export function regionByKey(key: string): Region {
  return REGIONS.find((r) => r.key === key) ?? REGIONS[0]!;
}

/** Whether a character holding these things can get in. */
export function canEnter(region: Region, carrying: readonly { name: string }[]): boolean {
  return region.key_item === null || carrying.some((c) => c.name === region.key_item);
}

/** The table in force for a character of this level. */
export function tableFor(region: Region, level: number): readonly Encounter[] {
  return level < RAMP_LEVEL && region.earlyTable !== undefined ? region.earlyTable : region.table;
}

/**
 * What you meet: one in a hundred is the wandering Faery, and the rest is the area's own table.
 *
 * Returns a content key, so an entry the exported content does not have simply cannot be chosen —
 * a table naming a creature that is not there would otherwise crash on arrival.
 */
export function pickEncounter(
  region: Region,
  level: number,
  known: ReadonlySet<string>,
  rng: { roll(n: number): number; percent(n: number): boolean },
): string | null {
  if (rng.percent(WANDERING.chance) && known.has(WANDERING.name)) {
    return WANDERING.name;
  }
  const choices = tableFor(region, level).filter(
    (e) => e.weight > 0 && known.has(`${region.prefix}:${e.name}`),
  );
  const total = choices.reduce((sum, e) => sum + e.weight, 0);
  if (total <= 0) {
    return null;
  }
  let roll = rng.roll(total);
  for (const choice of choices) {
    roll -= choice.weight;
    if (roll < 0) {
      return `${region.prefix}:${choice.name}`;
    }
  }
  return `${region.prefix}:${choices[choices.length - 1]!.name}`;
}
