# Porting notes

Every deliberate departure from the 1997 original, and why. **Add to this when you change
behaviour** — otherwise the next person cannot tell a decision from a bug. What the game is
*becoming* is in [design-vision.md](design-vision.md); this file records what it departed *from*.

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

### The special actions now cost something (rewrite only)

**This is the first place the rewrite deliberately departs from the Java on combat arithmetic**, so
`baseline/rules.txt`'s `== SPECIAL ACTIONS ==` rows and `app/` now disagree on purpose. That
disagreement is a decision, not the port defect that
[balance-protocol.md](balance-protocol.md) tells you to report. Nothing under `src/main/java/`
changed, and the Java build still plays the 1997 way.

Why: measured over 12 heroes and 200 quests apiece, **Berzerk beat an ordinary swing on both win
rate and death rate in every region** — 0.954 win / 0.000 death against 0.846 / 0.106 in the
Fields, and 0.646 / 0.250 against 0.015 / 0.876 in the Forest. `prepare` in
[`battle.ts`](../app/src/rules/battle.ts) gave it double Guts, double Speed and four swings and
charged nothing for any of it. Five of the six buttons the interface offers were decoration, and
the one it marks as primary was the worst of them. The two counters that would have punished it —
`Alert` against a Backstab, `Fencer` against a Berzerk — were implemented and **had never once
fired**, because every monster was built with an empty trait set.

| Action | Was | Is now |
|---|---|---|
| Berzerk / Ieatsu | ×2 Guts, ×2 Speed, 4 swings, no cost | The same, but you yield the initiative, your guard is halved for the round, and you are winded the round after |
| Backstab | ×2 Guts, ×2 Speed, cuts them to one swing, every round | The same, but only against something not yet fighting you; afterwards it is an ordinary swing |
| Hypnotise / Swindle | Opposed check, retryable every round | One attempt per fight — a failure makes them wise to it |
| Monster traits | Every monster had none | `Alert` and `Fencer` assigned by region and kind, in `MONSTER_TRAITS` |

The trait assignments are **design judgement, not ported values**: the Java gives its monsters no
traits at all, so there was no number to source and nothing to regenerate. Drilled fighters read a
wild charge; the wary and the quick cannot be crept up on. They live in one table in
[`monster.ts`](../app/src/game/monster.ts).

The parity harness still passes unchanged — `parity.test.ts`, `combat.test.ts` and `economy.test.ts`
all agree with the Java, because the recorded whole-fight comparisons drive the hero with ordinary
attacks and the `== SPECIAL ACTIONS ==` section has never been read by any test. That last part is
worth knowing: it is recorded ground truth that nothing checks.

### What dying costs is capped (rewrite only)

The death penalty was already softened to "a tenth of your purse" when the 1997 rule went (see
below). A tenth of a purse has no ceiling, though, and wealth outgrows what any region pays, so the
penalty ended up scaling faster than the reward for facing it.

Measured on a level-17 veteran **who sells what he finds** — the qualifier matters, see below —
the uncapped rule left the Goblin Mound netting 10.7 Marks a fight against the starting region's
36, despite a 79% win rate there. The Hills came out at −62. The rational play was to farm the
safest region in the game forever, which is the opposite of what ten regions are for.

The loss is now a tenth of your purse **or 750 Marks, whichever is smaller** (`LOSS_CAP` in
[`state.ts`](../app/src/game/state.ts)). Early on nothing changes: a tenth of a 200-Mark purse is
20, and the cap never binds until you are carrying 7,500. Afterwards a death costs a real 750 —
about two fights' takings in a deep region — without ever outgrowing the reason to go there.

Net Marks per fight for that veteran after the change: Fields 36, Forest 332, Goblin Mound 255,
Hills 61. The Hills stay poor on purpose; at a 47% death rate they *should* be a bad idea for that
character, and `assess` in [`world.ts`](../app/src/game/world.ts) says so in words before they go.

**A measurement trap worth recording, because it produced a confidently wrong answer first.** An
earlier reading of all this had every deep region net-negative and concluded the ladder was broken
outright. It was not: the simulation never visited a shop, and most of what a deep region pays is
*goods*, not coin. Per kill, Shangala drops no coin at all and 4,189 Marks' worth of goods;
Hie Brasil 2,800 and 3,900; the Fields 12 and 66. Any measurement of this game's economy that does
not sell what it finds is measuring the Fields fairly and everywhere else at a fraction of its
worth. `playPlan` in `app/test/balance.test.ts` now sells every 25 quests for exactly this reason.

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

### Ten regions rather than one

The Fields, Forest, Hills and Goblin Mound to walk to, and six more — the Treasury, the Throne
Room, the Castle Dungeons, the Ocean, Hie Brasil and Shangala — behind a key item apiece. Every
creature in all of them was already in the exported content, so this cost nothing but naming them
and porting the weighted tables that decide which one you meet.

Each card says how the place looks to *you*, worked out against what actually lives there rather
than quoted from a level written down once — see below.

### Character creation, with traits that are real

You pick a name and one of four backgrounds. Every trait a background grants is one the rules
already read — `Strong`, `Sturdy`, `Agile`, `Reflex`, `Merchant`, `Stubborn`, `Medic`, `Hardy` —
and the chooser says what each one does. Nothing there is flavour. All four spend the same thirty
points, so the choice is shape rather than strength.

`Hardy` is the one addition: the Java names it in `Constants` and halves disease with it, and the
port had no disease to halve until now.

### Clearing the pack out in one go

Measured over 300 quests in the Fields, a character comes home with sixty-four rows, fifty-five of
them weapons and most of those the same Rusty Dagger. The original caps a pack at 75 and charges
quests for going over; with the daily ration gone that penalty charges nothing, so the cap was
dropped and the tidying-up was left as sixty clicks at a shop counter.

Shops now offer to take the lot: weapons and armour in one button, junk and trophies and gems in
another. What matters about it is what it cannot take — the list is a **whitelist** of gear types,
so a potion, a scroll or a Rutter for Shangala is never caught by it. A blacklist would sell
somebody's way onward the first time a new item type appeared and they would find out at the docks.

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

### The silver tier is obtainable (rewrite only)

Anything whose name begins with *Silver* had to pass its listed drop chance and then a further
one-in-ten. Most silver items are listed at 1%, so the best gear in the game — a Silver Masamune at
120 Attack and 40 Skill, a Silver Gladius at 100 — was a **0.1% drop**. Measured, not one appeared
across three hundred loot rolls of every monster in the game that can carry one.

That is a sensible rate for a game played daily for months and an unreachable one here. It is the
same argument that removed the daily quest ration: this build's campaign is compressed, so a number
tuned to 1997's pacing is not the same number. The extra roll is gone and the listed percentage is
now the whole of it. Over five hundred kills of every monster, all ten silver items turn up, none
more than seven times — still the rarest thing in the game, and now something that exists.

### Draughts are worth drinking now (rewrite only)

Every healing item in the game was a **trap**. Measured with a trained hero in Hie Brasil and
Shangala, drinking at half health lowered both win rate and survival against simply fighting on,
because reaching for something cost the whole round and a round of fighting was worth more than
fifteen or thirty points.

Two things changed, in that order, because the first was not enough:

1. **A draught mends a share of what you are made of.** A salve is fifteen points *or a quarter of
   your Guts*, whichever is more; a Gold Apple is thirty *or half*. A starting hero with 60 Guts is
   untouched by this — a quarter of 60 is exactly 15 — and a trained one is not. Measured on its
   own, this barely moved the numbers: the tempo was the cost, not the size of the heal.
2. **The first reach of a fight is quick.** Nothing gets a swing in. The second and every one after
   costs the round, exactly as before, so a potion is an emergency button and never a way of
   fighting. This is a deliberate reversal of the note in `oneSidedRound`, which held that a free
   action "would make any potion strictly better than fighting" — true of an unlimited one, and the
   unlimited cost turned out to kill the category outright.

Measured after both, over ten heroes and two hundred quests each: in Hie Brasil a Gold Apple at half
health takes the win rate from 0.390 to 0.410 and the death rate from 0.354 to 0.345 — better on
both counts, where before it was worse on both. In Shangala, 0.219 to 0.233 and 0.687 to 0.672.

The thrown dusts are left alone and are still a poor idea used indiscriminately, which is correct:
they are for a particular moment, not a rotation.

Shares and the one-free-reach rule are design judgement, not ported values.

### A trainer who sells Guts, Wits and Charm (rewrite only)

The far half of the ladder was unreachable, and not because it was hard. Measured at level 21 with
the best weapon the shops sell, a hero won 2% of fights in the Ocean and died in 82% of them. The
reason is in the numbers the deep creatures carry: a Shangala Samurai has 508 Guts and 514 Skill, a
Shogun 601 Skill, against a hero's 190-odd Guts and a Skill built from a fraction of that. Whether
a blow lands is Skill against Skill and how hard it hits is mostly Guts, so **a point of Attack is
rounding error out there** — nineteen reforgings, 370,000 Marks, moved that 2% not at all.

Growth by use carries a long campaign a good way on its own, to about 190 Guts over two thousand
fights, and then flattens. Levelling adds two points a level against a cost that rises by half each
time, so it is logarithmic in play time; nothing in the game could take a hero to the 300-plus the
far regions are pitched at.

Elden Bishop now trains you, for **ten Marks per point you already have**. The next point of Guts
costs ten times your Guts, so going from a fresh hero to 300 in one stat is a little over four
hundred thousand Marks — about what a long campaign in the Goblin Mound pays. The total cost to
reach any level is quadratic, so it is endless in the way the game is endless: no purse outruns it.

Measured end to end, and pinned in `app/test/progression.test.ts`: a hero who works the Fields, the
Forest and the Mound, buys every key on Sally's shelf, and spends the winnings on training arrives
in the Ocean with 262 Guts and 247 Wits and an 89% win rate, where the same hero untrained won 2%.

It also makes Wits and Charm live decisions rather than numbers you were dealt at creation, which is
the shape the "simple stat system" in [design-vision.md](design-vision.md) is supposed to have.

Prices are design judgement, not ported values — the Java has no such service.

### A smith who will take any amount of money (rewrite only)

Marks had nowhere to go. Both gear shops together come to about three thousand, the region ladder
to forty and a half thousand, and after that a campaign simply accumulates — measured, a veteran
grinding the Fields passed eighteen thousand Marks with nothing left to buy. A game with no ending
needs a sink with no bottom, or its economy stops meaning anything the moment you have won it.

Bill Smith now reforges the weapon you are wearing (+1 Attack) and Aileen Suitor tempers your
armour (+1 Defence). The first costs 2,000 Marks and every one after costs half again as much, so
twenty of them come to over six million: the curve has no ceiling, which is the point.

It deliberately does **not** replace the enchanting scrolls, which the magic shop already sells and
which `readScroll` calls "a gold sink with no ceiling". Those are a flat hundred Marks — no amount
of wealth is ever absorbed by buying more of them — and past an item's own power every further
scroll can destroy it. The two are different bargains and both stay:

| | Enchanting scroll | Reforging |
|---|---|---|
| Costs | 100 Marks, flat | Half again as much every time |
| Risk | Destroys the item past its power | None |
| Gives | Skill, mostly | A flat point of Attack or Defence |

The counts live inside the item as `Forged` and `Tempered`, written the same way `Enchant` already
was and **only when non-zero**, so an ordinary weapon still round-trips byte for byte and the save
format needs no version bump. A reforging does not raise what an enchantment is weighed against:
`itemPower` is the Java's arithmetic and is left alone.

Prices are design judgement, not ported values — the Java has no such service.



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

### You could wear five swords at once

**In `app/` only.** Every piece of equipment claims one or more of five slots — head, body, feet,
right hand, left hand — and putting one on displaces whatever holds those slots, back into the
pack. A two-handed weapon claims both hands, so a pike costs you the shield as well as the sword.

The port had none of it and simply appended to a list. Five right-hand weapons at once gave 55
Attack where one gives 14, which breaks the fight maths and the economy together.

The galling part is that the inventory had been telling the player the truth all along:
`describe.ts` computes exactly which items a swap "would replace", and has since it was written. The
interface was promising a rule the game did not have, and no test covered it in either direction.
From `arStatus.wearGear`, cursed items included. `WEAR_SLOTS` moved into `rules/combat.ts` on the
way, because where a thing is worn is a rule and the game layer must not import the interface.

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
