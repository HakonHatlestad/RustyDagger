# RustyDagger
![](Splash.png)

Dragon Court, the classic 90's game by Fred Haslam (Ffiends.com). A Quest to reverse-swashbuckle Yon Soursse Cewd...

## Links

- [Reddit](https://reddit.com/r/DragonCourt)
- [Dragon Court: Revived](https://dragoncourt.penguinchilling.com/) — the live, still-maintained
  descendant of this game (build v1.22.012), also run in the browser via CheerpJ

## Build & Run

### Requirements

Any JDK 17 or newer on your `PATH`. Nothing else — the Gradle wrapper is committed, and
Gradle downloads the Java 17 toolchain it compiles with.

### Desktop

```
$ ./gradlew run
```

or build the jar and launch it yourself:

```
$ ./gradlew build
$ java -jar build/libs/RustyDagger.jar
```

### Browser

The same jar runs unmodified in a browser through [CheerpJ](https://cheerpj.com/), a
WebAssembly JVM. Build the web distribution and serve it over HTTP — `file://` will not
work, CheerpJ needs a real origin:

```
$ ./gradlew webDist
$ python3 -m http.server -d build/web 8000
```

Then open <http://localhost:8000>. The first load pulls down the Java runtime and is slow;
after that it is cached.

## Development

```
$ ./gradlew spotlessApply    # format (google-java-format)
$ ./gradlew spotlessCheck    # what CI enforces
```

## House rules

The original rationed play with a daily quest allowance -- `27 + 3 x level` quests, spent
by every action, refilled only when the calendar date changed. That paced a shared server
this port does not have, so **the daily limit is off by default** and a hero can keep
questing. To play it as it shipped:

```
$ java -Ddragoncourt.dailyQuestLimit=true -jar build/libs/RustyDagger.jar
```

Pack overload still costs quests either way: an over-stuffed bag slows you down.

## Limitations

- Multiplayer was removed. There is no server, so the clan hall, postal service and
  rankings are inert.
- Hero data is saved to a file named after the hero, in the working directory.

## Notes on the port

The game was a Java applet. JDK 26 removed the Applet API entirely ([JEP 504]), so
`DCourtApplet` is now `DCourtPanel`, a plain AWT `Panel` that both the desktop window and
CheerpJ can host. Java 17 is the compile target because it is the newest bytecode level
CheerpJ supports.

[JEP 504]: https://openjdk.org/jeps/504
