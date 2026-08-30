# Development

## Build

```
./gradlew run                # play
./gradlew build              # jar -> build/libs/RustyDagger.jar
./gradlew webDist            # browser build -> build/web/
./gradlew spotlessApply      # format
./gradlew spotlessCheck      # what CI enforces
```

Any JDK 17+ launches the wrapper; Gradle downloads the Java 17 toolchain it compiles with, via
the foojay resolver declared in `settings.gradle`. Nothing else needs installing.

CI ([`.github/workflows/build.yml`](../.github/workflows/build.yml)) runs the same commands across
JDK 17, 21 and 25 to catch the build itself breaking on newer JDKs.

**CI fails on formatting.** google-java-format via Spotless is enforced and there are no tests, so
`spotlessCheck` is the gate. Run `spotlessApply` before committing.

## Verifying a change

There are no tests. Verification means running the game, and the game is a GUI — so paint the
window into a PNG and look at it.

```
./gradlew build
javac -cp build/libs/RustyDagger.jar -d /tmp/dc tools/Shot.java
mkdir -p /tmp/dc/run && cd /tmp/dc/run
java -cp $OLDPWD/build/libs/RustyDagger.jar:/tmp/dc Shot entry.png 3500
```

[`tools/Shot.java`](../tools/Shot.java) starts the game, waits the given milliseconds, and
`printAll`s the frame into a PNG.

To verify something behind an interaction, dispatch events before capturing.
[`tools/PickShot.java`](../tools/PickShot.java) is a worked example: it finds the `FTextList` on
the entry screen, sends it a `VK_DOWN`, and captures the result — which is how the hero picker and
its keyboard navigation were checked.

Run it from a scratch directory, not the repo root, unless you want test heroes in `saves/`.

### Do not use `java.awt.Robot` screen capture

Two independent failures on this setup:

- **Wayland/XWayland returns an all-black image.** The capture succeeds and the PNG is valid; it
  is just black. Easy to mistake for a rendering bug in the game.
- **Inside the VS Code snap terminal it dies outright** with
  `symbol lookup error: /snap/core20/current/lib/x86_64-linux-gnu/libpthread.so.0: undefined
  symbol: __libc_pthread_init`. The snap injects its own library paths.

`printAll` into a `BufferedImage` sidesteps both — it renders the component tree directly and
never touches the screen or native capture libraries.

If you genuinely need a subprocess with a clean native stack, scrub the environment:

```
env -i HOME="$HOME" PATH=/usr/bin:/bin DISPLAY=:0 XAUTHORITY="$HOME/.Xauthority" java ...
```

## Writing a harness against game classes

`Tools` is a static god object that must exist before most game classes will even load — `itHero`'s
static initialiser builds a `Portrait`, which asks `Tools` for an image cache. So every harness
starts:

```java
new Tools(new DCourtPanel());
Tools.setToday("2026-08-30");
```

`Tools.getPlayer()` is null until `arLoading` runs, so construct `new Player()` directly.

## Testing the browser build

CheerpJ needs a real HTTP origin; `file://` will not work.

```
./gradlew webDist
python3 -m http.server -d build/web 8000
```

Then open <http://localhost:8000>. First load pulls the Java runtime and is slow.
