package DCourt;

import java.awt.BorderLayout;
import java.awt.EventQueue;
import java.awt.Frame;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;

/** Desktop window hosting the game. */
public class DCourtFrame extends Frame {

  /** 400x300 is unreadably small on a current display; 2x is the sane floor. */
  private static final String DEFAULT_SCALE = "2";

  public DCourtFrame(String title) {
    super(title);
    addWindowListener(
        new WindowAdapter() {
          @Override
          public void windowClosing(WindowEvent e) {
            dispose();
            System.exit(0);
          }

          @Override
          public void windowActivated(WindowEvent e) {
            repaint();
          }

          @Override
          public void windowDeiconified(WindowEvent e) {
            repaint();
          }
        });
  }

  /**
   * Applies the window scale before anything touches AWT.
   *
   * <p>The game draws into a fixed 400x300 canvas, which is postage-stamp sized on a modern
   * display. Its widgets are heavyweight AWT components, so a parent transform cannot scale them --
   * but sun.java2d.uiScale scales the whole native surface, decorations included, and that works.
   * It is only read once, while the graphics environment initialises, so this has to happen before
   * the first AWT call.
   */
  private static void applyScale() {
    if (System.getProperty("sun.java2d.uiScale") != null) {
      return; // An explicit JDK setting wins; so does a HiDPI desktop that set it for us.
    }
    String requested = System.getProperty("dragoncourt.scale", DEFAULT_SCALE);
    try {
      double scale = Double.parseDouble(requested);
      if (scale > 0) {
        System.setProperty("sun.java2d.uiScale", requested);
        return;
      }
      System.err.println("Ignoring dragoncourt.scale=" + requested + ": must be greater than 0");
    } catch (NumberFormatException e) {
      System.err.println("Ignoring dragoncourt.scale=" + requested + ": not a number");
    }
  }

  public static void main(String[] args) {
    applyScale();
    EventQueue.invokeLater(
        () -> {
          DCourtPanel game = new DCourtPanel();
          DCourtFrame win = new DCourtFrame("FFI Presents: Dragon Court");
          win.add(game, BorderLayout.CENTER);
          win.setResizable(false);
          // pack() sizes the frame around the panel's preferred size. The original did the
          // inset arithmetic by hand, before the window was mapped, so on window managers
          // that report insets late it sized the frame short and clipped the bottom row.
          win.pack();
          win.setLocationRelativeTo(null);
          win.setVisible(true);
          game.init();
          game.repaint();
        });
  }
}
