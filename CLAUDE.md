# Working on RustyDagger

Notes for anyone — human or agent — picking this repo up cold. Detail lives in [docs/](docs/);
this file is the short version plus the traps.

## What this is

A 1997 Java **applet** game, decompiled, now a desktop AWT program that also runs in a browser.
The gameplay code is machine-decompiled and reads like it: `String.valueOf(String.valueOf(x))`
everywhere, AWT 1.0 event handling, `ar*` class names. **That is expected, not something to
tidy up wholesale.** Reformatting a file you did not otherwise touch buries the real change.

## Build and run

```
./gradlew run                       # play it
./gradlew build                     # jar -> build/libs/RustyDagger.jar
./gradlew webDist                   # browser build -> build/web/
./gradlew spotlessApply             # format; ALWAYS before committing
```

Nothing needs installing but a JDK 17+. Gradle downloads the Java 17 toolchain itself.

**CI fails on `spotlessCheck`, not on tests.** google-java-format is enforced. Run
`spotlessApply` before every commit or the build goes red on formatting alone.

## Hard constraints

| Constraint | Why |
|---|---|
| **Compile target is Java 17** | CheerpJ, which runs the browser build, supports 8/11/17 and no higher. Do not raise it. |
| **Never import `java.applet.*`** | Removed from the JDK in 26 (JEP 504). The port exists to be rid of it. |
| **Art paths are classpath-root relative** | `Images/` is a resource root, so a portrait is `"Faces/Hero.jpg"`, not `"Images/Faces/Hero.jpg"`. |

## Seeing your change

There are **no tests**. The only real verification is running it, and the game is a GUI, so:

```
./gradlew build
javac -cp build/libs/RustyDagger.jar -d /tmp/shot tools/Shot.java
cd /tmp/shot && java -cp /path/to/build/libs/RustyDagger.jar:. Shot screen.png 3500
```

[tools/Shot.java](tools/Shot.java) launches the game, waits, and paints the window into a PNG
you can open. See [docs/development.md](docs/development.md) for driving the UI (selecting list
rows, filling fields) before the capture.

**Do not reach for `java.awt.Robot` screen capture.** Two reasons, both real here: under
Wayland/XWayland it returns an all-black image, and inside the VS Code **snap** terminal it dies
outright with `symbol lookup error: /snap/core20/.../libpthread.so.0`. `printAll` into a
`BufferedImage` avoids both — it never touches the screen or native capture libs. If you do need
a real subprocess with a working native stack, scrub the environment first:
`env -i HOME="$HOME" PATH=/usr/bin:/bin DISPLAY=:0 java ...`.

## Where things are

- **[docs/architecture.md](docs/architecture.md)** — package map, what each layer does, the
  `Screen` and `Item` models, the `Tools` god object.
- **[docs/gameplay.md](docs/gameplay.md)** — character creation, combat maths, the RNG
  primitives, items and decay. Read this before touching balance.
- **[docs/saves.md](docs/saves.md)** — save format, where files live, git syncing.
- **[docs/porting-notes.md](docs/porting-notes.md)** — every deliberate departure from the 1997
  original, and why. **Add to it when you change behaviour.**
- **[SPEC.md](SPEC.md)** — the `{type|field|field}` serialization format.

## Conventions

- **Rules that differ from the original go in `DCourt.Control.GameRules`**, as a flag read from a
  system property, defaulting to the modern behaviour. Do not scatter `if` checks — every quest
  gate in the game already funnels through one method, and that is why the daily limit was a
  one-line change. The same is true of navigation (`DCourtPanel.setRegion`, where autosave hangs)
  and of item lists (`FTextList`, where wheel and keyboard support went in once for every screen).
  Look for the chokepoint before editing thirty call sites.
- **Record behaviour changes in `docs/porting-notes.md` in the same commit.** Six months on, the
  question is always "was this a bug or a decision?"
- Commit messages say what a player would notice, then why. The decompiled names mean nothing on
  their own.
