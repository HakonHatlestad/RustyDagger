package DCourt.Items.Token;

import DCourt.Items.Item;
import DCourt.Tools.Buffer;
import DCourt.Tools.Tools;

/* loaded from: DCourt.jar:DCourt/Items/Token/itRandom.class */
public class itRandom extends itCount {
  itRandom() {}

  itRandom(itCount it) {
    super(it);
  }

  itRandom(itRandom it) {
    super(it);
  }

  @Override // DCourt.Items.Token.itCount, DCourt.Items.itToken, DCourt.Items.Item
  public Item copy() {
    return new itRandom(this);
  }

  @Override // DCourt.Items.Token.itCount
  public int makeCount() {
    return Tools.roll(1 + getCount());
  }

  /**
   * The icon has to be the one {@code Item.factory} reads back, which is {@code @}.
   *
   * <p>It used to return {@code *}, which nothing parses -- so an itRandom could be written but
   * never read, and a list containing one was silently truncated at that point on the way back in.
   * SPEC.md always documented {@code @}; the code disagreed with it. Nothing in the shipping game
   * hit this, because itRandom only lives in monster prototypes, which are parsed once from source
   * and never serialised. Exporting that content is what surfaced it.
   */
  @Override // DCourt.Items.Token.itCount, DCourt.Items.itToken, DCourt.Items.Item
  public String getIcon() {
    return "@";
  }

  public static Item factory(Buffer buf) {
    return new itRandom((itCount) itCount.factory(buf));
  }
}
