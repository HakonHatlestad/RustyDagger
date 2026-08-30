package DCourt.Harness;

import DCourt.Items.List.itHero;
import DCourt.Items.List.itMonster;
import DCourt.Screens.Quest.BattleAccess;
import DCourt.Screens.Quest.arBattle;
import DCourt.Screens.Quest.arQuest;
import DCourt.Tools.Tools;
import java.io.PrintWriter;
import java.util.List;

/**
 * Whole-system behaviour, measured rather than replayed.
 *
 * <p>This is the half of parity that is checked by shape, not by equality. A rewrite is entitled to
 * call the random generator in a different order from AWT-coupled 1997 code — indeed it cannot
 * avoid it, since {@code arBattle}'s constructor consumes randomness on its way past the portraits.
 * So demanding identical transcripts would fail a correct port for a reason that has nothing to do
 * with the rules.
 *
 * <p>What must hold is that the game plays the same: you hit about as often, fights last about as
 * long, monsters drop about as much. Samples are large enough that a real rule change moves a
 * number well outside sampling noise, and the seeds are fixed so the figures here are themselves
 * reproducible.
 */
final class Distributions {

  /** Large enough that a percentage point is signal rather than noise. */
  private static final int TRIALS = 20000;

  /** Fights are capped so a stalemate cannot hang the recording. */
  private static final int MAX_ROUNDS = 60;

  private Distributions() {}

  static void write(PrintWriter w) {
    w.println("# Distributions -- checked by SHAPE, not equality.");
    w.println("# A port may consume randomness in a different order; it may not play differently.");
    w.println("# Percentages are over " + TRIALS + " trials at fixed seeds.");
    w.println();
    hitRates(w);
    fights(w);
  }

  /**
   * Hit chance across the Skill matchups the game reaches. This is the table that shows the rule
   * saturating — every row where the attacker's Skill is at or above the defender's reads 100.
   */
  private static void hitRates(PrintWriter w) {
    w.println("== HIT RATE BY SKILL MATCHUP (attacker skill vs defender skill) ==");
    int[] skills = {1, 5, 10, 20, 40, 80, 160, 320};
    for (int as : skills) {
      StringBuilder row = new StringBuilder();
      for (int ds : skills) {
        Tools.setSeed(20260830);
        int hits = 0;
        for (int i = 0; i < TRIALS; i++) {
          if (Tools.roll(ds) <= as) {
            hits++;
          }
        }
        row.append(String.format("%4d", (hits * 100) / TRIALS));
      }
      w.println(String.format("as=%-4d ->%s", as, row));
    }
    w.println();
  }

  /**
   * Complete fights, not opening rounds. The first version of this harness recorded 1,980 first
   * rounds and never once saw a fight finish, so nothing about wound accumulation, fleeing or death
   * was captured at all.
   */
  private static void fights(PrintWriter w) {
    w.println("== FIGHT OUTCOMES (complete fights, per monster and hero build) ==");
    int[][] builds = {
      {10, 10, 10, 5, 5, 5},
      {30, 20, 20, 20, 15, 25},
      {80, 40, 40, 60, 50, 70},
      {200, 90, 90, 150, 120, 180},
    };
    List<String> monsters = Harness.monsterKeys();
    for (String key : monsters) {
      for (int b = 0; b < builds.length; b++) {
        int[] v = builds[b];
        int runs = 200;
        java.util.Map<String, Integer> tally = new java.util.TreeMap<>();
        long totalRounds = 0;
        for (int i = 0; i < runs; i++) {
          Tools.setSeed(1000 + i);
          Outcome o = oneFight(v, key);
          if (o == null) {
            continue;
          }
          totalRounds += o.rounds();
          tally.merge(o.ending(), 1, Integer::sum);
        }
        StringBuilder endings = new StringBuilder();
        for (java.util.Map.Entry<String, Integer> e : tally.entrySet()) {
          endings.append(' ').append(e.getKey()).append('=').append(pct(e.getValue(), runs));
        }
        w.println(
            "monster=" + key + " build=" + b + endings + " meanRounds=" + (totalRounds / runs));
      }
    }
    w.println();
  }

  private static String pct(int n, int of) {
    return ((n * 100) / of) + "%";
  }

  /** Drives the loop {@code arQuest.battleActionResult} drives when a player keeps clicking. */
  private static Outcome oneFight(int[] build, String key) {
    itHero h = Harness.hero("F", build[0], build[1], build[2], build[3], build[4], build[5]);
    itMonster proto = Harness.monster(key);
    if (proto == null) {
      return null;
    }
    try {
      arQuest q = new arQuest(null, 3, "fight", proto);
      itMonster mob = q.getMob();
      int rounds = 0;
      while (rounds < MAX_ROUNDS) {
        new arBattle(q, "fight");
        rounds++;
        // The same six-way branch arQuest.battleActionResult takes. Being mesmerised or
        // swindled ends a fight just as surely as dying; lumping those in with "ran out of
        // rounds" hid an entire class of outcome behind a cap that was never reached.
        String ending = ending(h, mob);
        if (ending != null) {
          return new Outcome(rounds, ending);
        }
        h.resetActions();
        BattleAccess.nextRound(q, h, mob);
        mob.resetActions();
        mob.chooseActions(false);
      }
      return new Outcome(rounds, "roundCap");
    } catch (RuntimeException e) {
      return null;
    }
  }

  /** The branch arQuest takes when a round ends, in the order it tests them. */
  private static String ending(itHero h, itMonster mob) {
    if (h.isDead()) {
      return "heroDied";
    }
    if (h.isControl()) {
      return "heroControlled";
    }
    if (h.isSwindle()) {
      return "heroSwindled";
    }
    if (mob.isDead()) {
      return "heroWon";
    }
    if (mob.isControl()) {
      return "mobControlled";
    }
    if (mob.isSwindle()) {
      return "mobSwindled";
    }
    return null;
  }

  private record Outcome(int rounds, String ending) {}
}
