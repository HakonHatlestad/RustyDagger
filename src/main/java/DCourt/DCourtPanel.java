package DCourt;

import DCourt.Screens.Command.arLoading;
import DCourt.Screens.Screen;
import DCourt.Tools.StaticLayout;
import DCourt.Tools.Tools;
import java.awt.Dimension;
import java.awt.Graphics;
import java.awt.Panel;

/**
 * The game surface.
 *
 * <p>This was a {@code java.applet.Applet} until JDK 26 removed the Applet API (JEP 504). It is now
 * a plain AWT Panel, which both {@link DCourtFrame} and a browser JVM such as CheerpJ can host. The
 * applet-only paths went with it: the game no longer reads applet parameters, no longer builds art
 * and CGI URLs from a code base, and no longer runs the hotlink ("pirate") check, none of which
 * mean anything now that multiplayer is gone and the art ships inside the jar.
 */
public class DCourtPanel extends Panel {
  private static final String ARTPATH = "Images";
  private static final String CONFIG = "DCourt";

  private String today;
  private Tools tools;
  private boolean playtest = false;
  Screen region = null;

  @Override
  public Dimension getPreferredSize() {
    return new Dimension(Tools.DEFAULT_WIDTH, Tools.DEFAULT_HEIGHT);
  }

  public void init() {
    System.out.println("Dragon Court version 1.2");
    setLayout(new StaticLayout());
    this.playtest = CONFIG.equalsIgnoreCase("DCourtWork");
    this.tools = new Tools(this);
    setRegion(new arLoading(this, this.tools));
  }

  public String getArtpath() {
    return ARTPATH;
  }

  public String getConfig() {
    return CONFIG;
  }

  public String getToday() {
    return this.today;
  }

  public boolean isPlaytest() {
    return this.playtest;
  }

  public void setPlaytest(boolean val) {
    this.playtest = val;
  }

  public Screen getRegion() {
    return this.region;
  }

  public void setRegion(Screen next) {
    if (next != null) {
      setEnabled(false);
      removeAll();
      this.region = next;
      this.region.init();
      add(this.region);
      setEnabled(true);
      this.region.repaint();
    }
  }

  @Override
  public void update(Graphics g) {
    paint(g);
  }
}
