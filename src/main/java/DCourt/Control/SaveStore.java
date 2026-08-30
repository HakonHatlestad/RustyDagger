package DCourt.Control;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

/**
 * Where heroes live on disk.
 *
 * <p>The original wrote each hero to a bare file named after them in whatever the working directory
 * happened to be, which made saves easy to lose and impossible to find. They now live in one
 * directory of plain-text {@code .hero} files, so the whole set can be committed to git and pulled
 * down on another machine.
 *
 * <p>Point {@code -Ddragoncourt.saveDir=/some/path} at a different directory to keep saves outside
 * the checkout -- a synced folder, or a separate git repo.
 */
public final class SaveStore {

  public static final String DIR_PROPERTY = "dragoncourt.saveDir";
  static final String DEFAULT_DIR = "saves";
  static final String EXTENSION = ".hero";

  private SaveStore() {}

  /** The save directory, created if it does not exist yet. */
  public static Path directory() {
    Path dir = Paths.get(System.getProperty(DIR_PROPERTY, DEFAULT_DIR));
    try {
      Files.createDirectories(dir);
    } catch (IOException e) {
      System.err.println("Could not create save directory " + dir + ": " + e.getMessage());
    }
    return dir;
  }

  /** Hero names with a save on disk, alphabetical and case-insensitive. */
  public static List<String> listHeroes() {
    Path dir = directory();
    if (!Files.isDirectory(dir)) {
      return List.of();
    }
    try (Stream<Path> files = Files.list(dir)) {
      List<String> names = new ArrayList<>();
      files
          .filter(Files::isRegularFile)
          .map(p -> p.getFileName().toString())
          .filter(n -> n.endsWith(EXTENSION))
          .forEach(n -> names.add(n.substring(0, n.length() - EXTENSION.length())));
      names.sort(Comparator.comparing(String::toLowerCase));
      return names;
    } catch (IOException e) {
      System.err.println("Could not list saves in " + dir + ": " + e.getMessage());
      return List.of();
    }
  }

  public static boolean exists(String hero) {
    return Files.isRegularFile(fileFor(hero));
  }

  /** The hero's saved data, or null if there is none. */
  public static String read(String hero) {
    Path file = fileFor(hero);
    if (!Files.isRegularFile(file)) {
      // Saves written before this port used a bare file in the working directory.
      Path legacy = Paths.get(sanitize(hero));
      if (!Files.isRegularFile(legacy)) {
        return null;
      }
      System.out.println("Reading legacy save " + legacy + "; it will be re-saved to " + file);
      file = legacy;
    }
    try {
      return Files.readString(file, StandardCharsets.UTF_8);
    } catch (IOException e) {
      System.err.println("Failed to load hero " + hero + ": " + e.getMessage());
      return null;
    }
  }

  /** Writes the hero's data. Returns an error message, or null on success. */
  public static String write(String hero, String data) {
    Path file = fileFor(hero);
    try {
      Files.createDirectories(file.getParent());
      // Write beside the target and swap, so a crash mid-save cannot shred an existing hero.
      Path temp = file.resolveSibling(file.getFileName() + ".tmp");
      Files.writeString(temp, data, StandardCharsets.UTF_8);
      Files.move(temp, file, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
      return null;
    } catch (IOException e) {
      System.err.println("Failed to save hero " + hero + ": " + e.getMessage());
      return e.getMessage();
    }
  }

  /** Where this hero is stored. */
  public static Path fileFor(String hero) {
    return directory().resolve(sanitize(hero) + EXTENSION);
  }

  /** Keeps a hero name usable as a filename on every platform without mangling ordinary names. */
  static String sanitize(String hero) {
    if (hero == null || hero.isBlank()) {
      return "hero";
    }
    StringBuilder out = new StringBuilder(hero.length());
    for (char c : hero.toCharArray()) {
      out.append(Character.isLetterOrDigit(c) || c == ' ' || c == '_' || c == '-' ? c : '_');
    }
    return out.toString().trim();
  }
}
