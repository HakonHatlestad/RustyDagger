# Porting notes

Every deliberate departure from the 1997 original, and why. **Add to this when you change
behaviour** — otherwise the next person cannot tell a decision from a bug.

## Rules that changed

### The daily quest limit is off

A hero had `27 + 3 * level` quests a day; every action spent fatigue against that, and when it ran
out you waited for the calendar date to change. That paced a shared server. There isn't one, so
it is just a wall between the player and the game.

`itHero.getQuests()` ignores fatigue. Restore the original with
`-Ddragoncourt.dailyQuestLimit=true` — the flag lives in
[`GameRules`](../src/main/java/DCourt/Control/GameRules.java).

Pack **overload** still costs quests, because that is a carry-weight rule rather than a daily
ration.

### Bag space is 75, was 60

Taken from the remake, where it is the most-cited quality-of-life change. `Trader` and `Merchant`
still add 20 each.

### The window is scaled 2x by default

The game draws into a fixed 400x300 canvas and its screens position children at hard-coded pixel
coordinates, so it cannot reflow -- the only way to make it bigger is to scale the whole surface.
Its widgets are heavyweight AWT components, which a parent `Graphics2D` transform cannot touch,
but `sun.java2d.uiScale` scales the native surface itself, decorations included.

`DCourtFrame.applyScale()` sets it from `-Ddragoncourt.scale=N` (default `2`) before the first
AWT call, because the property is only read while the graphics environment initialises. An
explicit `sun.java2d.uiScale`, including one a HiDPI desktop set for you, always wins.

Use `-Ddragoncourt.scale=1` for the original postage stamp.

### The hero is saved on every screen change

The original only saved when you deliberately quit, plus a few clan actions, so a crash lost the
session. `DCourtPanel.setRegion` is the single point every navigation in the game passes through,
which makes it the right hook. Creation and death keep their own save paths.

`-Ddragoncourt.autosave=false` restores save-on-exit only.

### Server-only screens are hidden

The clan hall, post office and rankings still render and still take clicks, but everything behind
them calls a CGI backend that does not exist, so they could only disappoint. They are hidden, not
deleted -- `-Ddragoncourt.multiplayerScreens=true` brings them back.

### Shops show gear against what you are wearing

Each `itArms` in a shop list gets a signed number: the sum of the attack, defence and skill
differences against whatever occupies that slot right now. Without it, buying meant memorising
your loadout and doing the arithmetic yourself. Unidentified (`Secret`) items show nothing,
since their stats are hidden anyway.

### Hero names have no minimum length

The four-character minimum protected a shared server namespace. Offline it only stops you calling
a character "Bob".

## Things removed

### Multiplayer

Already gone before these notes began. There is no server, so the clan hall, postal service,
rankings and player-vs-player peeking are inert — the screens exist and the buttons work, but
`Loader.cgi()` returns nothing for every action except the date lookup.

### Passwords

The login screen had a password field that was never checked: it was handed to a CGI call this
port stubs out, and the length check on it was already commented out, so any value worked. The
field is gone. `Player.loadHero` takes a name only.

### The Applet API

`DCourtApplet extends java.applet.Applet` became `DCourtPanel extends java.awt.Panel`. JDK 26
removed `java.applet` outright ([JEP 504](https://openjdk.org/jeps/504)), so this was compile-or-die,
but it also took the applet-only paths with it: reading applet parameters, deriving art and CGI
URLs from a code base, and the hotlink ("pirate") check that refused to run if the document and
code hosts differed. None of it meant anything offline.

The hardcoded CGI address `http://205.238.11.118/cgibin` went at the same time, along with the
commented-out network call in `Loader` that was its only consumer.

### The applet web page

The old root `index.html` was an `<applet>` tag pointing at that 1997 address. Dead in every
browser since 2017; replaced by the CheerpJ page in `web/`.

## Things added

### A browser build

`./gradlew webDist` produces `build/web/`: the ordinary jar plus a page that boots it under
[CheerpJ](https://cheerpj.com/), a WebAssembly JVM. It calls `cheerpjRunJar` against the desktop
`main()`, so there is no separate web codebase and no applet.

**This is why the compile target is Java 17** — CheerpJ supports Java 8, 11 and 17, and nothing
newer.

### A hero picker

The entry screen lists heroes that have saves. Previously the only way to find out what you had
was to look in the filesystem and retype the name exactly.

### Mouse wheel and keyboard navigation in lists

From the remake. Wheel scrolls two rows per notch; arrows and W/S move the selection, PageUp/Down
jump a screen, Home/End go to the ends, Enter/Space activate. Applies to every list in the game,
since they are all `FTextList`.

### A save directory

See [saves.md](saves.md). Heroes used to be bare files in the working directory.

## Bugs fixed

| Fix | Symptom |
|---|---|
| Frame sizing uses `pack()` | `getInsets()` was read before the window manager reported real insets, so the frame came out short and clipped the bottom of every screen. On this box insets.top is 74px. |
| `Images/Other/Guard.jpg` added | Missing from the repo entirely; the castle guard had no portrait. |
| `Faces/Serville.jpg` → `Servile.jpg` | `arClanHall` asked for a filename that did not match the shipped asset, so the clan hall portrait never loaded. |
| `prefferedSize()` → `getPreferredSize()` | Typo, so it overrode nothing and the panel had no preferred size. Needed for `pack()`. |
| `new Integer(s)` / `new Long(s)` replaced | Constructors deprecated for removal; the build now passes `-Xlint:removal` clean. |
| `Tools.roll()` no longer returns negatives | It negated a raw `nextInt()` and took a modulus. `Integer.MIN_VALUE` negates to itself, so roll could go negative and crash `select()` as an array index. Now `nextInt(bound)`, which is also free of the old modulo bias. Verified uniform over 6M samples, no negatives. |

## Known and left alone

- **`FTextList.getItem(index)` ignores its argument** and returns the selected item.
  `arPostal` depends on that behaviour.
- **No tests.** Verification is running the game; see [development.md](development.md).
