import DCourt.DCourtFrame;
import java.awt.Frame;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;

/** Launches the game and paints the window into a PNG, so a UI change can be eyeballed. */
public class Shot {
  public static void main(String[] a) throws Exception {
    String out = a.length > 0 ? a[0] : "shot.png";
    long waitMs = a.length > 1 ? Long.parseLong(a[1]) : 3000;
    DCourtFrame.main(new String[0]);
    Thread.sleep(waitMs);
    Frame win = Frame.getFrames()[0];
    BufferedImage img =
        new BufferedImage(win.getWidth(), win.getHeight(), BufferedImage.TYPE_INT_RGB);
    Graphics2D g = img.createGraphics();
    win.printAll(g);
    g.dispose();
    ImageIO.write(img, "png", new File(out));
    System.out.println("painted " + win.getWidth() + "x" + win.getHeight() + " -> " + out);
    System.exit(0);
  }
}
