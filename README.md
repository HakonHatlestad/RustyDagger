# RustyDagger
![](Splash.png)

Dragon Court, the classic 90's game by Fred Haslam (Ffiends.com). A Quest to reverse-swashbuckle Yon Soursse Cewd...

## Links

- [Reddit](https://reddit.com/r/DragonCourt)
- [Dragon Court: Revived](https://dragoncourt.penguinchilling.com/) — the live, still-maintained
  descendant of this game (build v1.22.012), also run in the browser via CheerpJ

## Two builds

This repository holds the game twice over, on purpose.

- **`app/`** — the TypeScript rewrite, and where the work is. Playable in a browser end to end: make
  a character, hunt across ten regions, fight, loot, drink what you loot mid-fight, spend the
  proceeds in four shops and at the guild, enchant what you are carrying, buy your way into the
  places beyond the first four, and come back to it later because it saves. This is what
  [docs/roadmap.md](docs/roadmap.md) is about.
- **the Java build** — the 1997 applet, ported to run on the desktop and in a browser. Still fully
  playable, and it is also the **reference the rewrite is checked against**: `./gradlew baseline`
  records how it behaves and the TypeScript suite is held to that.

Neither is finished replacing the other. The Java build still has the castle proper, the Vortex and
the queen's minigames; the rewrite has everything else, built properly, and several things the Java
build never had.

**The rewrite is deliberately not the same game.** The original is a *daily* game — a ration of
quests, gear that wears out, something lost when you die — because that is how a 1997 browser game
earned its living off a shared server. There is no server. The rewrite takes all of it out and is a
single-player game you can sit down and finish; the fight itself is where the tension lives.
[docs/porting-notes.md](docs/porting-notes.md) has the reasoning.

## Build & Run

### The rewrite

```
$ cd app
$ pnpm install
$ pnpm dev              # play it at the address printed
$ pnpm verify           # type check, lint, format, 353 tests, build, smoke test
```

Needs Node 20+ and pnpm. On first run it asks you to make a character; after that it picks up where
you left off. **Save a copy** downloads a `.hero` the Java build can open, and **Load a character**
takes one back.

### Requirements

Any JDK 17 or newer on your `PATH`. Nothing else — the Gradle wrapper is committed, and
Gradle downloads the Java 17 toolchain it compiles with.

### Desktop

```
$ ./gradlew run              # 4x, the default
$ ./gradlew run -Pscale=1    # 400x300, the original size
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

## Saves

The Java build keeps heroes in [saves/](saves/) as plain-text files; the rewrite keeps one in your
browser. Both read and write the same 1997 format, so a character crosses either way — **Save a
copy** in the web app downloads a `.hero` the Java build opens, and **Load a character** takes one
back.

Play files are **not** committed: they used to be, and the test suite ended up reading one as a
fixture. See [docs/saves.md](docs/saves.md).

## Documentation

- [docs/gameplay.md](docs/gameplay.md) - character creation, combat maths, RNG, items, the economy
- [docs/architecture.md](docs/architecture.md) - package map and the Screen/Item models
- [docs/saves.md](docs/saves.md) - save format, and where a character lives in each build
- [docs/porting-notes.md](docs/porting-notes.md) - every departure from the 1997 original
- [docs/development.md](docs/development.md) - building, and how to verify a UI change
- [SPEC.md](SPEC.md) - the `{type|field|field}` serialization format
- [docs/roadmap.md](docs/roadmap.md) - what happens next, and in what order
- [docs/adr/2026-08-30-typescript-rewrite.md](docs/adr/2026-08-30-typescript-rewrite.md) - why the
  game is being rebuilt as a web app
- [docs/remake-comparison.md](docs/remake-comparison.md) - what the still-maintained remake
  changed, and which of it we take
- [CLAUDE.md](CLAUDE.md) - orientation for agents working in this repo

The rewrite's own working notes live with the code: `app/src/rules/` is the game's maths,
`app/src/game/` the state and content, `app/src/ui/` the interface.

## Options

All set with `-D` on the command line, e.g.
`java -Ddragoncourt.scale=1 -jar build/libs/RustyDagger.jar`.

| Property | Default | Effect |
|---|---|---|
| `dragoncourt.scale` | `4` | Window scale -- 400x300 is a postage stamp on a modern display. Set `1` for the original size. See [porting-notes](docs/porting-notes.md). |
| `dragoncourt.saveDir` | `saves` | Where hero files live. |
| `dragoncourt.autosave` | `true` | Save on every screen change. `false` = save on exit only. |
| `dragoncourt.dailyQuestLimit` | `false` | `true` restores the original daily quest allowance. |
| `dragoncourt.multiplayerScreens` | `false` | `true` shows the clan hall, post office and rankings, which need a server that no longer exists. |

## House rules

The original rationed play with a daily quest allowance -- `27 + 3 x level` quests, spent
by every action, refilled only when the calendar date changed. That paced a shared server
this port does not have, so **the daily limit is off by default** and a hero can keep
questing. To play it as it shipped:

```
$ java -Ddragoncourt.dailyQuestLimit=true -jar build/libs/RustyDagger.jar
```

Pack overload still costs quests either way: an over-stuffed bag slows you down.

Bag space is 75 rather than the original 60, the hero is saved on every screen change, shops show how gear compares to what you are wearing, and the login screen lists
your saved heroes instead of asking for a password. Full list, with reasons:
[docs/porting-notes.md](docs/porting-notes.md).

## Limitations

- Multiplayer was removed. There is no server, so the clan hall, postal service and
  rankings are inert.
- Hero data is saved to a file named after the hero, in the working directory.

In the rewrite, additionally: only the fields region exists, there is no character-creation screen,
and the artwork has not been carried over. [docs/roadmap.md](docs/roadmap.md) has the full list.

## Notes on the port

The game was a Java applet. JDK 26 removed the Applet API entirely ([JEP 504]), so
`DCourtApplet` is now `DCourtPanel`, a plain AWT `Panel` that both the desktop window and
CheerpJ can host. Java 17 is the compile target because it is the newest bytecode level
CheerpJ supports.

[JEP 504]: https://openjdk.org/jeps/504
