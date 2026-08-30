package DCourt.Harness;

import java.nio.file.Path;

/** Entry point for {@code ./gradlew exportContent}. See {@link Export}. */
public final class ExportMain {

  private ExportMain() {}

  public static void main(String[] args) throws Exception {
    Harness.boot();
    Path dir = Path.of(args.length > 0 ? args[0] : "content");
    Export.run(dir);
    System.out.println("wrote " + dir.toAbsolutePath());
  }
}
