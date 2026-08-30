package DCourt;

import DCourt.Tools.Tools;
import java.awt.EventQueue;
import java.awt.Frame;
import java.awt.Insets;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;

/** Desktop window hosting the game. */
public class DCourtFrame extends Frame {

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

  public static void main(String[] args) {
    EventQueue.invokeLater(
        () -> {
          DCourtPanel game = new DCourtPanel();
          DCourtFrame win = new DCourtFrame("FFI Presents: Dragon Court");
          win.setVisible(true);

          // The frame must be showing before its insets are known, and the game draws into a
          // fixed-size canvas, so the window is sized around that rather than packed.
          Insets edge = win.getInsets();
          win.add("Center", game);
          win.setSize(
              edge.left + edge.right + Tools.DEFAULT_WIDTH,
              edge.top + edge.bottom + Tools.DEFAULT_HEIGHT);
          game.setBounds(edge.left, edge.top, Tools.DEFAULT_WIDTH, Tools.DEFAULT_HEIGHT);
          game.init();
          game.repaint();
        });
  }
}
