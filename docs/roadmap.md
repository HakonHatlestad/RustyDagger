# Roadmap

## How to read this

The game is being rebuilt as a TypeScript web app rather than modernised further in Java — the
reasoning is in [adr/2026-08-30-typescript-rewrite.md](adr/2026-08-30-typescript-rewrite.md). The
Java build stays alive as the reference the new one is checked against, and goes on improving while
that happens. Each phase below is a separate planning session
when it is picked up; this document is sequencing and intent, not instructions.

## Instead of a freeze: regenerate the baseline

An earlier version of this roadmap froze the Java build behaviourally once the parity baseline
existed — no gameplay, balance or rule changes until the port caught up. **That has been dropped,
and it is worth knowing why, because the reasoning was sound when it was written.**

The freeze existed because a rule change would *silently* invalidate the baseline. Once the harness
was actually built, that word stopped being true. A gameplay change now shows up as a diff in a text
file, and regenerating takes one command. It was demonstrated three times on the day the harness
landed: a crash fix moved exactly four lines out of nearly two thousand recorded outcomes, an
attempt at monster scaling moved 446, and two candidate combat rules moved measurable percentages.
None of them could have slipped past unnoticed.

So the protection was never the freeze — it was the harness. The rule that replaces it, and which
now lives in [../CLAUDE.md](../CLAUDE.md):

> Any gameplay change ships with a regenerated baseline and a note saying what moved.

That keeps the reference honest and costs nothing, where the freeze cost the only playable build
months of improvement. It also removes the plan's worst property: that every phase before parity
left you worse off than not starting, so a stall in the middle was strictly harmful. The Java build
now keeps improving whatever happens to the rewrite.

## Where this has got to

**Phases 0 to 4 are done; the game is playable in a browser.** `app/` holds the TypeScript port —
run `cd app && pnpm install && pnpm dev`. You can load an existing `.hero` character or start a new
one, go questing in the fields, fight, take what a monster was carrying, spend it in the weapon
shop, and equip what you buy. 198 tests, plus a smoke test that boots the built bundle and plays
through it.

| Phase | State |
|---|---|
| 0 — Ground truth | **Done.** Harness, baseline, content export. |
| 1 — New project, quality net | **Done.** Type checking, linting, formatting and tests gate every commit, and CI runs them. |
| 2 — The maths, under parity | **Mostly done.** Generator, levelling, decay, combat, the battle round, monster balancing and behaviour, save import. Not ported: the consumables, where a wounded monster drinks something to buy back actions. |
| 3 — Vertical slice | **Done.** Hero, quest, battle, shop, equip, end to end. |
| 4 — Menu cluster and levelling display | **Done.** Experience and health bars, item descriptions, and the stat comparison shared across inventory and shop. |
| 5 — Breadth | Not started. One region of the world exists. |
| 6 — Presentation | **Half done.** Text and interface are sharp and reflow; the artwork is untouched. |
| 7 — Portable remake features | Not started. |
| 8 — Retire the Java build | Not started, and should not be until the gaps in Phase 2 close. |

**What is not there yet**, stated plainly so nobody has to discover it: the town's other shops, the
forest, hills, mound and castle, the queen's minigames, the bank, the guild, the healer, character
creation as a screen, and the artwork. The loop is complete; the world is one region of it.

## Phases

### Phase 0 — Ground truth ✅

Build a seeded characterisation harness against the Java build: fix the RNG seed, drive combat,
loot, gear decay, levelling and quest outcomes at volume, and record every result as the parity
baseline the TypeScript port must reproduce exactly. Two things already in place make this cheaper
than it sounds — the RNG is deliberately reseeded from the character sheet in `itHero.update()` via
`Tools.setSeed`, so deterministic replay is a solved problem here; and
[development.md](development.md) already documents the harness prologue any driver needs.

Then extract the static content and lookup tables — the `DCourt.Static` package plus `ArmsTable`,
`GearTable`, `MonsterTable`, `PlaceTable`, `Quests` and `VQuests`, about 1,480 lines of data
currently embedded as string literals in Java source — into JSON that both builds read. The grammar
is already specified in [../SPEC.md](../SPEC.md), so this is mechanical and checkable, and it is
worth doing even if the rewrite were abandoned tomorrow.

**Done.** `./gradlew baseline` writes `baseline/rules.txt` and `baseline/distributions.txt`;
`./gradlew exportContent` writes `content/*.json`. Both are described in
[development.md](development.md). The phase paid for itself: it found a crash that had been in the
game the whole time (the Mound Queen), a serialisation bug that made one token type unreadable, and
settled two long-standing questions — monster scaling and the to-hit rule — by measurement rather
than argument, in both cases against the change.

One deliberate departure from what this phase originally said: the content is **exported**, not
shared. The Java build goes on reading its own string literals. It is the reference the port is
checked against, and a reference whose data loading has been rewritten underneath it is not a
reference.

This phase is what makes the regeneration rule above meaningful.

*What changes for the player:* nothing. Deliberately.
*Docs touched:* [development.md](development.md), [gameplay.md](gameplay.md),
[../SPEC.md](../SPEC.md), [architecture.md](architecture.md), [../CLAUDE.md](../CLAUDE.md).

### Phase 1 — New project, quality net first ✅

A TypeScript app in a new directory in this repository, served locally, with type checking,
linting, formatting and tests wired up before the first feature rather than after the shape
settles. The contrast with the Java side is the argument: CI here gates only on formatting, and
there are no tests at all — which is precisely what let two defects ship in a single session and be
misdiagnosed twice.

No framework or library choice is made here or anywhere in this document; that belongs to this
phase's own session.

**Done.** `app/` is Vite, TypeScript, Vitest, ESLint and Prettier, with `pnpm check` gating type
checking, linting, formatting and tests. CI runs that, builds the bundle, and separately checks that
regenerating the exported content produces no diff — generated files go stale silently otherwise.

*What changes for the player:* nothing yet.
*Docs touched:* [development.md](development.md), [architecture.md](architecture.md),
[../README.md](../README.md).

### Phase 2 — The maths, under parity — mostly done

Port the roughly 3,000 lines of behaviour-critical rules and check every outcome against Phase 0's
baseline: the combat round and damage formula documented in [gameplay.md](gameplay.md), the
levelling cost curve, gear decay in `itArms.decay()`, quest accounting in `itHero.getQuests()`.
Nothing here is a judgement call — if an outcome differs from the baseline, the port is wrong, and
that is the whole point of doing Phase 0 first. That includes reproducing the bugs: the `adjust`
flag on eight monsters must go on doing nothing, for the reasons in [gameplay.md](gameplay.md).

Read existing `.hero` saves so current characters survive the move. The new save format stays
human-readable plain text committed to git, because meaningful diffs between sessions and
git-based syncing between machines are both deliberate ([saves.md](saves.md)).

**Mostly done**, and the checking is the interesting part. Each rule is held to the baseline
exactly — the generator against recorded sequences, decay against 91 item trajectories, combat
against a 1,296-row damage grid and all 64 Skill matchups. On top of that, `app/test/parity.test.ts`
plays *complete fights* and compares how they end, which is a different question and has found far
more: see [development.md](development.md) for the five bugs it caught, one of them in the harness
itself.

**Not ported:** the consumable handling in `itMonster.chooseActions`, where a wounded monster drinks
Troll Blood or Ginseng to heal and buy back actions. That is the whole of the remaining divergence,
it is listed monster by monster in the parity test rather than hidden, and it is what Phase 8 waits
on.

*What changes for the player:* nothing visible, but their existing heroes now load in the new app.
*Docs touched:* [gameplay.md](gameplay.md), [saves.md](saves.md), [../SPEC.md](../SPEC.md).

### Phase 3 — Vertical slice ✅

Create a hero, take one quest, fight one battle, visit one shop, equip one item — end to end,
before any breadth. A thin slice exercises every layer at once (data, rules, saves, interface,
parity harness) against a small surface, so architectural mistakes surface while they are still
cheap to fix.

The quest and battle screens are in this phase deliberately rather than deferred. They are the
most-used screens in the game and the ones most worth improving, and rewriting them from scratch
against a parity harness is a materially safer proposition than the surgery on the AWT-1.0 battle
action menu (`DCourt.Screens.Quest.Options`, still on `handleEvent`) that was previously the only
option available.

**Done.** Load or start a character, quest in the fields, fight a monster through to an ending,
take its loot, buy and sell in the weapon shop, equip what you own. The battle screen was rebuilt
from scratch rather than surgically altered, as intended.

*What changes for the player:* the first playable thing in the new app.
*Docs touched:* [architecture.md](architecture.md), [porting-notes.md](porting-notes.md).

### Phase 4 — The menu cluster and the levelling display ✅

The inventory and gear menu, the shop menu, and item descriptions are one job, not three. Today
every list in the game is the one shared `FTextList` widget, which is why wheel and keyboard
support landed everywhere at once; the rewrite keeps a single shared component for the same reason,
and scoping these three apart would mean designing the same thing three times.

Build the stat-delta preview once and share it. That incidentally closes an existing asymmetry: the
shop shows you how a piece of gear compares to what you are wearing, via `Shop.equippedDelta()`,
but the inventory and equip screen does not — so buying is informed and equipping is guesswork.

Add the experience bar and a real visual treatment of levelling. The fixed 400x300 canvas had
nowhere to put one, which is the single clearest example of the layout constraining the game rather
than the other way round.

**Done.** The stat comparison is built once in `app/src/ui/describe.ts` and used by the inventory
and the shop alike, closing the asymmetry rather than copying it — and it handles the sixteen
two-handed weapons properly, so a pike costs you the shield as well as the sword. Item descriptions
are sentences rather than three integers. Health and experience bars sit on every screen.

*What changes for the player:* the biggest visible improvement in the whole plan.
*Docs touched:* [gameplay.md](gameplay.md), [porting-notes.md](porting-notes.md).

### Phase 5 — Breadth

The remaining screens: the town and its shops, the four wilderness zones, the castle, the queen's
minigames, the bank, the guild, the healer. Enumerated from the package map in
[architecture.md](architecture.md).

*What changes for the player:* the new app becomes the whole game rather than a slice of it.
*Docs touched:* [architecture.md](architecture.md).

### Phase 6 — Presentation — half done

"Better resolution" is two different jobs with very different costs, and separating them matters.

**Text and interface** are done, and were free as predicted: nothing in the interface is given a
fixed width, so it reflows and stays sharp at any size. That also means the text clipping the remake
had to patch out twice cannot come back.

**The pictures** can only be upscaled. Measured: 96 image files under `Images/` — 95 JPEG and one
GIF — of which 45 are 80x80, 29 are 96x64 and 12 are 72x96, with the rest one-offs up to 400x300.
That is roughly half the volume assumed when this was first discussed, and the source really is
low resolution. One AI upscaling pass, originals kept in git, followed by an explicit review with
per-image rollback — upscalers drift from the original look and fail badly on some images, so this
needs eyes on every result, not a batch job and a commit.

*What changes for the player:* the game stops looking like a 1997 applet stretched on a modern
monitor.
*Docs touched:* [porting-notes.md](porting-notes.md), [../README.md](../README.md).

### Phase 7 — Portable remake features

The still-maintained remake has published patch notes, and
[remake-comparison.md](remake-comparison.md) assesses every entry in them. This phase acts on that
table rather than restating it: adopt the ergonomic changes, adopt the single-player bug fixes this
port still carries, and ship anything that changes rules or balance as a toggle defaulting to 1997
behaviour.

The toggle discipline is not new — `DCourt.Control.GameRules` already holds three such flags, each
a single constant with every call site funnelling through it. The rewrite keeps exactly one such
chokepoint. Scattering conditionals through the screens is how a port stops being able to tell you
what it changed.

*What changes for the player:* small frictions disappear; nothing about the game's balance moves
unless they ask for it.
Monster scaling belongs here too, and is this port's own item rather than the remake's: eight
monsters carry a scaling flag that has never worked, and the mechanic behind it cannot work against
a linear damage rule. Designing one that can is a rules change, so it ships as a toggle like the
rest. See [gameplay.md](gameplay.md) for the measurements.

*Docs touched:* [remake-comparison.md](remake-comparison.md), [porting-notes.md](porting-notes.md),
[gameplay.md](gameplay.md).

### Phase 8 — Retire the Java build

Only once parity holds. This is a bigger deletion than it sounds, because it removes a live
shipping target and not just a development convenience: the CheerpJ browser build goes with it —
the page at `web/index.html`, the `webDist` Gradle task that assembles it, and the CI step that
builds it on three JDKs. [../README.md](../README.md) documents that browser path today, and
[porting-notes.md](porting-notes.md) records the Java 17 compile-target constraint that exists for
no reason other than CheerpJ's support ceiling. Both stop being true here.

What replaces it is the point of the whole exercise: the TypeScript app *is* the browser build from
this moment, with no JVM download and no slow first load. An optional desktop wrapper comes after
that, and only if it turns out to be wanted.

*What changes for the player:* one build instead of two, and it starts instantly.
*Docs touched:* [../README.md](../README.md), [../CLAUDE.md](../CLAUDE.md),
[architecture.md](architecture.md), [development.md](development.md),
[porting-notes.md](porting-notes.md), `build.gradle`, the CI workflow.

## Core loop coverage

Proof that nothing was dropped — every part of the loop lands somewhere.

| Area | What changes | Phase |
|---|---|---|
| Character creation and building | Rules ported under parity; creation screen rebuilt in the slice; Hero Rebirth and Tonic of Unskilling available as gated toggles | 2, 3, 7 |
| Questing and combat | Combat maths ported against the recorded baseline; quest and battle screens rebuilt early rather than deferred | 2, 3 |
| Levelling | Cost curve ported; the experience bar and a real visual treatment of levelling added, which the old layout had no room for | 2, 4 |
| Loot | Gear decay and drop rules ported; item descriptions and the quality stat surfaced properly | 2, 4, 7 |
| Shopping | Shop screen in the vertical slice; shop menu rebuilt as part of the menu cluster; larger bank transfer sizes | 3, 4, 7 |
| Equipping | Inventory and gear menu rebuilt; stat-delta preview built once and shared, closing the shop/inventory asymmetry; max trait status shown | 4, 7 |

## Value against effort

**High value, low effort.** Static content extraction; the `.hero` save importer; the stat-delta
preview on the inventory screen; Tab and Enter on the entry screen; the end-of-day restart button
and wealth readout; remembered stat ordering on the status screen; larger bank transfer sizes; the
experience bar. **Not** the remake's single-player bug fixes: those were checked against this
codebase and mostly are not here — see [remake-comparison.md](remake-comparison.md) for which
survived the check.

**High value, high effort.** The parity harness; the rules port; the vertical slice; the menu
cluster; the quest and battle screens.

**Lower value, low effort.** Equipment quality stat and maximum trait display; anti-aliasing and
font rendering fixes — listed to record that they are handled for free on the web, not to schedule
them; status-bar and Keepers Tavern text clipping, free **provided no container is given a fixed
width**, which is a constraint to remember rather than a task to do.

**Lower value, high effort.** The art upscale; a desktop wrapper; and the gated rule toggles — Hero
Rebirth, Tonic of Unskilling, Ieatsu and Backstab stat gains, panic gear and flee chance.

**Why this is not simply cheapest-first.** Almost everything in the first group is cheap *in the
new app* and would have to be built twice if done in Java now. The foundation goes first by
explicit choice, accepting that nothing visible changes for a while, so that later work gets easier
and no layout is designed twice.

## Open items

**Is a browser tab acceptable as the long-term way to play, or is a real desktop window wanted?**
This is an assumption, not a decision. The stated constraint was that the game only needs to run
locally on one machine, which a locally-served web app satisfies with no packaging work — but
nobody has confirmed that a tab is how it should feel to launch. Confirm before any wrapper work is
scheduled; until then Phase 8's wrapper stays optional.

**Bank space was never raised, though bag space was.** The remake raised both in one change
(V1.20.001); this port took bag space 60→75 and left bank space at its original value. Possibly
deliberate, possibly missed. Worth a decision when Phase 7 reaches it.

**The lightweight-widget-tree work is cancelled, and both documents now say so.** The scaling
section of [porting-notes.md](porting-notes.md) used to propose rebuilding the widget tree as
lightweight components. It is not scheduled and will not be — scaling turned out to work without
it, and the rewrite removes the problem entirely.

## Resolved, and recorded so it does not get re-opened

**Desktop window scaling.** This sat on the list as an unresolved question and is now settled.
Scaling had been switched off on the belief that it misaligned clicks; that belief was wrong. The
click bug it was blamed for was the `FTextList` listener trap described in
[architecture.md](architecture.md), which broke row clicking at every scale in both builds. Once
that was fixed, scaling was tested rather than assumed — 3x, clicking rows in a shop list — and
clicks land where they should. The default is now 4. Full account in
[porting-notes.md](porting-notes.md).
