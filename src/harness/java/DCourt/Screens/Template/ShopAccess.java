package DCourt.Screens.Template;

import DCourt.Items.List.itArms;

/**
 * Reaches the shop pricing rules, which are package-private on {@link Shop}.
 *
 * <p>Prices are a rule, not presentation: what a shop pays for your old sword is decided by the
 * item's table cost, the shop's own resale and base numbers, your Charm and whether you are a
 * Merchant. A port that gets this subtly wrong changes the economy without changing a visible
 * number anywhere, which is exactly the kind of drift the baseline exists to catch.
 */
public final class ShopAccess {

  private ShopAccess() {}

  /** What the shop will pay you for an item you are carrying. */
  public static int packValue(Shop shop, DCourt.Items.Item it) {
    return shop.packValue(it);
  }

  /** The item's table cost, before any haggling. */
  public static int stockValue(Shop shop, DCourt.Items.Item it) {
    return shop.stockValue(it);
  }

  /**
   * The signed stat difference against what you are already wearing.
   *
   * <p>Shops show this and the inventory screen does not, which is the asymmetry the rewrite is
   * meant to close -- so the rule needs recording before it moves.
   */
  public static String equippedDelta(Shop shop, itArms item) {
    return shop.equippedDelta(item);
  }
}
