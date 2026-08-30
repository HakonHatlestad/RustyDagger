package DCourt.Components;

import java.awt.Color;
import java.awt.Event;
import java.awt.Font;
import java.awt.Graphics;
import java.awt.Rectangle;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.awt.event.KeyAdapter;
import java.awt.event.KeyEvent;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.awt.event.MouseWheelEvent;
import java.util.ArrayList;
import java.util.List;

/* loaded from: DCourt.jar:DCourt/Components/FTextList.class */
public class FTextList extends FTools {
  FScrollbar scroll;
  int width;
  int height;
  String[] text = null;
  int selectVal = -1;
  int base = 0;
  boolean canSelect = true;
  private final List<ActionListener> actionListeners = new ArrayList<>();

  public FTextList() {
    this.scroll = null;
    FScrollbar fScrollbar = new FScrollbar();
    this.scroll = fScrollbar;
    add(fScrollbar);
    reshape(0, 0, 50, 50);
    installInput();
  }

  public FTextList(Font f) {
    super(f);
    this.scroll = null;
    FScrollbar fScrollbar = new FScrollbar();
    this.scroll = fScrollbar;
    add(fScrollbar);
    reshape(0, 0, 50, 50);
    installInput();
  }

  /**
   * Mouse wheel, keyboard navigation and row clicking. The rest of the game still uses the AWT 1.0
   * event model it was decompiled with, but that model predates the wheel and focus traversal, so
   * this list has to use the modern listener API -- and once a Component has any modern listener,
   * AWT stops delivering the 1.0 events to it entirely. Clicking therefore has to be handled here
   * too; it cannot stay on {@code mouseDown}.
   */
  private void installInput() {
    setFocusable(true);
    addMouseWheelListener(
        (MouseWheelEvent e) -> {
          // Two rows per notch, matching what the remake settled on.
          scrollBy(e.getWheelRotation() * 2);
        });
    addMouseListener(
        new MouseAdapter() {
          @Override
          public void mousePressed(MouseEvent e) {
            requestFocusInWindow();
            selectAt(e.getY());
          }
        });
    addKeyListener(
        new KeyAdapter() {
          @Override
          public void keyPressed(KeyEvent e) {
            handleNavigation(e);
          }
        });
  }

  private void handleNavigation(KeyEvent e) {
    if (this.text == null || this.text.length == 0) {
      return;
    }
    int last = this.text.length - 1;
    int page = Math.max(1, showLines());
    switch (e.getKeyCode()) {
      case KeyEvent.VK_UP:
      case KeyEvent.VK_W:
        moveSelection(-1, last);
        break;
      case KeyEvent.VK_DOWN:
      case KeyEvent.VK_S:
        moveSelection(1, last);
        break;
      case KeyEvent.VK_PAGE_UP:
        moveSelection(-page, last);
        break;
      case KeyEvent.VK_PAGE_DOWN:
        moveSelection(page, last);
        break;
      case KeyEvent.VK_HOME:
        selectDirectly(0);
        break;
      case KeyEvent.VK_END:
        selectDirectly(last);
        break;
      case KeyEvent.VK_ENTER:
      case KeyEvent.VK_SPACE:
        if (this.selectVal >= 0) {
          fireAction();
        }
        return;
      default:
        return;
    }
    e.consume();
  }

  private void moveSelection(int delta, int last) {
    int from = this.selectVal < 0 ? (delta > 0 ? -1 : last + 1) : this.selectVal;
    selectDirectly(Math.max(0, Math.min(last, from + delta)));
  }

  /** Selects an index outright, unlike setSelect, which toggles a repeated pick off again. */
  private void selectDirectly(int index) {
    if (!this.canSelect || this.text == null || index < 0 || index >= this.text.length) {
      return;
    }
    this.selectVal = index;
    scrollIntoView(index);
    repaint();
    fireAction();
  }

  private void scrollBy(int rows) {
    int max = this.scroll.getMax();
    int next = Math.max(0, Math.min(max, this.scroll.getVal() + rows));
    if (next != this.scroll.getVal()) {
      this.scroll.setVal(next);
      repaint();
    }
  }

  private void scrollIntoView(int index) {
    int shown = showLines();
    int top = this.scroll.getVal();
    if (index < top) {
      this.scroll.setVal(index);
    } else if (index >= top + shown) {
      this.scroll.setVal(Math.min(this.scroll.getMax(), (index - shown) + 1));
    }
  }

  /** Notified whenever the selection changes, by mouse or keyboard. */
  public void addActionListener(ActionListener l) {
    if (l != null) {
      this.actionListeners.add(l);
    }
  }

  private void fireAction() {
    ActionEvent event = new ActionEvent(this, ActionEvent.ACTION_PERFORMED, "select");
    for (ActionListener l : new ArrayList<>(this.actionListeners)) {
      l.actionPerformed(event);
    }
  }

  public void reshape(Rectangle r) {
    super.reshape(r.x, r.y, r.width, r.height);
  }

  public void reshape(int x, int y, int w, int h) {
    super.reshape(x, y, w, h);
    this.width = w - 6;
    this.height = h;
    this.scroll.reshape(w - 12, 0, 12, this.height);
    FixScroller();
  }

  public void setCanSelect(boolean val) {
    this.canSelect = val;
  }

  @Override // DCourt.Components.FTools
  public void setFill(Color fc) {
    super.setFill(fc);
    this.scroll.setFill(fc);
  }

  @Override // DCourt.Components.FTools
  public void update(Graphics g) {
    paintAll(g);
  }

  public void paint(Graphics g) {
    g.setColor(this.fill);
    g.fillRect(0, 0, bounds().width, bounds().height);
    this.base = this.scroll.getVal();
    if (this.text != null) {
      g.setColor(getForeground());
      g.setFont(getFont());
      int show = showLines() + 1;
      int textH = this.fmet.getHeight();
      int v = 3 + this.fmet.getAscent();
      int ix = 0;
      while (ix < show && this.base + ix < this.text.length) {
        g.drawString(this.text[this.base + ix], 3, v + (ix * textH));
        ix++;
      }
      int pick = this.selectVal - this.base;
      if (pick >= 0 && pick < show) {
        g.setColor(this.dark);
        g.fillRect(3, 3 + (pick * textH), this.width, textH);
        g.setColor(this.glow);
        g.drawString(this.text[this.selectVal], 3, v + (pick * textH));
      }
    }
    drawSinkBorder(g);
  }

  @Override // DCourt.Components.FTools
  public boolean handleEvent(Event e) {
    if (e.target != this.scroll || this.scroll.getVal() == this.base) {
      return super.handleEvent(e);
    }
    repaint();
    return true;
  }

  /** Picks the row under a click. Screens key off the 1.0 ACTION_EVENT, so it still goes out. */
  private void selectAt(int y) {
    // Hit-test against the scrollbar's current value, not `base`. `base` is only refreshed
    // inside paint(), and repaint() is asynchronous -- so after a wheel scroll, a click that
    // landed before the repaint selected whatever row had been under the cursor beforehand.
    int top = this.scroll.getVal();
    if (!setSelect(top + ((y - 3) / this.fmet.getHeight()))) {
      return;
    }
    postEvent(new Event(this, 1001, (Object) null));
    fireAction();
  }

  public void addItem(String str) {
    if (this.text == null) {
      addItem(str, 0);
    } else {
      addItem(str, this.text.length);
    }
    repaint();
  }

  public void addItem(String str, int index) {
    if (str != null) {
      if (this.text == null) {
        this.text = new String[1];
        this.text[0] = str;
        FixScroller();
        return;
      }
      if (index < 0 || index >= this.text.length) {
        index = this.text.length;
      }
      String[] temp = new String[this.text.length + 1];
      for (int i = 0; i < index; i++) {
        temp[i] = this.text[i];
      }
      temp[index] = str;
      for (int i2 = index; i2 < this.text.length; i2++) {
        temp[i2 + 1] = this.text[i2];
      }
      this.text = temp;
      FixScroller();
      repaint();
    }
  }

  public void clear() {
    this.text = null;
    FixScroller();
    repaint();
  }

  public void delItem(int index) {
    if (this.text != null && index >= 0 && index < this.text.length) {
      if (this.text.length == 1) {
        this.text = null;
        return;
      }
      String[] temp = new String[this.text.length - 1];
      for (int i = 0; i < index; i++) {
        temp[i] = this.text[i];
      }
      for (int i2 = index + 1; i2 < this.text.length; i2++) {
        temp[i2 - 1] = this.text[i2];
      }
      this.text = temp;
      if (this.selectVal >= this.text.length) {
        this.selectVal = -1;
      }
      FixScroller();
      repaint();
    }
  }

  public void setItem(String str, int index) {
    if (this.text != null && index >= 0 && index < this.text.length) {
      this.text[index] = str;
      repaint();
    }
  }

  public boolean setSelect(int index) {
    if (!this.canSelect || this.selectVal == index) {
      return false;
    }
    if (this.text == null || index < 0 || index >= this.text.length) {
      this.selectVal = -1;
    } else if (this.selectVal == -1 || index != this.selectVal) {
      this.selectVal = index;
    } else {
      this.selectVal = -1;
    }
    repaint();
    return true;
  }

  public String getItem(int index) {
    if (this.text == null || this.selectVal < 0 || this.selectVal >= this.text.length) {
      return null;
    }
    return this.text[this.selectVal];
  }

  public int getSelect() {
    return this.selectVal;
  }

  public boolean isEmpty() {
    return this.text == null || this.text.length == 0;
  }

  public void FixScroller() {
    if (this.text == null) {
      this.scroll.show(false);
      return;
    }
    int count = this.text.length;
    int shown = showLines();
    if (shown >= count) {
      this.scroll.show(false);
      return;
    }
    this.scroll.setMax(count - shown);
    this.scroll.show(true);
    repaint();
  }

  public int showLines() {
    return this.height / this.fmet.getHeight();
  }
}
