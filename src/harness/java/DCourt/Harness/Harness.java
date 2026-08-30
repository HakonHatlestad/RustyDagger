package DCourt.Harness;

import DCourt.Control.ArmsTable;
import DCourt.Control.MonsterTable;
import DCourt.Control.Player;
import DCourt.DCourtPanel;
import DCourt.Items.List.itAgent;
import DCourt.Items.List.itArms;
import DCourt.Items.List.itHero;
import DCourt.Items.List.itMonster;
import DCourt.Screens.Quest.arBattle;
import DCourt.Static.Constants;
import DCourt.Tools.Tools;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.Hashtable;
import java.util.List;

/**
 * Plumbing for driving the game with no display attached.
 *
 * <p>Two things make this awkward and both are properties of the 1997 code rather than choices
 * here. {@code Tools} is a static god object that has to exist before most game classes will even
 * load, so everything starts with {@link #boot()}. And the content tables keep their contents in
 * package-private statics with no way to enumerate them, so the key lists are read reflectively --
 * the alternative was adding accessors to the very code this harness exists to hold still.
 */
final class Harness {

  private Harness() {}

  /**
   * Brings the static world up far enough to fight a battle.
   *
   * <p>Deliberately skips loader stages 0 and 1: those load the splash screen and build a {@code
   * StatusPic}, which are pure display and not needed to resolve combat.
   */
  static void boot() throws Exception {
    System.setProperty("java.awt.headless", "true");
    new Tools(new DCourtPanel());
    Tools.setToday("2026-08-30");
    for (int stage = 2; stage <= 6; stage++) {
      Tools.isLoading(stage);
    }
    while (Tools.isLoading(7)) {
      // The monster table streams itself in over repeated calls.
    }
  }

  /**
   * A hero with known stats, installed where {@code Screen.getHero()} will find it.
   *
   * <p>{@code arBattle} reads the current hero from a static during construction, so a hero that is
   * merely constructed is not enough -- it has to be the player's.
   */
  static itHero hero(String name, int guts, int wits, int charm, int atk, int def, int skill) {
    try {
      Player p = Tools.getPlayer();
      Field nm = Player.class.getDeclaredField("name");
      nm.setAccessible(true);
      nm.set(p, name);
      itHero h = p.createHero();
      h.setVals(guts, wits, charm, atk, def, skill);
      return h;
    } catch (ReflectiveOperationException e) {
      throw new IllegalStateException("could not install a hero", e);
    }
  }

  static void setLevel(itHero h, int level) {
    h.getRank().fix(Constants.LEVEL, level);
    h.calcRaise();
  }

  static int raise(itHero h) {
    return h.getRaise();
  }

  /** A fresh copy, so one battle cannot leak damage into the next. */
  static itMonster monster(String key) {
    itMonster proto = MonsterTable.find(key);
    return proto == null ? null : new itMonster(proto);
  }

  static itArms arms(String key) {
    return ArmsTable.shopItem(key);
  }

  static List<String> monsterKeys() {
    return sortedKeys(MonsterTable.class);
  }

  static List<String> armsKeys() {
    return sortedKeys(ArmsTable.class);
  }

  /** Sorted so the baseline is stable: {@code Hashtable} iteration order is not a promise. */
  private static List<String> sortedKeys(Class<?> table) {
    try {
      Field f = table.getDeclaredField("table");
      f.setAccessible(true);
      Hashtable<?, ?> h = (Hashtable<?, ?>) f.get(null);
      List<String> keys = new ArrayList<>();
      for (Enumeration<?> e = h.keys(); e.hasMoreElements(); ) {
        keys.add(String.valueOf(e.nextElement()));
      }
      Collections.sort(keys);
      return keys;
    } catch (ReflectiveOperationException e) {
      throw new IllegalStateException("could not enumerate " + table.getSimpleName(), e);
    }
  }

  /** The battle log, which is where {@code arBattle} puts the outcome of the round it just ran. */
  static String battleText(arBattle b) {
    try {
      Field f = arBattle.class.getDeclaredField("text");
      f.setAccessible(true);
      return String.valueOf(f.get(b));
    } catch (ReflectiveOperationException e) {
      throw new IllegalStateException("could not read the battle text", e);
    }
  }

  static String agentState(itAgent a) {
    return "g="
        + a.getGuts()
        + ",w="
        + a.getWits()
        + ",c="
        + a.getCharm()
        + ",a="
        + a.getAttack()
        + ",d="
        + a.getDefend()
        + ",s="
        + a.getSkill()
        + ",state="
        + a.getState();
  }

  /** One outcome per line, so the baseline diffs cleanly. */
  static String oneLine(String s) {
    return s.replace("\r", "").replace("\n", "\\n").replace("\t", "\\t");
  }
}
