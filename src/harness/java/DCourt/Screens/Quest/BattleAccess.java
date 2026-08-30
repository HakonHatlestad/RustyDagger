package DCourt.Screens.Quest;

import DCourt.Items.List.itAgent;
import DCourt.Items.List.itMonster;
import java.lang.reflect.Field;

/**
 * Reaches the combat resolver directly, with every input stated rather than emerging from a
 * constructor.
 *
 * <p>{@code arBattle.battle()} and {@code agentAct()} are package-private, so this shim lives in
 * the game's package while belonging to the harness source set — it never ships in the game jar. It
 * exists because characterising combat end-to-end conflates two different things: the rules, which
 * the port must reproduce, and the order in which the surrounding code happens to consume the
 * random generator, which it must not be forced to. Calling {@code agentAct} with explicit
 * arguments separates them.
 */
public final class BattleAccess {

  private BattleAccess() {}

  /**
   * One attack, with all six inputs supplied.
   *
   * @return the battle text; the numeric outcome is read from the defender's wounds and state.
   */
  public static String act(
      arBattle b, itAgent attacker, itAgent defender, int guts, int swings, int as, int ds) {
    return b.agentAct(attacker, defender, guts, swings, as, ds);
  }

  /** One full round, both sides, exactly as a quest would run it. */
  public static String round(arBattle b, itAgent hero, itAgent mob) {
    return b.battle(hero, mob);
  }

  /** {@code arBattle} latches this when someone dies; clear it before reusing an instance. */
  public static void resetKillStop(arBattle b) {
    b.killStop = false;
  }

  /** The monster the quest actually fights — a balanced copy of the prototype handed in. */
  public static itMonster combatant(arQuest q) {
    return q.getMob();
  }

  /**
   * Whether the monster has decided to run, which ends the encounter before a round happens.
   *
   * <p>{@code arQuest} returns {@code mobFlees()} the moment the chosen action is Runaway, before
   * any blow is struck. A fight driver that skips this records a game in which timid creatures
   * stand and fight to the death, which is a different and far deadlier game.
   */
  public static boolean fleeing(itMonster mob) {
    return mob.getActions().isMatch(DCourt.Static.Constants.RUNAWAY);
  }

  /**
   * Advances the round the way {@code arQuest.battleActionResult} does. This is not presentation:
   * {@code Options.nextRound} calls {@code incStance} on hostile and defensive monsters, so
   * skipping it would quietly record a different game.
   */
  public static void nextRound(arQuest q, DCourt.Items.List.itHero hero, itMonster mob) {
    try {
      Field f = arQuest.class.getDeclaredField("opt");
      f.setAccessible(true);
      ((Options) f.get(q)).nextRound(hero, mob);
    } catch (ReflectiveOperationException e) {
      throw new IllegalStateException("could not advance the round", e);
    }
  }
}
