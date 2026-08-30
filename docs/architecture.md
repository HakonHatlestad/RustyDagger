# Architecture

**Two implementations live here.** This document describes the Java one, which is still the whole
game and the reference the rewrite is checked against. The rewrite is described at the bottom, under
[The TypeScript app](#the-typescript-app).

## The Java build

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


## The TypeScript app

`app/` is the rewrite. It is layered, which the Java build is not, and the layering is the point:
the rules are held to the Java build's recorded behaviour, so they must not know anything about
screens.

```
app/src/
  format/   the {type|field|field} grammar: parse and serialise
  rules/    the game's maths -- nothing here imports anything below it
  game/     content, characters, monsters, loot, items, shops, the world,
            saving, and the state machine
  ui/       drawing, and the item descriptions and comparisons a player reads
```

Three rules hold it together.

**The rules layer knows nothing about the interface.** `rules/` takes numbers and returns numbers.
That is what lets `app/test/parity.test.ts` play thousands of fights headlessly and compare them
against `baseline/distributions.txt`.

**Every move goes through one function.** `game/state.ts` exposes `apply(game, move)` and nothing
else mutates the game. That is the same discipline `DCourtPanel.setRegion` enforces on the Java
side, and for the same reason: it is where anything that must happen on *every* transition goes.

**The interface reads state and emits moves.** Plain DOM, no framework — the state is small and
every move re-renders. Text is built with `textContent` and never by assembling HTML, because item
and monster names come from content files and from hand-editable saves.

The one deliberate coupling: `ui/describe.ts` imports from `rules/combat.ts` so that the stat
comparison a shop shows is computed by the same code that decides a fight. Showing a player a
number the rules disagree with would be worse than showing nothing.

### Where each thing lives

| File | What it decides |
|---|---|
| `rules/battle.ts` | A round: swings, initiative, the special actions, and the queue that settles blinding, panic and disease |
| `rules/combat.ts` | Gear and traits into Attack, Defence and Skill, and what a blow does |
| `rules/levelling.ts` | What the next level costs |
| `game/monster.ts` | Scaling a template into the thing you actually meet, and what it decides to do |
| `game/items.ts` | What a potion does, read off the `effect` number in the exported gear table |
| `game/shop.ts` | The three town shops, and what anything is worth — computed from an item's own stats, not looked up |
| `game/world.ts` | The regions, their weighted encounter tables, what unlocks each, and how dangerous one looks to you |
| `game/scrolls.ts` | What a scroll does to an item, and when enchanting one too far destroys it |
| `game/guild.ts` | What a rank costs, and who the guild will teach |
| `rules/growth.ts` | Whether a win teaches you something, and how the chance falls away |
| `game/creation.ts` | The four backgrounds, and the save text a new character starts from |
| `game/save.ts` | Where a character is kept, and reading one back that will not parse |
| `game/state.ts` | Every move a player can make, and what it costs |

### What the tests are for

They are not all the same kind of thing, and treating them as one pile hides which failures matter.

| Suite | Question |
|---|---|
| `parity.test.ts` | Does a whole fight come out like a whole fight in the Java build? |
| `economy.test.ts` | Does a shop charge and pay what the Java charges and pays? |
| `levelling`, `combat`, `random`, `parse` | Does this rule match its recorded values, exactly? |
| `balance.test.ts` | Is the game any *good*? Winnable, losable, and does progress happen? |
| `promises.test.ts` | Does the game do what the interface **says** it does? |
| `ui/render.test.ts` | Does the interface a player touches actually work? |
| `scripts/smoke.mjs` | Does the built artefact boot, play and save? |

`balance.test.ts` is the odd one and the most easily lost: it plays whole sessions through `apply`
and asserts things like "a new character still dies sometimes" and "the Hills are as dangerous as
the warning says". Removing the day cycle took out everything that used to pace the game, so those
properties stopped being free and started needing a check.

`promises.test.ts` exists because of a specific failure worth not repeating. The inventory told
players which items a swap "would replace" — computed correctly, and correct since the day it was
written — while the game appended to a list and replaced nothing, so five right-hand weapons could
be worn at once. Every piece passed its own tests; nobody checked whether the sentence on the screen
was *true*. That file is written from the wording a player sees rather than from the implementation,
and it is where a new promise should be pinned.
