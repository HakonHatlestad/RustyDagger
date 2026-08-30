package DCourt.Harness;

import DCourt.Screens.Areas.Town.arWeapon;

/**
 * A real weapon shop with its widgets left out.
 *
 * <p>Shops build genuine AWT {@code Button}s, which cannot exist without a display, so the shop
 * screens are the one part of the game the harness cannot drive headlessly as-is. Overriding the
 * two widget hooks skips exactly that and nothing else: the resale and base numbers the pricing
 * formula needs are set by {@code arWeapon}'s own constructor, and the hero's Charm is read there
 * too, so every input to a price is the real one.
 */
final class PricingShop extends arWeapon {

  PricingShop() {
    super(null);
  }

  @Override
  public void createTools() {
    // Buttons and lists: presentation, and impossible without a display.
  }

  @Override
  public void addTools() {
    // As above.
  }
}
