# Porting notes

Every deliberate departure from the 1997 original, and why. **Add to this when you change
behaviour** — otherwise the next person cannot tell a decision from a bug.

Two builds live in this repository and they no longer agree, on purpose. Notes that apply only to
the TypeScript rewrite in [`app/`](../app) say so; everything else is about the Java build, which
remains the reference the rewrite's *combat* is measured against.

## The rewrite is a single-player game now

**Applies to `app/` only. The Java build is unchanged.**

The 1997 game is a *daily* game. You get a ration of quests, you spend it, you come back tomorrow —
and gear wears out, and dying costs you something, so there is always a reason to return. That
shape is not an accident and it is not bad design; it is how a 1997 browser game earned its living
off a shared server.

There is no server, and nobody is coming back tomorrow. So the rewrite takes all of it out:

| Removed | What it was | Why |
|---|---|---|
| The daily quest ration | `27 + 3 * level` quests a day, spent by fatigue | A wall between the player and the game, with nothing on the other side of it |
| Gear decay | Every swing risked damaging what you held | A tax on playing, paid in trips to a shop. Its only function was to keep money mattering, and the money economy stands up without it |
| The death penalty | You lost progress when you died | Losing a fight is most of the punishment. It now costs a tenth of your Marks and nothing else — proportional, so it is the same decision whether you are rich or new |
| Fatigue | Counted every action against the day | Nothing reads it any more |

What replaces the pressure is the fight itself, which is the one place this game was always tense.
Within a fight your health is the resource, and the only way to get it back is something you are
carrying. Measured over a 250-quest campaign in the Fields, a level-1 character with a starting
weapon dies 47 times — see `app/test/balance.test.ts`, which plays whole sessions and asserts the
game is still losable.

**Resting is free and complete**, at the temple. Charging for it was considered and dropped: with
no death penalty there is nothing to charge against, because a player who does not want to pay can
simply walk into the fields and lose, and be returned to town in the same state. A fee any player
can decline by losing on purpose is not a cost, it is a chore.

The Java build keeps all four. `-Ddragoncourt.dailyQuestLimit=true` still restores the ration there.

### What else was only ever there for other players

Dropped from the rewrite rather than carried as inert data, so nobody has to wonder whether they are
unfinished or dead:

- **The clan-hall post** — Letter, Postcard, Petition, Denial, Grant. Notes addressed to players who
  cannot exist. They no longer drop.
- **Fame** — feeds nothing but the ranking screen, which is a leaderboard. It is still tracked and
  still shown, and the character sheet now says plainly that it is a record rather than a lever.
- **Age** — gated one thing, buying experience from the healer, on `level + 14 <= age`. Age advanced
  once per real day, so single-player it never moves. Carried through saves untouched; nothing reads
  it.
- **The bank** — protected money from other players' thieves. Never ported, and now never will be.

Two that look like they belong on that list and do not: **Thief Insurance**, which stops a monster
swindling you and is a live rule again, and **Bottled Faery**, which comes out of a single-player
encounter in `arQuest`.

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

### Window scaling is on, and it works

The game draws into a fixed 400x300 canvas and positions children at hard-coded pixel
coordinates, so it cannot reflow -- the only way to make it bigger is to scale the whole
surface. Its widgets are heavyweight AWT components, which a parent `Graphics2D` transform
cannot touch, so `sun.java2d.uiScale` is the only lever available.

`-Ddragoncourt.scale=N` sets it, **defaulting to 4** -- 400x300 is a postage stamp on a modern
display. `DCourtFrame.applyScale()` applies it before the first AWT call, since the property is
only read while the graphics environment initialises. An explicit `sun.java2d.uiScale` always
wins. Set `-Ddragoncourt.scale=1` for the original size.

**It was off by default for a while, on a diagnosis that turned out to be wrong.** The reason
given was that AWT components are not harmonized with HiDPI scaling the way Swing is
([JDK-8143406](https://bugs.java.com/bugdatabase/view_bug.do?bug_id=8143406)), so the surface
would scale while the components kept hit-testing in unscaled coordinates. The symptom that
supposedly proved it was that clicking a list row did nothing.

That symptom had nothing to do with scaling. Adding wheel and keyboard listeners to `FTextList`
set `Component.newEventsOnly`, after which AWT silently stopped calling the AWT-1.0 `mouseDown`
where the row hit-testing lived -- so clicking a row did nothing at *any* scale, in both the
desktop and browser builds. See the Components section of [architecture.md](architecture.md) for
the mechanism; it is a trap that will catch the next person too.

Once that was fixed, scaling was actually tested rather than assumed: `./gradlew run -Pscale=3`,
clicking rows in a shop list, on 2026-08-30. Clicks land on the row you click. The JDK issue
above is real, but it does not bite this game, and the default is now 4.

On X11 a value below 2 is ignored entirely, so fractional scales do nothing there.

**Superseded:** this section used to propose making the widget tree lightweight -- `FTools` and
`Screen` extending `Container` rather than `Panel`, `Portrait` off `Canvas`, lightweight
replacements for `FTextField`/`FTextArea` -- so that `DCourtPanel` could scale its children with a
transform. That work was never scheduled and now will not be, on two counts: scaling works without
it, and the game is being rebuilt as a web app where the problem does not exist. See
[roadmap.md](roadmap.md) and [adr/2026-08-30-typescript-rewrite.md](adr/2026-08-30-typescript-rewrite.md).

The browser build does not have this problem: CheerpJ scales the display outside the JVM, so
`web/index.html` offers 1x/2x/3x and all of them behave.

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

## Added to the rewrite

**All of these apply to `app/` only.**

### Using what you are carrying

The original lets you drink a salve on the status screen between quests, and never during a fight —
which is where you need it. The rewrite lets you use anything, anywhere, and **using something in a
fight costs you the round**: the monster still swings. That keeps a potion a real choice rather
than a strictly better move than fighting.

The amounts are `itAgent`'s, unchanged, because they set how long a fight can be sustained: a salve
is 15 points (25 for a Medic), a Gold Apple 30 (50), food 2 (3). What an item does is read from the
`effect` number in the exported gear table rather than from a second list kept here, so the two
cannot drift apart.

### Weapon traits and thrown dust settle through one rule

`arBattle.spellEffects` resolves blinding, panic and disease from a single queue on the attacker,
which is why a blinding weapon and a handful of Blinding Dust behave identically in the original —
both just add to that queue. The rewrite models the queue rather than the two cases, so they cannot
diverge. It also means blinding and panic get *stronger the more you throw*, since the opposed
check multiplies the thrower's Wits by the count.

The Java build's monster gear traits — a Harpy's disease, a Wyvern's panic — were not implemented
in the port at all before this. They are now, and it moved the port toward the Java, not away.

### Scrolls, and what gold is actually for

Both gear shops together come to about three thousand Marks. The best weapon in the game is worth
forty-one thousand and **cannot be bought at all** — sixty-three of the ninety-one pieces of
equipment are loot only. So gold bought out the shops in the first hour, funded the guild in the
second, and then piled up doing nothing.

The original already had two answers and the port had connected neither.

**Scrolls.** Six of them, 60 to 3,500 Marks, and every trait they grant is one `combat.ts` already
read and applied — Glow, Bless, Luck, Flame. This adds no combat rule at all; it adds a way to reach
the rules that were there. Enchanting is the one that repeats: safe while the enchantment is below
the item's own power, so a great sword absorbs many and a knife almost none, and past that every
further scroll is an opposed check against the overshoot — lose it and the item explodes and wounds
you. Your Wits decides whether the spell takes at all, and a Magic guild rank counts towards it,
which is that track's job beyond the Skill it already grants.

Identify is deliberately left out: nothing in the arms table is unidentified, so it would have
nothing to identify.

**The way onward.** Six regions behind key items, at the 1997 gear table's own prices — Map to
Warrens 500, Map to Treasury 2,000, Castle Permit 5,000, Map to Throne Room 5,000, Rutter for Hie
Brasil 6,000, Rutter for Shangala 12,000. Fifty-eight thousand Marks of ladder against three
thousand of shop. They are bought *and* found, as in the original, and never consumed: a map does
not wear out.

### Four regions rather than one

The Fields, Forest, Hills and Goblin Mound. Every creature in them was already in the exported
content, so this cost nothing but naming them. Each says what level it suits, because the game has
no other way to warn you and the Hills will kill a new character in two rounds — a claim the
balance test checks rather than asserts.

### Character creation, with traits that are real

You pick a name and one of four backgrounds. Every trait a background grants is one the rules
already read — `Strong`, `Sturdy`, `Agile`, `Reflex`, `Merchant`, `Stubborn`, `Medic`, `Hardy` —
and the chooser says what each one does. Nothing there is flavour. All four spend the same thirty
points, so the choice is shape rather than strength.

`Hardy` is the one addition: the Java names it in `Constants` and halves disease with it, and the
port had no disease to halve until now.

### A fight can be fought from the keyboard

A, B, Z, H, S, R for the six actions, and Enter to move on once it is over. A long session is
several hundred repetitions of the same click, which makes this the one screen where a keyboard
genuinely earns its place. The shortcut is drawn from a `data-key` attribute in CSS rather than
appended to the button, so it never becomes part of the button's accessible name.

The binding is cleared on every render and re-attached only by the screens that want it — a fight
binding that outlived its screen would have you swinging at something that is no longer there.

### Growing by what you do, not just by levelling

**Restored, not invented.** The original grows a stat according to *how you won*: Berzerk teaches
Guts hard, Backstab teaches Charm and a little Guts, an ordinary win teaches Guts slowly,
hypnotising teaches Wits and swindling teaches Charm — each at `roll(currentStat) < weight`, so the
chance falls away as the stat rises and the region's depth raises it. `itHero.gainGuts` and its two
siblings, called from `arQuest`.

The port implemented only the flat part of progression: +2 to every stat, every level, however you
played. That is why levelling felt like the only thing that mattered — in the port, it was.
Measured over 400 quests in the Fields, restoring this and the experience fix below took a
character from level 6 to level 11 and halved the deaths.

### The guild, in town rather than the forest

Guild ranks feed `calcCombat` directly — Fighting into Attack, Thieving into Defence, Magic into
Skill — and nothing in the rewrite granted any, so a third of the character sheet was inert. The
guild is now in the game, with `arGuild`'s numbers: 4,000 Marks to join, then `rank × 1000` each,
the first free, and never more total ranks than your level.

**Moved to town**, where the Java puts it in the Forest. The rewrite's town is the one hub, and a
4,000-Mark fee already gates it far more effectively than geography does.

### Autosaving, and a copy you can keep

The rewrite could read a `.hero` save and write one back from the day it was written, and never
called the writer — so a session's marks, loot and levels vanished on refresh. Every move now goes
through one dispatcher, so saving is a single hook on it. The stored text is the same
`{type|field|field}` a `.hero` file holds, not JSON, so a character can be moved between this and
the Java build. "Save a copy" downloads one.

Wounds and disease persist between sessions, in the hero's `temp` list where the Java keeps them.

## Things added

### A browser build

`./gradlew webDist` produces `build/web/`: the ordinary jar plus a page that boots it under
[CheerpJ](https://cheerpj.com/), a WebAssembly JVM. It calls `cheerpjRunJar` against the desktop
`main()`, so there is no separate web codebase and no applet.

**This is why the compile target is Java 17** — CheerpJ supports Java 8, 11 and 17, and nothing
newer. The page must also *ask* for that runtime: `cheerpjInit()` with no arguments loads the
Java 8 one, which cannot read our Java 17 class files. It fails inside the JVM rather than
rejecting the promise, so the symptom is a loader that spins forever with no error — hence
`cheerpjInit({ version: 17 })` in `web/index.html`.

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

### Four of the eight fight endings were backwards

**In `app/` only.** A fighter carries the Control or Swindle state when it **succeeds** at one. So a
hero holding the Control flag has just hypnotised the monster and, in `arQuest.heroControls`, takes
its entire pack, earns experience and may gain a point of Wits.

The harness named that ending `heroControlled`, after the flag rather than the outcome. The port
copied the name and then wrote the player-facing text to match the *name*: winning a hypnosis
printed "the monster catches your eye, and you wander away" and paid nothing, while losing one
printed "it is mesmerised and wanders off". Both of the game's non-combat routes were therefore
strictly worse than swinging, which is the exact opposite of their purpose.

Renamed on both sides to say who won — `wonByHypnosis`, `wonBySwindle`, `lostToHypnosis`,
`lostToSwindle` — and the rewards implemented. The baseline was regenerated: a pure rename, with no
recorded percentage moved.

Losing to one costs something again, too. The original empties your whole pack when an aggressive
creature swindles you; here it takes half your Marks, which is the same idea scaled to a game that
no longer punishes you for losing. **Thief Insurance** stops it, which is why that item survived the
cull below.

### Every encounter was equally likely, including the ones that are not encounters

**In `app/` only.** Each area in the original holds a weighted table of creatures and rolls against
it — `arField`, `arForest`, `arHills`, `arMound` and `arCastle` each have one, and
`WildsScreen.selectQuest` does the rolling. The port picked uniformly from every monster carrying
the area's prefix, which is wrong twice over: common creatures stopped being common, and **things
that are not random encounters at all started turning up**. The Dragon is not in the Hills table.
The Mound's Queen appears only in the deepest of its three tables.

The Fields go further and swap to a gentler table below level 3 — no soldiers, barely a gypsy. That
is the only difficulty ramp the original has and it was missing entirely.

Measured over 250 quests in the Fields, fixing this took a first campaign from 122 wins and 47
deaths to 169 wins and 15 deaths. One creature in a hundred is the wandering Faery, wherever you
are, which is where that prefix-less monster in the content belongs.

### The region warning is worked out, not written down

The rewrite briefly carried a hand-picked "advised level" per region and printed it. It was a guess,
it did not survive contact with a character who had grown by use or bought guild ranks, and a wrong
warning is worse than none — it sends a player somewhere that empties their purse and tells them it
was fine.

What a region card shows now is computed: your power against the average of what actually lives
there, weighted by how often you meet it and scaled to your level exactly as `balance` will scale
it. Both sides go through `powerOf`, the game's own way of weighing two fighters, so the advice
moves as you do.

### Killing things far from home paid no more than killing things nearby

**In `app/` only.** A kill is worth `baseExp + (2·Guts + Wits + Charm) × weight / 4`, where weight is
how deep you went for it. The port awarded the base and dropped the rest, so a fight in the Goblin
Mound paid exactly what a fight in the Fields paid and there was no reason to take the risk. Fame
was short its guild-skill terms in the same way.

### Every weapon and every piece of armour was free

**In `app/` only, and never in the Java build.** The rewrite priced equipment by looking it up in
the gear table, and the gear table contains no weapons — those are in the arms table, which has no
costs in it at all. So `buyPrice` returned 0 for everything in the weapon shop, and you could buy
the shop out for nothing and sell it back for money.

A weapon's price is not stored anywhere: `itArms.stockValue` computes it from the item's own stats,
squaring Attack plus Defence, and adds the trait values from `ArmsTrait.traitValue` — where a
blinding weapon carries four thousand Marks of trait on top of whatever it swings for. The shop
then marks up what it specialises in by a third. All of it is now ported and checked against
`baseline/rules.txt`, which was extended to record five trait-bearing weapons precisely because
nothing in any shop's stock has a trait, so nothing would otherwise have covered that path.

### Monsters read every hero as harmless

**In `app/` only.** `itMonster.chooseActions` decides whether to reach for magic by comparing the
hero's power against its own. The port's parity test passed that figure; the actual game did not,
so it defaulted to zero and every creature judged every hero to be no threat. The verified code
path and the played one were different code paths.


| Fix | Symptom |
|---|---|
| Frame sizing uses `pack()` | `getInsets()` was read before the window manager reported real insets, so the frame came out short and clipped the bottom of every screen. On this box insets.top is 74px. |
| `Images/Other/Guard.jpg` added | Missing from the repo entirely; the castle guard had no portrait. |
| `Faces/Serville.jpg` → `Servile.jpg` | `arClanHall` asked for a filename that did not match the shipped asset, so the clan hall portrait never loaded. |
| `prefferedSize()` → `getPreferredSize()` | Typo, so it overrode nothing and the panel had no preferred size. Needed for `pack()`. |
| `new Integer(s)` / `new Long(s)` replaced | Constructors deprecated for removal; the build now passes `-Xlint:removal` clean. |
| `itMonster` serialises its base combat stats | It wrote the *derived* attack, defence and skill, which `calcCombat` only fills in once a monster has been balanced for an encounter — while reading those same positions back into the *base* fields. So writing out a prototype produced zeroes where its stats should be. Nothing in the game hit it, because monsters are parsed once from source and never written; exporting the content for the port is what surfaced it, and every field monster exported unable to fight. |
| `itRandom` serialises as `@`, not `*` | It wrote itself as `{*|...}` while `Item.factory` only reads `{@|...}`, so a random-quantity token could be written but never read, and a list containing one was silently truncated at that point on the way back in. [SPEC.md](../SPEC.md) always said `@`. Nothing in the shipping game hit it, because `itRandom` only lives in monster prototypes, which are parsed once from source and never written back — exporting that content is what surfaced it. Regenerating the baseline after the fix changes nothing, confirming it is serialisation-only. |
| `itMonster.buildGear` handles non-weapon gear | Meeting the Mound Queen crashed the game outright, about 30% of the time. Her gear list names a Crystal Crown, which lives in `GearTable` rather than `ArmsTable`, so `GearTable.shopItem` hands back a count rather than a weapon and the unchecked cast to `itArms` threw. `buildPack` has always handled that case; `buildGear` now does the same, and she drops the crown as loot. Found by the parity harness on its first run. |
| `Tools.roll()` no longer returns negatives | It negated a raw `nextInt()` and took a modulus. `Integer.MIN_VALUE` negates to itself, so roll could go negative and crash `select()` as an array index. Now `nextInt(bound)`, which is also free of the old modulo bias. Verified uniform over 6M samples, no negatives. |

## Known and left alone

- **`FTextList.getItem(index)` ignores its argument** and returns the selected item.
  `arPostal` depends on that behaviour.
- **No tests.** Verification is running the game; see [development.md](development.md).
