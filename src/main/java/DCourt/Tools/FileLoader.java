package DCourt.Tools;

import DCourt.Control.SaveStore;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/** Local stand-in for the CGI backend the original talked to. */
public class FileLoader extends Loader {

  public static Buffer cgiBuffer(String action, String data) {
    return new Buffer(cgi(action, data));
  }

  private static String getToday() {
    return LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
  }

  public static Buffer loadHero(String name) {
    String data = SaveStore.read(name);
    if (data == null) {
      System.out.println("Hero " + name + " file not found");
      return new Buffer("");
    }
    return new Buffer(data);
  }

  public static Buffer saveHero(String name, String data) {
    String error = SaveStore.write(name, data);
    return new Buffer(error == null ? "" : "Error: " + error);
  }

  public static String cgi(String action, String data) {
    switch (action) {
      case FINDHERO:
        // The server used to answer with the date plus clan/leader/powers fields. Only the
        // date matters offline; the rest stay empty.
        return getToday() + "|0||";
      default:
        System.out.println(action + " not implemented");
        return "Error: " + action + " not implemented";
    }
  }
}
