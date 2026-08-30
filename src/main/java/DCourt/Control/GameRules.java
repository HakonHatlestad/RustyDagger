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

  private GameRules() {}
}
