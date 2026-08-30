package DCourt.Harness;

import DCourt.Items.Item;
import DCourt.Items.List.itArms;
import DCourt.Items.List.itHero;
import DCourt.Items.List.itMonster;
import DCourt.Screens.Quest.BattleAccess;
import DCourt.Screens.Quest.arBattle;
import DCourt.Screens.Quest.arQuest;
import DCourt.Screens.Template.Shop;
import DCourt.Screens.Template.ShopAccess;
import DCourt.Static.Constants;
import DCourt.Tools.Tools;
import java.io.PrintWriter;
import java.util.List;

/**
 * The rules, characterised as functions: every input stated, every output a number.
 *
 * <p>This is the half of parity that is checked exactly. It deliberately does not record battle
 * prose — the port is getting a different presentation, so demanding identical wording would freeze
 * the interface this whole rewrite exists to free. What must match is the arithmetic: given these
 * stats, this gear and this action, how much damage, what severity, who died.
 *
 * <p>It also does not run whole fights. Those depend on the order the surrounding code consumes the
 * random generator, which a rewrite is entitled to change; they are checked by distribution
 * instead, in {@link Distributions}.
 */
final class Rules {

  private Rules() {}

  static void write(PrintWriter w) {
    w.println("# Rules characterisation -- checked EXACTLY.");
    w.println("# Structured outcomes only. No battle prose: the port's wording is free to differ.");
    w.println();
    rng(w);
    damage(w);
    gearAndTraits(w);
    actions(w);
    newCharacter(w);
    economy(w);
    questAccounting(w);
    decay(w);
    levelling(w);
    saveRoundTrip(w);
    loot(w);
  }

  /**
   * The generator itself. Recorded exactly, but this section only binds a port that chooses to
   * reimplement {@code java.util.Random}; one that does not must still match {@link Distributions}.
   */
  private static void rng(PrintWriter w) {
    w.println("== RNG SEQUENCES (binding only if java.util.Random is reimplemented) ==");
    for (int seed : new int[] {0, 1, 42, 12345, 999999}) {
      w.println("seed=" + seed + " roll(100)=" + seq(seed, "roll"));
      w.println("seed=" + seed + " twice(3)=" + seq(seed, "twice"));
      w.println("seed=" + seed + " contest(30,20)=" + seq(seed, "contest"));
    }
    w.println();
  }

  private static String seq(int seed, String kind) {
    Tools.setSeed(seed);
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < 20; i++) {
      switch (kind) {
        case "roll" -> sb.append(Tools.roll(100)).append(',');
        case "twice" -> sb.append(Tools.twice(3)).append(',');
        default -> sb.append(Tools.contest(30, 20) ? 'T' : 'F');
      }
    }
    return sb.toString();
  }

  /**
   * One attack, every input explicit. Sweeps the damage formula and the severity bands across the
   * ranges the game actually reaches, so a port can be checked without reproducing the call order
   * of the code around it.
   */
  private static void damage(PrintWriter w) {
    w.println("== ATTACK RESOLUTION (explicit inputs -> structured outcome) ==");
    Fixture f = Fixture.create();
    for (int guts : new int[] {10, 40, 120, 300}) {
      for (int swings : new int[] {0, 1, 2, 4}) {
        for (int atk : new int[] {5, 30, 150}) {
          for (int def : new int[] {0, 20, 120}) {
            for (int as : new int[] {5, 40, 200}) {
              for (int ds : new int[] {5, 40, 200}) {
                itHero attacker = Harness.hero("A", guts, 20, 20, atk, 10, as);
                itMonster defender = f.freshDefender(def, ds);
                Tools.setSeed(4242);
                BattleAccess.resetKillStop(f.battle);
                int before = defender.getWounds();
                String text = BattleAccess.act(f.battle, attacker, defender, guts, swings, as, ds);
                w.println(
                    "guts="
                        + guts
                        + " swings="
                        + swings
                        + " atk="
                        + atk
                        + " def="
                        + def
                        + " as="
                        + as
                        + " ds="
                        + ds
                        + " -> severity="
                        + Harness.severity(text)
                        + ","
                        + Harness.outcome(attacker, defender, before));
              }
            }
          }
        }
      }
    }
    w.println();
  }

  /**
   * Gear and traits into derived combat stats. {@code calcCombat} is a pure function of what you
   * carry, your guild ranks and your traits, so it characterises cleanly and is exactly the sort of
   * rule a port gets subtly wrong.
   */
  private static void gearAndTraits(PrintWriter w) {
    w.println("== GEAR AND TRAITS -> DERIVED COMBAT STATS ==");
    String[][] loadouts = {
      {},
      {"Rusty Dagger"},
      {"Steel Sword"},
      {"Steel Sword", "Half Plate"},
      {"Silver Gladius"},
      {"Silver Masamune", "Full Plate"},
    };
    String[] traits = {"", Constants.AGILE, Constants.STRONG, Constants.STURDY};
    for (String[] gear : loadouts) {
      for (String trait : traits) {
        itHero h = Harness.hero("G", 60, 30, 30, 0, 0, 0);
        if (!trait.isEmpty()) {
          Harness.withTrait(h, trait);
        }
        Harness.equip(h, gear);
        w.println(
            "gear="
                + (gear.length == 0 ? "(none)" : String.join("+", gear))
                + " trait="
                + (trait.isEmpty() ? "(none)" : trait)
                + " -> attack="
                + h.getAttack()
                + " defend="
                + h.getDefend()
                + " skill="
                + h.getSkill());
      }
    }
    w.println();
  }

  /**
   * The special actions. Their multipliers live in {@code battle()}, not {@code agentAct()} --
   * Backstab doubles Guts and Speed and cuts the enemy to one swing before either side acts -- so
   * this drives a whole round rather than a single attack. Both sides' damage is recorded.
   *
   * <p>Note {@code Constants.BERZERK} is spelt {@code "Berzek"} in the original. Using the obvious
   * spelling matches nothing and silently records an ordinary attack.
   */
  private static void actions(PrintWriter w) {
    w.println("== SPECIAL ACTIONS (whole round, both sides) ==");
    String[] actions = {
      "", Constants.BACKSTAB, Constants.BERZERK, Constants.IEATSU, "Control", "Swindle"
    };
    for (String action : actions) {
      for (int seed : new int[] {7, 99, 4242}) {
        itHero h = Harness.hero("A", 60, 30, 30, 0, 0, 0);
        Harness.equip(h, "Steel Sword");
        itMonster mob = Harness.monster("Fields:Centaur");
        if (mob == null) {
          continue;
        }
        Tools.setSeed(seed);
        arQuest q = new arQuest(null, 3, "actions", mob);
        itMonster fighting = q.getMob();
        Harness.withAction(h, action);
        int heroBefore = h.getWounds();
        int mobBefore = fighting.getWounds();
        arBattle b = new arBattle(q, "actions");
        BattleAccess.resetKillStop(b);
        w.println(
            "action="
                + (action.isEmpty() ? "(none)" : action)
                + " seed="
                + seed
                + " -> heroDmgTaken="
                + (h.getWounds() - heroBefore)
                + " mobDmgTaken="
                + (fighting.getWounds() - mobBefore)
                + " heroState="
                + h.getState()
                + " mobState="
                + fighting.getState());
      }
    }
    w.println();
  }

  /**
   * What the creation choices actually buy. Character creation is point-buy, not a roll -- no
   * randomness anywhere in {@code arCreate.createHero} -- so the portable rule is what a given
   * allocation derives: combat stats, the cost of level two, and the day's quest allowance.
   */
  private static void newCharacter(PrintWriter w) {
    w.println("== NEW CHARACTER (allocation -> derived) ==");
    int[][] allocations = {
      {10, 10, 10}, {30, 5, 5}, {5, 30, 5}, {5, 5, 30}, {16, 16, 16},
    };
    String[] classes = {"(none)", Constants.THIEF, Constants.MAGIC, Constants.FIGHT};
    for (int[] a : allocations) {
      for (String cls : classes) {
        itHero h = Harness.hero("N", a[0], a[1], a[2], 0, 0, 0);
        h.getRank().fix(Constants.LEVEL, 1);
        if (!cls.equals("(none)")) {
          h.addRank(cls, 1);
          h.fixTemp(cls, 1);
        }
        h.calcCombat();
        h.calcRaise();
        w.println(
            "guts="
                + a[0]
                + " wits="
                + a[1]
                + " charm="
                + a[2]
                + " class="
                + cls
                + " -> attack="
                + h.getAttack()
                + " defend="
                + h.getDefend()
                + " skill="
                + h.getSkill()
                + " raise="
                + h.getRaise()
                + " quests="
                + h.getQuests()
                + " power="
                + h.getPower());
      }
    }
    w.println();
  }

  /**
   * Shop pricing. What you are paid depends on the item's table cost, the shop's resale and base
   * numbers, your Charm and whether you are a Merchant -- a port can get this wrong without any
   * visible number changing, which is how an economy quietly drifts.
   */
  private static void economy(PrintWriter w) {
    w.println("== ECONOMY ==");
    String[] goods = {"Knife", "Long Sword", "Battle Axe", "Long Bow", "Half Plate"};
    for (int charm : new int[] {5, 20, 60, 200}) {
      for (boolean merchant : new boolean[] {false, true}) {
        itHero h = Harness.hero("E", 30, 20, charm, 0, 0, 0);
        if (merchant) {
          Harness.withTrait(h, Constants.MERCHANT);
        }
        Shop shop = new PricingShop();
        StringBuilder prices = new StringBuilder();
        for (String g : goods) {
          itArms it = Harness.arms(g);
          if (it == null) {
            continue;
          }
          prices
              .append(' ')
              .append(g)
              .append("=stock:")
              .append(ShopAccess.stockValue(shop, it))
              .append("/sell:")
              .append(ShopAccess.packValue(shop, it));
        }
        // costSpecial() is deliberately absent: on a smith it prices whatever row is selected
        // in the shop list, so it is a function of the interface rather than of the rules, and
        // there is nothing portable to record.
        w.println("charm=" + charm + " merchant=" + merchant + prices);
      }
    }
    // The stat preview shops show and the inventory screen does not.
    itHero h = Harness.hero("D", 30, 20, 30, 0, 0, 0);
    Harness.equip(h, "Long Sword");
    Shop shop = new PricingShop();
    for (String g : goods) {
      itArms it = Harness.arms(g);
      if (it != null) {
        w.println(
            "equippedDelta wearing=Long Sword vs="
                + g
                + " -> \""
                + ShopAccess.equippedDelta(shop, it)
                + "\"");
      }
    }
    w.println();
  }

  /**
   * The quest allowance. Overload always costs quests; fatigue only counts when the daily limit is
   * switched on, which this port leaves off by default.
   */
  private static void questAccounting(PrintWriter w) {
    w.println("== QUEST ACCOUNTING (daily limit off, the default) ==");
    for (int level : new int[] {1, 5, 15, 40}) {
      for (int fatigue : new int[] {0, 10, 50}) {
        for (int overloadBy : new int[] {0, 3, 25}) {
          itHero h = Harness.hero("Q", 20, 20, 20, 0, 0, 0);
          Harness.setLevel(h, level);
          h.addFatigue(fatigue);
          Harness.overload(h, overloadBy);
          w.println(
              "level="
                  + level
                  + " fatigue="
                  + fatigue
                  + " packOver="
                  + overloadBy
                  + " -> quests="
                  + h.getQuests()
                  + " overload="
                  + h.getOverload()
                  + " packMax="
                  + h.packMax());
        }
      }
    }
    w.println();
  }

  /**
   * Gear wearing out.
   *
   * <p>Records the <em>trajectory</em> -- what an item's stats become after one decay, two, three
   * -- rather than which of forty uses happened to damage it. That earlier form looked stronger and
   * was worse: how often decay fires depends on how many times the generator has been advanced, and
   * every stat write advances it, because {@code itCount} stores each number split across a value
   * and a random offset so a memory scanner cannot find it. Recording the pattern therefore pinned
   * a 1997 anti-cheat trick rather than a rule, and a port would have had to reimplement the trick
   * to pass. How often gear decays is a distribution, and lives in the distributions file.
   */
  private static void decay(PrintWriter w) {
    w.println("== DECAY (stat trajectory per decay, not per use) ==");
    for (String key : Harness.armsKeys()) {
      itArms a = Harness.arms(key);
      if (a == null) {
        continue;
      }
      StringBuilder steps = new StringBuilder();
      // Rate 2 to make each attempt likely; only the decays are recorded, so the rate does not
      // affect what comes out -- just how many attempts it takes to get there.
      Tools.setSeed(4242);
      int seen = 0;
      for (int attempt = 0; attempt < 400 && seen < 5; attempt++) {
        if (a.decay(2)) {
          seen++;
          steps
              .append(" after")
              .append(seen)
              .append("=a:")
              .append(a.getAttack())
              .append(",d:")
              .append(a.getDefend())
              .append(",s:")
              .append(a.getSkill());
        }
      }
      w.println("item=" + key + steps);
    }
    w.println();
  }

  /**
   * The curve and the transition. The first version recorded only the cost of the next level; what
   * matters as much is what crossing it actually gives you.
   */
  private static void levelling(PrintWriter w) {
    w.println("== LEVELLING ==");
    itHero h = Harness.hero("Curve", 20, 20, 20, 10, 10, 10);
    for (int level = 1; level <= 30; level++) {
      Harness.setLevel(h, level);
      w.println("level=" + level + " raise=" + Harness.raise(h) + " quests=" + h.getQuests());
    }
    itHero t = Harness.hero("Trans", 20, 20, 20, 10, 10, 10);
    Harness.setLevel(t, 1);
    for (int step = 0; step < 12; step++) {
      Harness.addExp(t, 200);
      boolean levelled = t.tryToLevel(null);
      w.println(
          "afterExp step="
              + step
              + " levelled="
              + levelled
              + " level="
              + t.getLevel()
              + " exp="
              + t.getExp()
              + " guts="
              + t.getGuts()
              + " wits="
              + t.getWits()
              + " charm="
              + t.getCharm()
              + " fame="
              + Harness.fame(t));
    }
    w.println();
  }

  /**
   * Write a hero, read it back, write it again. The port has to import existing {@code .hero}
   * files, and nothing anywhere checked that a character survives the trip.
   */
  private static void saveRoundTrip(PrintWriter w) {
    w.println("== SAVE ROUND TRIP ==");
    itHero h = Harness.hero("RoundTrip", 55, 33, 22, 44, 11, 66);
    Harness.withGear(h, "Steel Sword", "Half Plate");
    Harness.setLevel(h, 7);
    String once = h.toString();
    Item back = Item.factory(once);
    String twice = back == null ? "(FAILED TO PARSE)" : back.toString();
    w.println("stable=" + once.equals(twice));
    w.println("text=" + Harness.oneLine(once));
    if (!once.equals(twice)) {
      w.println("reparsed=" + Harness.oneLine(twice));
    }
    w.println();
  }

  /** What each monster actually drops, which decides the whole economy and was never recorded. */
  private static void loot(PrintWriter w) {
    w.println("== LOOT ==");
    List<String> keys = Harness.monsterKeys();
    for (String key : keys) {
      for (int seed : new int[] {1, 42, 98765}) {
        itMonster mob = Harness.monster(key);
        if (mob == null) {
          continue;
        }
        Harness.hero("Looter", 60, 30, 30, 40, 20, 50);
        Tools.setSeed(seed);
        try {
          arQuest q = new arQuest(null, 3, "loot", mob);
          w.println(
              "monster=" + key + " seed=" + seed + " drops=" + Harness.packContents(q.getMob()));
        } catch (RuntimeException e) {
          w.println("monster=" + key + " seed=" + seed + " THREW=" + e.getClass().getName());
        }
      }
    }
    w.println();
  }

  /**
   * A single {@code arBattle} to borrow {@code agentAct} from, plus fresh defenders. Reused rather
   * than rebuilt because constructing one runs a round of combat as a side effect.
   */
  private static final class Fixture {
    final arBattle battle;

    private Fixture(arBattle battle) {
      this.battle = battle;
    }

    static Fixture create() {
      Harness.hero("Fixture", 50, 20, 20, 30, 20, 40);
      itMonster proto = Harness.monster("Fields:Rodent");
      Tools.setSeed(1);
      arQuest q = new arQuest(null, 2, "fixture", proto);
      return new Fixture(new arBattle(q, "fixture"));
    }

    itMonster freshDefender(int defence, int skill) {
      itMonster m = Harness.monster("Fields:Rodent");
      m.setVals(200, 20, 20, 10, defence, skill);
      m.setState(DCourt.Items.List.itAgent.ALIVE);
      return m;
    }
  }
}
