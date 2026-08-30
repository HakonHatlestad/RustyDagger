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

## The parity baseline

```
./gradlew baseline           # records baseline/rules.txt and baseline/distributions.txt
```

`src/harness/java` is a separate source set — it never ships in the game jar — holding a
characterisation harness that records how the game actually behaves, so the TypeScript port can be
checked against it. See [roadmap.md](roadmap.md) for why.

**Parity is defined in two halves, and the split is the important part.**

- `baseline/rules.txt` — the arithmetic, as functions with every input stated and every output a
  number: attack resolution across the stat ranges the game reaches, gear and traits into derived
  combat stats, the special actions, what a character-creation allocation derives, shop pricing and
  the equipped-stat preview, quest and overload accounting, decay, the levelling curve and what
  crossing a level gives you, a save round-trip, and what every monster drops. **Checked exactly.**
  A diff is a port defect.
- `baseline/distributions.txt` — how the game plays over large samples: hit rate for every Skill
  matchup, and complete fights per monster and hero build classified by how they ended. **Checked by
  shape.** A port may consume randomness in a different order; it may not play differently.

The obvious single definition is wrong in both directions, which is worth understanding before
changing any of this. Recording battle prose would freeze the port's wording to the 1997 text, when
the point of the rewrite is a freer presentation. And demanding byte-identical replay would force
the port to mirror the old code's call order — `arBattle`'s constructor consumes randomness before
the fight starts — so a correct rewrite would fail for reasons unrelated to the rules.

Things that cost time to find, and will cost it again:

- **The game is deterministic under `Tools.setSeed`**, and none of it needs a display. That is why
  the harness needed no changes to game code. Loader stages 0 and 1 are skipped: splash and status
  bar, pure display.
- **A chosen action is the actions list's *name*, not an entry in it.** `isMatch` on a list compares
  the list's own name, and `chooseActions` sets it with `setName`. Adding an entry selects nothing,
  silently.
- **`Constants.BERZERK` is spelt `"Berzek"`** in the original. The obvious spelling matches nothing.
- **Gear does not reach `getAttack()` on its own.** That is a stored value; `calcCombat()` is what
  folds in gear, guild ranks and the Agile/Strong/Sturdy traits. Equip without it and the sword does
  nothing.
- **Action multipliers live in `battle()`, not `agentAct()`.** Backstab doubles Guts and Speed
  before either side acts, so characterising a single attack misses them entirely.
- **`Options.nextRound` is not presentation** — it calls `incStance` on hostile and defensive
  monsters, so a fight driver that skips it records a different game.
- The harness redirects `dragoncourt.saveDir` to a temp directory, because levelling triggers the
  game's autosave and would otherwise drop characters into `saves/`.
- **Shops are the one part that will not run headless.** They build real AWT `Button`s, unlike the
  combat screens. `PricingShop` subclasses the real weapon shop and overrides only the two widget
  hooks, so every input to a price — resale and base numbers, your Charm, the Merchant trait — is
  still the shop's own.
- **`costSpecial()` is not recorded, deliberately.** On a smith it prices whatever row is selected
  in the list, so it is a function of the interface rather than of the rules.
- **Character creation is point-buy, not a roll.** There is no randomness in `arCreate.createHero`,
  so what is worth recording is what an allocation derives, not a distribution.

Regenerating and finding a diff means behaviour changed. That is either the bug you meant to fix, or
one you did not.

## Testing the browser build

CheerpJ needs a real HTTP origin; `file://` will not work.

```
./gradlew webDist
python3 -m http.server -d build/web 8000
```

Then open <http://localhost:8000>. First load pulls the Java runtime and is slow.
