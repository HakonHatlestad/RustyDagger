import DCourt.Components.FTextList;
import DCourt.DCourtFrame;
import java.awt.Component;
import java.awt.Container;
import java.awt.EventQueue;
import java.awt.Frame;
import java.awt.Graphics2D;
import java.awt.event.KeyEvent;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;

/** Picks the first saved hero with the keyboard, then screenshots the result. */
public class PickShot {
  public static void main(String[] a) throws Exception {
    DCourtFrame.main(new String[0]);
    Thread.sleep(3000);
    Frame win = Frame.getFrames()[0];
    FTextList list = (FTextList) find(win, FTextList.class);
    System.out.println("found list: " + (list != null));
    EventQueue.invokeAndWait(
        () -> {
          // DOWN selects the first hero, exactly as a player pressing arrow keys would.
          list.dispatchEvent(
              new KeyEvent(list, KeyEvent.KEY_PRESSED, System.currentTimeMillis(), 0,
                  KeyEvent.VK_DOWN, KeyEvent.CHAR_UNDEFINED));
        });
    Thread.sleep(800);
    BufferedImage img =
        new BufferedImage(win.getWidth(), win.getHeight(), BufferedImage.TYPE_INT_RGB);
    Graphics2D g = img.createGraphics();
    win.printAll(g);
    g.dispose();
    ImageIO.write(img, "png", new File(a[0]));
    System.out.println("selected index=" + list.getSelect() + " item=" + list.getItem(list.getSelect()));
    System.exit(0);
  }

  static Component find(Container c, Class<?> type) {
    for (Component k : c.getComponents()) {
      if (type.isInstance(k)) {
        return k;
      }
      if (k instanceof Container) {
        Component hit = find((Container) k, type);
        if (hit != null) {
          return hit;
        }
      }
    }
    return null;
  }
}
