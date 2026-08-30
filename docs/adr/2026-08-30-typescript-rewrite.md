# ADR: Rewrite the game as a TypeScript web app
Date: 2026-08-30
Status: Accepted

## Context

This repository is a 1997 Java applet, decompiled and ported to run as a desktop AWT program
and — via CheerpJ — in a browser. The port works. The question this record answers is what to do
next, given a list of wanted improvements that the current code makes expensive: an experience
bar, a real inventory and gear menu, a better shop menu, item descriptions, sharper text and
pictures, and a window that can be resized.

**The measured position.** 96 Java source files, 18,520 lines. Three disjoint buckets:

| Bucket | Lines | Share | What it is |
|---|---|---|---|
| UI | 11,106 | 60% | `DCourt.Screens` (10,683) less the three non-UI files below, plus `DCourt.Components` (1,057) |
| Behaviour-critical maths | 3,083 | 17% | `itAgent`, `itHero`, `itMonster`, `arBattle`, `itArms`, `Tools` |
| Static content and lookup tables | 1,480 | 8% | the `DCourt.Static` package, plus `ArmsTable`, `GearTable`, `MonsterTable`, `PlaceTable`, `Quests`, `VQuests` |

Three files sit under `Screens` but do not belong to the UI bucket: `arBattle` (514 lines) is the
combat resolver, `Quests` (73) and `VQuests` (47) are content. They are counted in the maths and
content buckets, not the UI one. That distinction matters for the argument below — folding the
combat resolver into "UI that gets rewritten anyway" would smuggle the one piece of code that
must be ported faithfully into the pile that gets discarded.

**Two constraints force the choice.**

The first is the toolkit. The widgets are machine-decompiled and use the AWT 1.0 event model —
`handleEvent`, `mouseDown`, `postEvent` — because that is what they were written against in 1997.
That model predates the mouse wheel and focus traversal, so any modern input has to be wired with
the listener API, and the two models cannot coexist on one component. `docs/architecture.md` has
the full account. The cost of that is not theoretical: adding wheel and keyboard support to the
shared list widget set `Component.newEventsOnly`, after which AWT silently stopped calling the
AWT-1.0 `mouseDown` where row hit-testing lived — so clicking a row in the shop, or in any other
list in the game, did nothing at all. That defect was then misdiagnosed a second time, as a
window-scaling problem, and window scaling was disabled on the strength of it. Two defects and
one wrong diagnosis, all from the same bug class, inside a single working session. (Locally:
commit `c347884`, unpushed at the time of writing and not resolvable from any other checkout —
`docs/architecture.md` is the durable explanation.)

The second is the layout. The game draws into a fixed 400x300 canvas and positions every child at
hard-coded pixel coordinates, so it cannot reflow; scaling the whole surface is the only lever
available (`docs/porting-notes.md`). Every improvement on the list needs space this layout does
not have. There is nowhere to put an experience bar.

## Decision

Rewrite the game as a **TypeScript web application**, rather than continuing to modernise the
decompiled Java/AWT code.

The shape of that decision:

- **Keep the game's feel, art and tone; allow the screens a freer layout.** Not a pixel-faithful
  reproduction of the 400x300 canvas — a resizable window, longer lists, room for an experience
  bar, tooltips, a real inventory. The look stays; the fixed geometry does not.
- **Build it in a new directory inside this repository**, and keep the Java build present and
  working until the port reaches parity. One history holds the extracted game data, the saves,
  the art and both implementations, which is what makes a parity comparison possible at all.
- **Ship it as a locally-served web app first.** A desktop wrapper is deferred until the port is
  playable, and until someone actually wants one.

The reasoning: under a freer layout, all 11,106 lines of UI are rewritten under *either* option —
so a Swing migration and a TypeScript rewrite start from the same 60% of the codebase. TypeScript
additionally re-types the ~4,300 lines of maths and content. Against that, every wanted feature is
close to free in a web UI and expensive in Swing; the browser is already a shipping target through
CheerpJ, so going native to it removes the JVM download and the slow first load; and the AWT
event-model and heavyweight-peer bug classes cease to exist rather than being inherited.

**Rejected alternatives.**

- **Migrate the UI to Swing, staying in Java.** Genuinely viable, and the better-looking option on
  risk: game logic and data stay untouched so the maths cannot drift, and the CheerpJ browser
  build keeps working. It was the settled choice until TypeScript was raised. It lost because it
  still rewrites every screen, and in exchange for that identical cost it inherits a 30-year-old
  toolkit — leaving all future UI work permanently harder than it needs to be.
- **JavaFX.** Eliminated on evidence, not preference: CheerpJ 4's JavaFX support is explicitly
  partial, which puts the existing browser build at risk.
- **Build one screen both ways first and compare.** Offered specifically as a way to turn a
  one-way door into an informed one. Declined; the decision was made directly.

## Consequences

**What gets better.** The AWT event-model and heavyweight-peer bug classes disappear entirely —
the two defects described above are not fixable-in-principle in the current stack, they are
properties of it. Every feature on the wanted list becomes cheap: an experience bar, tooltips,
item descriptions and a reflowing inventory are ordinary work in a web UI. Text and interface
render sharply at any size, for free, because they stop being a 400x300 bitmap. The window
resizes. The CheerpJ layer, and the Java 17 compile-target constraint that exists only to satisfy
it, both go away at the end.

**What gets worse, and this is not small.** The maths is being retyped in another language, so
the parity harness described in `docs/roadmap.md` stops being a nice-to-have and becomes
mandatory — it is the only thing standing between a faithful port and a lookalike that quietly
plays differently. And once that harness has recorded its baseline, the Java build freezes
behaviourally: bug fixes and presentation changes only, no gameplay or balance changes, because
any rule change silently invalidates the baseline. In plain terms, **the game that is playable
today stops gaining features until the rewrite catches up.** That is a real cost paid in real
months, not a technicality.

**The effort comparison is an estimate, not a measurement.** The judgement that TypeScript is
roughly 1.5x the work of a Swing migration rather than 5x is reasoning from the line counts above,
and nothing more. **No screen was prototyped in either stack.** The offer to build one screen both
ways and compare elapsed effort — the exact measurement that would have grounded this number — was
made and declined. The line counts in the Context section are measured and re-checkable in
seconds; this ratio is not one of them, and a reader who treats it as equally solid is reading it
wrong. If the rewrite turns out to cost materially more than expected, this is the assumption that
failed, and it failed knowingly.

**What is deliberately not decided here.** No framework, no library, no directory layout, no build
tooling. Those are open, and belong to the session that starts Phase 1. See `docs/roadmap.md` for
the sequence and `docs/remake-comparison.md` for what the still-maintained remake contributes.
