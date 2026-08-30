/**
 * The Adventurer's Guild.
 *
 * Guild ranks are a whole progression axis that already feeds the combat maths and that nothing in
 * the rewrite granted, so a third of the character sheet sat inert: `calcCombat` adds `fightRank`
 * to Attack, `thiefRank` to Defence and `magicRank` to Skill, and every hero passed zero for all
 * three.
 *
 * It matters more here than it did in 1997. Levelling grants a flat +2 to every stat however you
 * play; ranks are bought, one at a time, in whichever of three directions you choose. Together with
 * the stat you grow by *how you win* (`rules/growth.ts`), that is what makes one hero different
 * from another.
 *
 * The numbers are `arGuild`'s: 4,000 Marks to join, then `rank × 1000` for each rank after the
 * first, which is free.
 */

/** The three things the guild teaches, and what each one buys you. */
export const TRACKS = [
  {
    key: "fight",
    name: "Fighting",
    /** Every rank is a flat point of this stat, through `calcCombat`. */
    effect: "+1 Attack per rank.",
    blurb: "Drills in the yard until the swing stops being a decision.",
  },
  {
    key: "thief",
    name: "Thieving",
    effect: "+1 Defence per rank.",
    blurb: "Not stealing — noticing. Where the blow is coming from, and being elsewhere.",
  },
  {
    key: "magic",
    name: "Magic",
    effect: "+1 Skill per rank, which is what decides whether you land a blow at all.",
    blurb: "Less spellcasting than knowing which way the world leans.",
  },
] as const;

export type TrackKey = (typeof TRACKS)[number]["key"];

export const JOINING_FEE = 4000;

/** Ranks held, by track. */
export interface Ranks {
  fight: number;
  magic: number;
  thief: number;
}

export function totalRank(ranks: Ranks): number {
  return ranks.fight + ranks.magic + ranks.thief;
}

/**
 * What the next rank costs: `guildRank * 1000`, so the first is free and each one after is dearer.
 *
 * Free-then-steepening is what stops the guild being a flat money tax and makes it a decision about
 * *which* track to put money into.
 */
export function rankCost(ranks: Ranks): number {
  return totalRank(ranks) * 1000;
}

/**
 * Whether the guild will teach you anything more.
 *
 * You may not hold more ranks in total than your level, which is what ties the two halves of
 * progression together: money alone cannot buy a rank, you have to have earned the level to hold
 * it. That gate is `arGuild.updateTools`, minus its check on the day's remaining quests.
 */
export function canTrain(ranks: Ranks, level: number, member: boolean, marks: number): boolean {
  return member && totalRank(ranks) < level && marks >= rankCost(ranks);
}

export function canJoin(member: boolean, marks: number): boolean {
  return !member && marks >= JOINING_FEE;
}

/** Why the guild will not teach you, in words a player can act on. */
export function refusal(
  ranks: Ranks,
  level: number,
  member: boolean,
  marks: number,
): string | null {
  if (!member) {
    return marks >= JOINING_FEE
      ? "They will teach you nothing until you have joined."
      : `Membership is ${String(JOINING_FEE)} Marks. You have ${String(marks)}.`;
  }
  if (totalRank(ranks) >= level) {
    return `You hold ${String(totalRank(ranks))} ranks and are level ${String(level)}. Come back when you have grown into another.`;
  }
  if (marks < rankCost(ranks)) {
    return `The next rank is ${String(rankCost(ranks))} Marks. You have ${String(marks)}.`;
  }
  return null;
}
