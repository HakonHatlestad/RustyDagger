package DCourt.Control;

/** Rules where this port deliberately departs from the 1997 original. */
public final class GameRules {

  /**
   * Whether the daily quest allowance is enforced.
   *
   * <p>Dragon Court was a persistent web game that rationed play: a hero got {@code 27 + 3 * level}
   * quests a day, every action spent some, and once they were gone you waited for the calendar date
   * to change. That existed to pace a shared server, which this single-player port does not have,
   * so the allowance is ignored by default and a hero can keep questing.
   *
   * <p>Launch with {@code -Ddragoncourt.dailyQuestLimit=true} to play it as it shipped.
   */
  public static final boolean DAILY_QUEST_LIMIT = Boolean.getBoolean("dragoncourt.dailyQuestLimit");

  /**
   * Whether to show the screens that needed a server.
   *
   * <p>The clan hall, post office and rankings still render and still take clicks, but every action
   * behind them goes to a CGI backend that no longer exists, so they can only disappoint. They are
   * hidden rather than deleted, in case a server ever comes back.
   *
   * <p>Launch with {@code -Ddragoncourt.multiplayerScreens=true} to show them anyway.
   */
  public static final boolean MULTIPLAYER_SCREENS =
      Boolean.getBoolean("dragoncourt.multiplayerScreens");

  /**
   * Whether the hero is saved on every screen change.
   *
   * <p>The original only saved when you deliberately quit, or on a handful of clan actions, so a
   * crash lost the session. Saving is a sub-millisecond write of about a kilobyte.
   *
   * <p>Launch with {@code -Ddragoncourt.autosave=false} to save only on exit, as it shipped.
   */
  public static final boolean AUTOSAVE =
      !"false".equalsIgnoreCase(System.getProperty("dragoncourt.autosave"));

  private GameRules() {}
}
