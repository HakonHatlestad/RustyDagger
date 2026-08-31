/**
 * Paying to make yourself harder, which is what a long campaign's winnings are actually for.
 *
 * ## Why the smith was not enough
 *
 * `forge.ts` sells points of Attack and Defence, and those are the wrong axis at depth. Measured
 * against what lives in the far regions at level 21, a hero with the best weapon in the shops wins
 * 2% of fights in the Ocean and dies in 82% of them. Nineteen reforgings — three hundred and
 * seventy thousand Marks — moved that not at all.
 *
 * The reason is in the numbers the deep monsters carry. A Shangala Samurai has 508 Guts and 514
 * Skill; a Shogun has 601 Skill. A level-21 hero has 60 Guts and 41 Skill before gear. Whether a
 * blow lands is Skill against Skill, and how hard it hits is mostly Guts, so a point of Attack is
 * rounding error out there. Measured, giving that same hero 300 Guts takes the Ocean from a 2% win
 * rate to 47%; 300 Guts *and* 300 Wits takes it to 88%. Wits alone does almost nothing, because
 * Skill is two parts Wits to one part Charm and one part of three is not a gate.
 *
 * So: the sink that matters raises the three base stats, and both of the stats that gate depth are
 * bought the same way. That is also what keeps Wits and Charm live decisions rather than numbers
 * you were dealt at creation.
 *
 * ## The price
 *
 * Ten Marks for every point you already have, so the next point of Guts costs ten times your Guts.
 * The total to go from a starting hero to 300 in one stat is a little over four hundred thousand
 * Marks, which is about what a long campaign in the Goblin Mound pays — deliberately, so the deep
 * regions are entered by a character who earned their way there rather than one who waited.
 *
 * It is endless in the way the game is endless: the cost of a stat rises with the stat, so the
 * total to reach any level is quadratic and no purse ever outruns it.
 *
 * These prices are design judgement, not ported values — the Java has no such service.
 */

/** Marks per point of the stat you already have. */
export const HARDEN_RATE = 10;

/** The three things you can buy, which are the three the game actually has. */
export const TRAINABLE = [
  {
    key: "guts",
    name: "Guts",
    what: "Health, and most of what a blow is worth. The stat that decides whether you can be out there at all.",
  },
  {
    key: "wits",
    name: "Wits",
    what: "Two parts of three of your Skill, which is what decides whether a blow lands. Also hypnosis, and how well a scroll takes.",
  },
  {
    key: "charm",
    name: "Charm",
    what: "The last part of Skill, what a shop will pay you, and whether you can talk your way out.",
  },
] as const;

export type TrainableKey = (typeof TRAINABLE)[number]["key"];

/** What the next point costs, given where the stat stands now. */
export function hardenCost(current: number): number {
  const cost = current * HARDEN_RATE;
  return cost < HARDEN_RATE ? HARDEN_RATE : cost;
}

/** Why the trainer would turn you away, or null if they would not. */
export function refusal(current: number, marks: number): string | null {
  const cost = hardenCost(current);
  if (marks < cost) {
    return `That is ${String(cost)} Marks of work, and you have ${String(marks)}.`;
  }
  return null;
}
