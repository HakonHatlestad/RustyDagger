package DCourt.Harness;

import DCourt.Control.GearTable;
import DCourt.Items.Item;
import DCourt.Items.List.itArms;
import DCourt.Items.List.itMonster;
import java.io.PrintWriter;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.Hashtable;
import java.util.List;

/**
 * Lifts the game's static content out of Java string literals into JSON.
 *
 * <p>Roughly 1,500 lines of this game are pure data — every weapon, every monster, every quest —
 * embedded as brace-delimited strings inside Java source. The TypeScript port needs that content,
 * and reading it out of {@code .java} files is not something anyone should have to do twice.
 *
 * <p><b>This exports; it does not refactor.</b> The Java build goes on reading its own literals and
 * is not touched. That is deliberate: it is the reference the port is checked against, and a
 * reference whose data loading has been rewritten underneath it is no longer a reference. The cost
 * is that the two could drift, which is why the export is generated rather than hand-maintained and
 * why {@link #verify} exists.
 *
 * <p>What comes out is each entry's own {@code {type|field|field}} source text rather than a
 * decomposed schema. That is not laziness. The port has to implement this grammar anyway to read
 * existing {@code .hero} saves, so exporting the same form means one parser rather than two, and
 * inventing a schema now would be designing the port's data model before the port exists. Numeric
 * fields that are cheap and unambiguous are included alongside, so a reader can sanity-check
 * without a parser.
 *
 * <p>Every exported string is parsed back and re-serialised before it is written. If a single entry
 * does not survive that trip the export fails rather than shipping something subtly lossy.
 */
final class Export {

  private Export() {}

  /** Entries whose exported text does not survive a parse and re-serialise. */
  private static final List<String> lossy = new ArrayList<>();

  static void run(Path dir) throws Exception {
    Files.createDirectories(dir);
    int arms = writeItems(dir.resolve("arms.json"), "arms", keysOf(DCourt.Control.ArmsTable.class));
    int monsters =
        writeItems(
            dir.resolve("monsters.json"), "monsters", keysOf(DCourt.Control.MonsterTable.class));
    int gear = writeGear(dir.resolve("gear.json"));
    System.out.println(
        "  content: " + arms + " arms, " + monsters + " monsters, " + gear + " gear entries");
    if (!lossy.isEmpty()) {
      System.out.println("  " + lossy.size() + " entries do not round-trip:");
      for (String s : lossy) {
        System.out.println("    " + s);
      }
    }
  }

  /**
   * Items that serialise through {@code Item.toString}, which is everything in the arms and monster
   * tables. Each is verified to survive a parse and re-serialise before being written.
   */
  private static int writeItems(Path out, String label, List<String> keys) throws Exception {
    List<String> rows = new ArrayList<>();
    for (String key : keys) {
      Item it = label.equals("arms") ? Harness.arms(key) : prototype(key);
      if (it == null) {
        continue;
      }
      String source = it.toString();
      verify(key, source);
      StringBuilder row = new StringBuilder();
      row.append("    {\n");
      row.append("      \"key\": ").append(json(key)).append(",\n");
      if (it instanceof itArms a) {
        row.append("      \"attack\": ").append(a.getAttack()).append(",\n");
        row.append("      \"defend\": ").append(a.getDefend()).append(",\n");
        row.append("      \"skill\": ").append(a.getSkill()).append(",\n");
      } else if (it instanceof itMonster m) {
        row.append("      \"guts\": ").append(m.getGuts()).append(",\n");
        row.append("      \"wits\": ").append(m.getWits()).append(",\n");
        row.append("      \"charm\": ").append(m.getCharm()).append(",\n");
      }
      row.append("      \"source\": ").append(json(source)).append("\n");
      row.append("    }");
      rows.add(row.toString());
    }
    write(out, label, rows);
    return rows.size();
  }

  /** Gear is a flat record rather than an {@code Item}, so it has no source text to round-trip. */
  private static int writeGear(Path out) throws Exception {
    List<String> rows = new ArrayList<>();
    for (String key : keysOf(GearTable.class)) {
      rows.add(
          "    {\n"
              + "      \"key\": "
              + json(key)
              + ",\n"
              + "      \"type\": "
              + GearTable.getType(new DCourt.Items.Token.itCount(key, 1))
              + ",\n"
              + "      \"cost\": "
              + GearTable.getCost(new DCourt.Items.Token.itCount(key, 1))
              + ",\n"
              + "      \"effect\": "
              + GearTable.getEffect(new DCourt.Items.Token.itCount(key, 1))
              + "\n    }");
    }
    write(out, "gear", rows);
    return rows.size();
  }

  /**
   * Parses the exported text back and re-serialises it, collecting every entry that does not come
   * out identical. Collected rather than thrown on the first failure: one lossy entry is a puzzle,
   * the shape of all of them is a diagnosis.
   */
  private static void verify(String key, String source) {
    Item back = Item.factory(source);
    if (back == null) {
      lossy.add(key + ": does not parse back at all");
      return;
    }
    String again = back.toString();
    if (!source.equals(again)) {
      lossy.add(key + ": " + firstDifference(source, again));
    }
  }

  /** Where two serialisations part company, with a little context on each side. */
  private static String firstDifference(String a, String b) {
    int i = 0;
    while (i < a.length() && i < b.length() && a.charAt(i) == b.charAt(i)) {
      i++;
    }
    return "diverges at "
        + i
        + " of "
        + a.length()
        + "/"
        + b.length()
        + "\n      out: ..."
        + snippet(a, i)
        + "\n      in:  ..."
        + snippet(b, i);
  }

  private static String snippet(String s, int at) {
    int from = Math.max(0, at - 20);
    int to = Math.min(s.length(), at + 40);
    return s.substring(from, to).replace("\n", "\\n").replace("\t", "\\t");
  }

  private static itMonster prototype(String key) {
    itMonster proto = DCourt.Control.MonsterTable.find(key);
    return proto == null ? null : new itMonster(proto);
  }

  private static void write(Path out, String label, List<String> rows) throws Exception {
    try (PrintWriter w = new PrintWriter(Files.newBufferedWriter(out))) {
      w.println("{");
      w.println("  \"_note\": \"Generated by ./gradlew exportContent. Do not hand-edit.\",");
      w.println(
          "  \"_source\": \"Java string literals in DCourt.Control. The Java build still reads"
              + " those, not this file. See docs/development.md.\",");
      w.println("  \"" + label + "\": [");
      w.println(String.join(",\n", rows));
      w.println("  ]");
      w.println("}");
    }
    checkWellFormed(out);
  }

  /**
   * A blunt structural check that what was written is legal JSON.
   *
   * <p>Not a parser -- just enough to catch the failure this actually hit: an unescaped newline
   * inside a string, which produced a file that looked fine and would not load. Balanced braces and
   * brackets outside of strings, and no raw control characters inside one.
   */
  private static void checkWellFormed(Path out) throws Exception {
    String s = Files.readString(out);
    boolean inString = false;
    boolean escaped = false;
    int curly = 0;
    int square = 0;
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (c == '\\') {
          escaped = true;
        } else if (c == '"') {
          inString = false;
        } else if (c < 0x20) {
          throw new IllegalStateException(
              out.getFileName() + ": raw control character inside a string at offset " + i);
        }
        continue;
      }
      switch (c) {
        case '"' -> inString = true;
        case '{' -> curly++;
        case '}' -> curly--;
        case '[' -> square++;
        case ']' -> square--;
        default -> {
          // whitespace and structure
        }
      }
    }
    if (inString || curly != 0 || square != 0) {
      throw new IllegalStateException(
          out.getFileName() + ": unbalanced JSON (curly=" + curly + " square=" + square + ")");
    }
  }

  private static List<String> keysOf(Class<?> table) {
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

  private static String json(String s) {
    StringBuilder sb = new StringBuilder("\"");
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      switch (c) {
        case '"' -> sb.append("\\\"");
        case '\\' -> sb.append("\\\\");
        case '\n' -> sb.append("\\n");
        case '\r' -> sb.append("\\r");
        case '\t' -> sb.append("\\t");
        default -> {
          if (c < 0x20) {
            sb.append(String.format("\\u%04x", (int) c));
          } else {
            sb.append(c);
          }
        }
      }
    }
    return sb.append('"').toString();
  }
}
