package DCourt.Harness;

import DCourt.Control.ArmsTable;
import DCourt.Control.MonsterTable;
import DCourt.Control.Player;
import DCourt.Control.SaveStore;
import DCourt.DCourtPanel;
import DCourt.Items.Item;
import DCourt.Items.List.itAgent;
import DCourt.Items.List.itArms;
import DCourt.Items.List.itHero;
import DCourt.Items.List.itMonster;
import DCourt.Items.itList;
import DCourt.Screens.Quest.arBattle;
import DCourt.Static.Constants;
import DCourt.Tools.Tools;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
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
public final class Harness {

  private Harness() {}

  /**
   * Brings the static world up far enough to fight a battle.
   *
   * <p>Deliberately skips loader stages 0 and 1: those load the splash screen and build a {@code
   * StatusPic}, which are pure display and not needed to resolve combat.
   */
  public static void boot() throws Exception {
    System.setProperty("java.awt.headless", "true");
    // Levelling and screen changes trigger the game's autosave, which would otherwise drop
    // harness characters into the repo's saves/ directory next to real ones.
    Path scratch = Files.createTempDirectory("rustydagger-harness");
    scratch.toFile().deleteOnExit();
    System.setProperty(SaveStore.DIR_PROPERTY, scratch.toString());
    new Tools(new DCourtPanel());
    Tools.setToday("2026-08-30");
    // Seeded here, before the tables load, because loading them *builds* the monsters -- and
    // building a monster resolves the slots in its flavour text by rolling
    // ({~|$smile$|smiling|grinning|winking}). Without this the content export differs on every
    // run, so `git diff --exit-code content/` in CI fails whether or not anything changed. Every
    // measurement below reseeds before it starts, so this fixes the tables without touching them.
    Tools.setSeed(20260830);
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
  public static itHero hero(
      String name, int guts, int wits, int charm, int atk, int def, int skill) {
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

  public static void setLevel(itHero h, int level) {
    h.getRank().fix(Constants.LEVEL, level);
    h.calcRaise();
  }

  public static int raise(itHero h) {
    return h.getRaise();
  }

  /** A fresh copy, so one battle cannot leak damage into the next. */
  public static itMonster monster(String key) {
    itMonster proto = MonsterTable.find(key);
    return proto == null ? null : new itMonster(proto);
  }

  public static itArms arms(String key) {
    return ArmsTable.shopItem(key);
  }

  public static List<String> monsterKeys() {
    return sortedKeys(MonsterTable.class);
  }

  public static List<String> armsKeys() {
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
  public static String battleText(arBattle b) {
    try {
      Field f = arBattle.class.getDeclaredField("text");
      f.setAccessible(true);
      return String.valueOf(f.get(b));
    } catch (ReflectiveOperationException e) {
      throw new IllegalStateException("could not read the battle text", e);
    }
  }

  public static String agentState(itAgent a) {
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
  public static String oneLine(String s) {
    return s.replace("\r", "").replace("\n", "\\n").replace("\t", "\\t");
  }

  /** Equips a hero with a real item from the arms table, so gear traits are exercised. */
  public static itHero withGear(itHero h, String... itemNames) {
    for (String name : itemNames) {
      itArms a = ArmsTable.shopItem(name);
      if (a != null) {
        h.getGear().append(a);
      }
    }
    return h;
  }

  /**
   * Sets the hero's chosen action for the round.
   *
   * <p>The action is the actions list's <em>name</em>, not an entry in it -- {@code isMatch} on a
   * list compares the list's own name, and {@code chooseActions} sets it with {@code setName}.
   * Adding an entry instead, which is the obvious reading, silently selects nothing.
   */
  public static itHero withAction(itHero h, String action) {
    h.resetActions();
    if (action != null && !action.isEmpty()) {
      h.getActions().setName(action);
    }
    return h;
  }

  /**
   * Equips gear and recomputes the derived combat stats.
   *
   * <p>{@code getAttack()} is a stored value, not a function of what you are carrying: gear only
   * reaches it through {@code calcCombat()}, which also folds in guild ranks and the Agile, Strong
   * and Sturdy traits. Appending to the gear list without this leaves a hero holding a sword that
   * does nothing.
   */
  public static itHero equip(itHero h, String... itemNames) {
    withGear(h, itemNames);
    h.calcCombat();
    return h;
  }

  /** Gives a hero a trait, in the list {@code hasTrait} actually reads. */
  public static itHero withTrait(itHero h, String trait) {
    h.getTemp().fixTrait(trait);
    return h;
  }

  /** What an agent looks like as numbers, for a structured record rather than prose. */
  public static String outcome(itAgent attacker, itAgent defender, int woundsBefore) {
    return "dmg="
        + (defender.getWounds() - woundsBefore)
        + ",defWounds="
        + defender.getWounds()
        + ",defState="
        + defender.getState()
        + ",atkState="
        + attacker.getState();
  }

  /** The severity band the game reported, as an index rather than an English adjective. */
  public static int severity(String text) {
    String[] bands = {"DODGED!", "Unharmed", "Scratched", "Injured!", "Wounded!!", "KILLED!!!"};
    for (int i = 0; i < bands.length; i++) {
      if (text.contains(bands[i])) {
        return i;
      }
    }
    return -1;
  }

  /** Grants experience the way winning a fight does, without needing a fight. */
  public static void addExp(itHero h, int amount) {
    h.getStatus().add(Constants.EXP, amount);
  }

  public static int fame(itHero h) {
    return h.getStatus().getCount(Constants.FAME);
  }

  /** What a monster is carrying, sorted so the record is stable. */
  public static String packContents(itAgent a) {
    List<String> names = new ArrayList<>();
    itList pack = a.getPack();
    for (int i = 0; i < pack.getCount(); i++) {
      Item it = pack.select(i);
      if (it != null) {
        names.add(it.getName() + "x" + it.getCount());
      }
    }
    Collections.sort(names);
    return names.isEmpty() ? "(nothing)" : String.join("+", names);
  }

  /** Stuffs the pack past its limit, which costs quests regardless of the daily allowance. */
  public static void overload(itHero h, int itemsOverMax) {
    int target = h.packMax() + itemsOverMax;
    while (h.getPack().getCount() < target) {
      itArms filler = ArmsTable.shopItem("Knife");
      if (filler == null) {
        return;
      }
      h.getPack().append(filler);
    }
  }
}
