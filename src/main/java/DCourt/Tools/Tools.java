package DCourt.Tools;

import DCourt.Control.ArmsTable;
import DCourt.Control.GearTable;
import DCourt.Control.MonsterTable;
import DCourt.Control.PlaceTable;
import DCourt.Control.Player;
import DCourt.DCourtPanel;
import DCourt.Items.List.itHero;
import DCourt.Screens.Screen;
import java.awt.Font;
import java.awt.Image;
import java.io.DataInputStream;
import java.io.InputStream;
import java.util.Enumeration;
import java.util.Hashtable;
import java.util.Random;

/* loaded from: DCourt.jar:DCourt/Tools/Tools.class */
public class Tools {
  static DCourtPanel papa;
  static Hashtable resourceTable;
  static Random rand;
  static String today;
  static int jvmVersion;
  static String version;
  static Player player;
  static PlaceTable places;
  static MonsterTable monsters;
  static GearTable gear;
  static ArmsTable arms;
  public static StatusPic statusPic;
  public static Font courtF;
  public static Font questF;
  public static Font statusF;
  public static Font fightF;
  public static Font fieldF;
  public static Font boldF;
  public static Font textF;
  public static Font bigF;
  public static Font giantF;
  static Buffer ranks;
  public static final int DEFAULT_WIDTH = 400;
  public static final int DEFAULT_HEIGHT = 300;
  static String lastWho = "not";
  public static String primeFont = null;
  static final String[] find = {"TimesRoman", "Serif", "SansSerif", "Helvitica", "Dialog"};

  public Tools(DCourtPanel who) {
    papa = who;
    fixJvmVersion();
    chooseFont();
    prepareFonts();
    resourceTable = new Hashtable();
    rand = new Random(System.currentTimeMillis());
  }

  public static boolean isLoading(int stage) {
    switch (stage) {
      case 0:
        loadImage("Splash.jpg");
        return true;
      case 1:
        loadImage("Faces/Hero.jpg");
        statusPic = new StatusPic();
        return true;
      case 2:
        places = new PlaceTable();
        return true;
      case 3:
        gear = new GearTable();
        return true;
      case 4:
        arms = new ArmsTable();
        return true;
      case 5:
        player = new Player();
        return true;
      case 6:
        monsters = new MonsterTable();
        return true;
      default:
        return MonsterTable.isLoading();
    }
  }

  public static void prepareFonts() {
    courtF = new Font(primeFont, Font.ITALIC + Font.BOLD, 14);
    questF = new Font(primeFont, Font.ITALIC, 14);
    statusF = new Font(primeFont, 0, 18);
    fieldF = new Font(primeFont, Font.ITALIC + Font.BOLD, 16);
    fightF = new Font(primeFont, 0, 16);
    boldF = new Font(primeFont, Font.BOLD, 14);
    textF = new Font(primeFont, 0, 14);
    bigF = new Font(primeFont, Font.BOLD, 36);
    giantF = new Font(primeFont, Font.BOLD, 75);
  }

  public static int getJvmVersion() {
    return jvmVersion;
  }

  static void fixJvmVersion() {
    String vers = System.getProperty("java.version");
    if (vers.startsWith("1.0")) {
      jvmVersion = 0;
    } else if (vers.startsWith("1.1")) {
      jvmVersion = 1;
    } else if (vers.startsWith("1.2")) {
      jvmVersion = 2;
    } else if (vers.startsWith("1.3")) {
      jvmVersion = 3;
    } else {
      jvmVersion = 4;
    }
    System.out.println(
        String.valueOf(
            String.valueOf(
                new StringBuffer("JVM version ")
                    .append(vers)
                    .append("  game=[")
                    .append(jvmVersion)
                    .append("]"))));
  }

  public static synchronized void setRegion(Screen next) {
    papa.setRegion(next);
  }

  public static synchronized Screen getRegion() {
    return papa.getRegion();
  }

  public static synchronized boolean movedAway(Screen test) {
    return test != papa.getRegion();
  }

  public static void repaint() {
    if (papa.getRegion() != null) {
      papa.getRegion().repaint();
    }
  }

  public static String getToday() {
    return today;
  }

  public static void setToday(String val) {
    today = val;
  }

  public static boolean isPlaytest() {
    return papa.isPlaytest();
  }

  public static String getConfig() {
    return papa.getConfig();
  }

  public static PlaceTable getPlaceTable() {
    return places;
  }

  public static Player getPlayer() {
    return player;
  }

  public static String getBest() {
    return player.getBest();
  }

  public static itHero getHero() {
    return player.getHero();
  }

  public static void setHeroPlace(String val) {
    getHero().setPlace(val);
  }

  public static String getHeroPlace() {
    return getHero().getPlace();
  }

  public static void setHeroState(String val) {
    getHero().setState(val);
  }

  public static String getHeroState() {
    return getHero().getState();
  }

  private static Image loadImageFromJar(String path) {
    Image tmp;

    try {
      InputStream inputStream = papa.getClass().getResourceAsStream("/" + path);
      if (inputStream != null) {
        byte[] buf = new byte[inputStream.available()];
        DataInputStream dataInputStream = new DataInputStream(inputStream);
        dataInputStream.readFully(buf);
        tmp = papa.getToolkit().createImage(buf);
        storeResource(path, tmp);
        return tmp;
      }
      System.out.println("resource not found: " + path);
    } catch (Exception e) {
      System.out.println("Failed to load " + path + ":" + e.toString());
    }
    return null;
  }

  public static Image loadImage(String path) {
    Image tmp;

    if (path == null) {
      return null;
    }

    tmp = (Image) findResource(path);
    if (tmp != null) {
      return tmp;
    }

    tmp = loadImageFromJar(path);
    if (tmp != null) {
      return tmp;
    }

    // Fall back to a loose Images/ directory next to the jar, for running from a checkout.
    tmp = papa.getToolkit().getImage(papa.getArtpath() + "/" + path);
    storeResource(path, tmp);
    return tmp;
  }

  public static void storeResource(String path, Object item) {
    resourceTable.put(path, item);
  }

  public static Object findResource(String path) {
    return resourceTable.get(path);
  }

  public static synchronized void replaceResource(String path, Object item) {
    resourceTable.remove(path);
    resourceTable.put(path, item);
  }

  public static void dropDocumentResources() {
    Enumeration e = resourceTable.keys();
    while (e.hasMoreElements()) {
      String path = (String) e.nextElement();
      if (path.endsWith(".doc")) {
        resourceTable.remove(path);
      }
    }
  }

  public static Buffer getRankings() {
    String who = getHero() == null ? "not" : getHero().getName();
    if (ranks == null || !lastWho.equalsIgnoreCase(who)) {
      ranks = Loader.cgiBuffer(Loader.READRANK, who);
    }
    lastWho = who;
    ranks.reset();
    return ranks;
  }

  public static void setSeed(int val) {
    rand.setSeed((long) val);
  }

  public static int nextInt() {
    return rand.nextInt();
  }

  public static int twice(int value) {
    return roll(value) + roll(value);
  }

  public static boolean contest(int a, int b) {
    return roll(a + b) < a;
  }

  public static boolean percent(int value) {
    return roll(100) < value;
  }

  public static boolean chance(int value) {
    return roll(value) == 0;
  }

  public static String select(String[] list) {
    return list[roll(list.length)];
  }

  public static int roll(int value) {
    if (value < 1) {
      return 0;
    }
    // The original negated a raw nextInt() and took a modulus. Integer.MIN_VALUE negates to
    // itself, so roll() could return a negative -- which reaches select() as a array index and
    // throws. nextInt(bound) is also free of the modulo bias the old form had.
    return rand.nextInt(value);
  }

  public static int fourTest(int a, int b) {
    int test = a + b;
    int num = 0;
    if (roll(test) < a) {
      num = 0 + 1;
    }
    if (roll(test) < a) {
      num++;
    }
    if (roll(test) < a) {
      num++;
    }
    if (roll(test) < a) {
      num++;
    }
    return num;
  }

  public static int spread(int value) {
    int min = (value * 5) / 7;
    return 1 + min + twice(value - min);
  }

  public static boolean percent(String s) {
    try {
      return percent(Integer.parseInt(s));
    } catch (NumberFormatException ex) {
      System.err.println(ex);
      ex.printStackTrace();
      return false;
    }
  }

  public static int skew(int value) {
    int sum = 0;
    while (percent(value)) {
      sum++;
    }
    return sum;
  }

  public static String truncate(String id) {
    if (id == null) {
      return null;
    }
    int ix = id.indexOf(91);
    if (ix > 0) {
      return id.substring(0, ix);
    }
    int ix2 = id.indexOf(36);
    return ix2 < 1 ? id : id.substring(0, ix2 - 1);
  }

  public static String detokenize(String msg) {
    return msg.replace('{', '(').replace('|', ':').replace('}', ')');
  }

  public void chooseFont() {
    String[] list = papa.getToolkit().getFontList();
    int i = 0;
    int j = 0;
    while (i < find.length) {
      j = 0;
      while (j < list.length && !find[i].equalsIgnoreCase(list[j])) {
        j++;
      }
      if (j < list.length) {
        break;
      }
      i++;
    }
    if (j == list.length) {
      j = 0;
    }
    primeFont = list[j];
  }
}
