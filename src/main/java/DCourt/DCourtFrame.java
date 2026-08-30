package DCourt;

import java.awt.BorderLayout;
import java.awt.EventQueue;
import java.awt.Frame;
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
