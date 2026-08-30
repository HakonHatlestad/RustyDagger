# Architecture

The game is one AWT window that swaps a single full-screen "region" component as you move
around. There is no scene graph, no game loop and no threading: everything happens on the AWT
event thread in response to a click.

```
DCourtFrame          desktop window (main)
  └── DCourtPanel    400x300 game surface, holds exactly one Screen at a time
        └── Screen   the current location or dialog
```

`DCourtPanel.setRegion(next)` is the whole navigation system — it removes the old screen, calls
`init()` on the new one and adds it. Every "go somewhere" in the game bottoms out there, usually
via `Tools.setRegion(...)`.

## Packages

| Package | Role |
|---|---|
| `DCourt` | Entry points. `DCourtFrame` (window), `DCourtPanel` (game surface). |
| `DCourt.Screens` | Every location and dialog. `Screen` is the abstract base. |
| `DCourt.Items` | The data model. Everything the game stores is an `Item` tree. |
| `DCourt.Control` | Lookup tables loaded from static data, plus session and persistence. |
| `DCourt.Static` | The game's *content* — quests, monsters, rumours — as string constants. |
| `DCourt.Components` | Hand-rolled AWT widgets. |
| `DCourt.Tools` | Utilities, and `Tools`, which is a god object. |

## Screens

`Screen extends Panel`. Subclasses are named `ar*` ("area"). They are organised by where they sit
in the world rather than by what they do:

- **`Screens/Wilds`** — the four wilderness zones you quest in: `arField`, `arForest`, `arHills`,
  `arMound`, plus `arCastle`. Difficulty ascends in that order.
- **`Screens/Areas`** — the safe places. `arTown` and `arQueen` at the top level, then
  `Areas/Town` (armourer, weaponsmith, trader, tavern), `Areas/Castle` (clan hall, postal),
  `Areas/Forest` (guild, dwarf smith), `Areas/Hills` (gem and magic shops), `Areas/Fields`
  (healer), `Areas/Mound` (goblin), `Areas/Queen` (the court minigames: dice, boast, flirt,
  mingle, study).
- **`Screens/Quest`** — the encounter machinery. `arQuest` picks and narrates an event, `arBattle`
  resolves fights, `Options` builds the player's choices, `Quests`/`VQuests` hold the encounter
  table as serialized strings.
- **`Screens/Template`** — shapes reused by several locations: `Shop`, `Trade`, `Smith`,
  `Transfer` (bank), `Indoors`, `WildsScreen`. Most concrete areas extend one of these.
- **`Screens/Command`** — meta screens outside the fiction: `arEntry` (login), `arCreate`
  (character creation), `arBuild`, `arLoading`, `arExit`, `arFinish`, `arRanking`, `arError`.
- **`Screens/Utility`** — `arNotice` (the message box, used everywhere — most game text reaches
  the player as `new arNotice(nextScreen, text)`), `arStatus` (inventory), `arDetail`, `arPeer`,
  `arPackage`, `arStorage`, `arScribe`.

## Items

Everything persistent is an `Item` — heroes, monsters, swords, gold counts, quest text. They nest,
and the tree serializes to the `{type|field|field}` format documented in [SPEC.md](../SPEC.md).
That same format is both the save file and the way the game's static content is authored, which is
why `Static/Quests.java` is pages of brace-heavy string literals.

```
Item                     abstract base
├── itToken              a bare named thing
│   ├── itValue    (=)   key/value
│   ├── itCount    (#)   key/number  -- gold, marks, fatigue
│   ├── itPercent  (%)   key/chance
│   └── itRandom   (@)   key/roll
└── itList         (~)   named list of Items
    ├── itAgent          anything that can fight
    │   ├── itHero       the player
    │   └── itMonster    everything else
    ├── itArms           weapon or armour: attack/defend/skill + trait flags
    ├── itNote           letters and messages
    └── itText           narrative blocks
```

An `itAgent` carries its state as named child lists — `pack`, `gear`, `temp`, `status`, `rank`,
`values`, and for heroes `store` and `looks`. So "how much gold do I have" is
`getPack().getCount("Marks")`, not a field. This is why almost nothing in the model is typed.

## Control

- **`Player`** — the session: which hero is loaded, save/load, error state. Holds the `itHero`.
- **`MonsterTable`, `GearTable`, `ArmsTable`, `PlaceTable`** — parse the static content in
  `DCourt.Static` into `Item` trees at startup and answer lookups.
- **`SaveStore`** — where `.hero` files live. See [saves.md](saves.md).
- **`GameRules`** — flags for behaviour that deliberately differs from 1997. See
  [porting-notes.md](porting-notes.md).

## Tools

`DCourt.Tools.Tools` is a static god object holding the RNG, the loaded fonts, the image cache,
the current date, the `Player`, and all four lookup tables. Most of the codebase reaches global
state through it (`Tools.getHero()`, `Tools.setRegion()`, `Tools.roll()`).

It is initialised once, from `DCourtPanel.init()`, with the panel as its owner (`papa`). **Any
harness that touches game classes must do `new Tools(new DCourtPanel())` first**, or static
initialisers that load portraits will NPE.

Other utilities: `Buffer` (tokenizer for the save format), `MadLib` (`$name$` substitution in
quest text), `Breaker` (word wrap), `DrawTools`, `StaticLayout` (the layout manager that lets
screens position children at fixed pixel coordinates), `StatusPic` (the status bar),
`Loader`/`FileLoader` (persistence; `Loader` is the vestigial CGI client).

## Components

`FTools extends Panel` is the base for the hand-drawn widgets — `FTextList`, `FTextField`,
`FTextArea`, `FScrollbar`, `Portrait`. They paint themselves with `drawSink`/`drawBar` to get the
1990s bevelled look, and they use the **AWT 1.0 event model** (`handleEvent`, `mouseDown`,
`postEvent`) because that is what they were written against.

That model predates the mouse wheel and focus traversal, so newer input in `FTextList` is wired
with the modern listener API instead.

**The two models cannot coexist on one component.** `addMouseListener`, `addKeyListener` and
`addMouseWheelListener` each set `Component.newEventsOnly`, and from then on AWT delivers only
modern events to that component — its `mouseDown`/`mouseUp`/`mouseDrag` overrides stop being
called, silently. So if you add any listener to a widget, move *all* of its input handling over
in the same change. `FTextList` does this: clicking a row is handled in its `mousePressed`, and
it re-posts the old-style `ACTION_EVENT` itself so screens keying off `e.target == theList` keep
working. Other widgets still on the 1.0 model are fine as they are — leave them.
