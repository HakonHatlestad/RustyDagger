# Working on RustyDagger

Notes for anyone — human or agent — picking this repo up cold. Detail lives in [docs/](docs/);
this file is the short version plus the traps.

## What this is

Two things at once, and knowing which you are in matters.

**`app/`** is a TypeScript rewrite, and where new work goes. It is playable end to end, has a full
quality gate (`cd app && pnpm verify`) and is checked against the Java build's recorded behaviour.
Modern code; treat it as you would any TypeScript project.

It is **deliberately no longer the same game**. The daily quest ration, gear decay and the death
penalty are gone — everything that existed to make a 1997 browser game a daily habit. Parity with
the Java build now means *combat and the economy*, not pacing. Before changing a rule in `app/`,
read the first section of [docs/porting-notes.md](docs/porting-notes.md), which says what was taken
out and why.

**Everything else** is a 1997 Java applet, decompiled, now a desktop AWT program that also runs in a
browser. It still works, and it is the reference the rewrite is measured against, so it stays.

Read [docs/roadmap.md](docs/roadmap.md) before starting anything substantial — it says what is done
and what is not.

### The Java side

A 1997 Java **applet** game, decompiled, now a desktop AWT program that also runs in a browser.
The gameplay code is machine-decompiled and reads like it: `String.valueOf(String.valueOf(x))`
everywhere, AWT 1.0 event handling, `ar*` class names. **That is expected, not something to
tidy up wholesale.** Reformatting a file you did not otherwise touch buries the real change.

## Build and run

```
cd app && pnpm dev                  # play the rewrite
cd app && pnpm verify               # the rewrite's full gate

./gradlew run                       # play the Java build
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

**In `app/`, run `pnpm verify`** — that is type checking, linting, formatting, the full suite, a
build, and a game played through the built bundle. It is what CI runs.

**On the Java side there are no unit tests.** What holds it still is the parity harness
(`./gradlew baseline`), and beyond that the only verification is running it. The game is a GUI, so:

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

- **[docs/design-vision.md](docs/design-vision.md)** — what this game is meant to be, and what it
  deliberately is not. Read this before proposing a feature.
- **[docs/balance-protocol.md](docs/balance-protocol.md)** — the procedure for changing any number
  the game plays by. Read this before touching a formula, cost or rate.
- **[docs/architecture.md](docs/architecture.md)** — package map, what each layer does, the
  `Screen` and `Item` models, the `Tools` god object.
- **[docs/gameplay.md](docs/gameplay.md)** — character creation, combat maths, the RNG
  primitives, items and decay. Read this before touching balance.
- **[docs/saves.md](docs/saves.md)** — save format, where files live, git syncing.
- **[docs/porting-notes.md](docs/porting-notes.md)** — every deliberate departure from the 1997
  original, and why. **Add to it when you change behaviour.**
- **[SPEC.md](SPEC.md)** — the `{type|field|field}` serialization format.
- **[docs/roadmap.md](docs/roadmap.md)** — what happens next, and in what order. Read it before
  starting anything substantial; the plan is a rewrite, not more patching.
- **[docs/adr/2026-08-30-typescript-rewrite.md](docs/adr/2026-08-30-typescript-rewrite.md)** — why
  the game is being rebuilt as a web app rather than modernised in Java.
- **[docs/remake-comparison.md](docs/remake-comparison.md)** — what the still-maintained remake
  changed, and which of it we take.

## Working rules for agents

- **Run the full gate before every commit: `cd app && pnpm verify`.** No scoped substitute, no
  "just the tests for the file I touched". It is type checking, linting, the format check, the whole
  suite, a production build and a smoke test that plays the built bundle, and it takes about twelve
  seconds — cheap enough that there is no case for running less. Run the Java gate
  (`./gradlew spotlessApply spotlessCheck build`) when, and only when, Java sources changed; the
  Java build is the reference and TypeScript-only work cannot affect it. **This is a local
  pre-commit rule and changes nothing about CI** — `.github/workflows/build.yml` runs on every push
  and pull request with no path filters, so the Java job runs whatever you touched.
- **Decide and act; escalate only what is genuinely the user's to decide.** Settle technical and
  implementation questions yourself — approach, structure, naming, which helper to reuse, how to
  test it — and get on with it. Stop and ask only for product intent and scope (what the game
  should become), facts only the user holds, spending or risk tolerance, and anything
  outward-facing or hard to reverse. Player-facing wording, including text that quotes a game
  value, is your own call and needs no permission — with two rules in **Conventions** below still
  binding. The number itself must come from the game rather than a guess ("A number the player
  sees"), and changing that number is a balance change under
  [docs/balance-protocol.md](docs/balance-protocol.md). And wording that states a game value is a
  promise, so pin it in `app/test/promises.test.ts` in the same change ("If the interface says the
  game does something") — that pin is what stops the autonomy producing another sentence the game
  does not honour.
- **Never hack around a problem.** No masking a symptom, no loosening an assertion to make a suite
  green, no faking a result, no `if` branch that special-cases the failing test. If a clean
  solution is not available, say so plainly and say what is blocking it. Loosening an assertion in
  `app/test/balance.test.ts` is the version of this that matters most here: those assertions are
  the game's design intent in executable form.
- **Judge a feature request against [docs/design-vision.md](docs/design-vision.md) before building
  it**, and take any change to a number, formula, price or rate through
  [docs/balance-protocol.md](docs/balance-protocol.md).

## Conventions

- **Rules that differ from the original go in `DCourt.Control.GameRules`**, as a flag read from a
  system property, defaulting to the modern behaviour. Do not scatter `if` checks — every quest
  gate in the game already funnels through one method, and that is why the daily limit was a
  one-line change. The same is true of navigation (`DCourtPanel.setRegion`, where autosave hangs)
  and of item lists (`FTextList`, where wheel and keyboard support went in once for every screen).
  Look for the chokepoint before editing thirty call sites.
- **New gameplay work goes in `app/`, not the Java build.** The Java build is the reference; change
  it only to fix something genuinely broken, and never to add a feature.
- **A number the player sees should come from the game, not from a guess.** Item effects, healing
  amounts, shop rates and prices are all in the Java source or the exported content. When something
  needs a value the port does not have, record it in the harness and regenerate the baseline rather
  than inventing one — that is how the weapon pricing was ported, and how the trait values in
  `shop.ts` are held honest.
- **Any gameplay change ships with a regenerated baseline.** Run `./gradlew baseline`, look at the
  diff, and say in the commit message what moved. The Java build is the reference the TypeScript
  port is checked against, so a rule change that nobody noticed would quietly corrupt it. This
  replaces the blanket freeze the roadmap originally proposed — a freeze was the right precaution
  before the harness existed, but changes are no longer silent, so stopping the only playable build
  from improving buys nothing. See [docs/development.md](docs/development.md).
- **Record behaviour changes in `docs/porting-notes.md` in the same commit.** Six months on, the
  question is always "was this a bug or a decision?"
- **Never let a test read something the game writes.** Fixtures live in `app/test/fixtures/`;
  `saves/*.hero` are play files and are gitignored. The suite once read a real save and three tests
  passed only on the machine that had played.
- **If the interface says the game does something, pin it in `app/test/promises.test.ts`.** The
  inventory told players which items a swap would replace for weeks while the game replaced nothing;
  every individual piece passed its own tests.
- Commit messages say what a player would notice, then why. The decompiled names mean nothing on
  their own.
