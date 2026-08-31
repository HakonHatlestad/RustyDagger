# Design vision

This document says what RustyDagger is meant to be, so that a feature idea can be judged against
stated intent before anyone writes code for it. The executable copy of that intent is
`app/test/balance.test.ts`, which plays whole campaigns through the same entry point the interface
uses and asserts how they come out; every claim in "The design intent, as the tests state it" below
names the test that enforces it. Prose and tests are kept in step by
[balance-protocol.md](balance-protocol.md), which is the procedure for changing any number the game
plays by. [gameplay.md](gameplay.md) holds the numbers and the formulas — this document holds the
intent behind them.

## What the game is

A single-player role-playing game made of text and played in a browser: make a character, hunt
across ten regions, fight, loot, drink what you loot mid-fight, spend the proceeds in four shops and
at the guild, and come back to it later because it saves (`README.md:16-20`). Single-player is the
deliberate shape rather than an unfinished one (`README.md:29-33`), and the interface really is
text — plain DOM, no framework, every string put on the page with `textContent`
(`docs/architecture.md:153-155`). Everything below is a claim about the shape of that loop, with the
file that proves it.

- **Classless, point-buy and permanent.** Twenty build points spread across Guts, Wits, Charm and
  starting money, plus four optional traits — Noble 12, Trader 10, Wizard 9, Warrior 8 — each of
  them roughly half a build and so a real commitment. "There are no classes and no skill trees
  beyond this" (`docs/gameplay.md:9-21`).
- **A simple stat system, with the combat stats derived from it.** The three raw stats do not fight
  for you: `itAgent.calcCombat()` turns them into Skill, Attack and Defence, which are what a round
  actually uses (`docs/gameplay.md:25-32`). Damage is
  `(Guts * (2 + swings)) / 10 + Attack - Defence` (`docs/gameplay.md:69`).
- **Progression on two tracks.** Levels cost `50 * 1.5^(level-1)` experience, truncated — 50, 75,
  112, 168, 253 — so the next one always costs more than the last (`docs/gameplay.md:42-43`,
  implemented at `app/src/rules/levelling.ts:22-24`). The second track is growth by what you
  actually do, because a win teaches you whatever won it (`docs/gameplay.md:117-120`).
- **Upgrades are the ladder.** Attack comes from gear rather than from stats, which is why money
  matters at all — an unarmed character ends a campaign far worse off than an armed one
  (`app/test/balance.test.ts:266-272`). Joining the guild costs 4,000 Marks
  (`app/src/game/guild.ts:43`), deliberately beyond a long run in the starting region, so it is the
  first thing in the game that asks you to go somewhere dangerous
  (`app/test/balance.test.ts:301-307`).
- **You buy your way deeper.** Gold is the progression, not a scoreboard: a smith reforges what you
  carry, and Elden Bishop sells Guts, Wits and Charm at ten Marks for every point you already have.
  Both get dearer the further you push them, so neither runs out, and the far regions are pitched
  where only a trained character can stand (`app/test/progression.test.ts:146-184`;
  [porting-notes.md](porting-notes.md) for why gear alone is not enough out there).
- **Risk is what buys reward.** Ten hunting regions (`docs/roadmap.md:61`), and the deeper ones pay
  far better and teach faster, which is the whole reason to leave the Fields
  (`app/test/balance.test.ts:276-286` and `app/test/balance.test.ts:288-299`).
- **The tension lives in the fight**, not in the pacing around it. Within a fight your health is the
  resource and the only way to get it back is something you are carrying
  (`docs/porting-notes.md:29-33`).

## What it deliberately is not

The reasoning behind these removals is not restated here; it lives in
[porting-notes.md](porting-notes.md), which owns it.

| Not this | What it would be | Why not |
|---|---|---|
| A daily game | A ration of quests, gear that wears out, something lost when you die | All of it removed. There is no server and nobody is coming back tomorrow (`docs/porting-notes.md:11-40`) |
| Multiplayer, or server-backed | A clan hall, the post, rankings, the bank, the postal drops | They need players and a server that no longer exist (`docs/porting-notes.md:42-58`) |
| A faithful remake with a frozen system set | New systems allowed only where the 1997 game had one | This is its own game now. The ported combat and economy maths stay as the honest foundation, and a genuinely new system is judged against this document rather than against what 1997 had. The toggle policy at `docs/remake-comparison.md:103-108` is unaffected: it gates rules *imported from the still-maintained remake*, which is what the three flags in `src/main/java/DCourt/Control/GameRules.java` are for, and it still does |
| A game with an ending | A final boss, a win condition, a completion state | The game is endless and the player stops when they want; no completion state exists anywhere in the code. The unported castle, Vortex and queen's minigames (`README.md:25-27`, and `docs/roadmap.md:61` for the last two) are ordinary content when they land, not an endgame |

**About the word *finish*.** Both [README.md](../README.md) and [roadmap.md](roadmap.md) used to
describe the rewrite as "a single-player game you can sit down and finish", which read as a promise
of an ending this game has never had. Both sentences now read otherwise — "The rewrite takes all of
it out and is a single-player game you can sit down and play for as long as you like; the fight
itself is where the tension lives" (`README.md:29-33`) and "What is left is a single-player game you
can sit down and play for as long as you like" (`docs/roadmap.md:49-52`). This paragraph records why
the word went, so that nobody puts it back: *finish* meant a session you can play out in one
sitting, as against the 1997 daily ration those same two paragraphs describe removing. It was never
a win condition, the author confirmed that reading when asked, and no completion state exists
anywhere in the code.

## The design intent, as the tests state it

One bullet per assertion in `app/test/balance.test.ts` and `app/test/progression.test.ts`, in the
order they appear there. There are twenty-one in the first and two in the second, and all
twenty-three are here: this list is meant to be the complete prose copy of the executable intent,
because a partial copy drifts without anything noticing.

- A character who buys a weapon and hunts gets somewhere over a few hundred fights. The campaign is
  progress, not a treadmill (`app/test/balance.test.ts:218-234`).
- The starting region is a beginner's area — a win rate above 0.6, and deaths under a third of wins
  (`app/test/balance.test.ts:236-244`).
- The fights can still kill you, so they are not a formality
  (`app/test/balance.test.ts:246-256`).
- The Hills kill a new character, which is exactly what the region card says they will: the warnings
  on the cards are true (`app/test/balance.test.ts:258-264`).
- An unarmed character ends up far worse off than an armed one, because attack comes from gear,
  which is why money matters (`app/test/balance.test.ts:266-272`).
- There is a reason to leave the starting region: the deeper ones pay far better
  (`app/test/balance.test.ts:276-286`).
- …and they teach faster too, so depth buys progress as well as money
  (`app/test/balance.test.ts:288-299`).
- The guild is something you have to travel for — the first thing in the game that asks the player
  to go somewhere more dangerous (`app/test/balance.test.ts:301-307`).
- Money cannot be manufactured by buying an item and selling the same one back
  (`app/test/balance.test.ts:311-321`).
- Money goes up over a campaign, but never so fast that the shops stop mattering
  (`app/test/balance.test.ts:323-331`).
- The shop is priced so that a starting purse buys a real weapon but not the best one, which makes
  the first purchase a choice (`app/test/balance.test.ts:333-337`).
- Every starting background can hold its own in the fields; none of them is a trap
  (`app/test/balance.test.ts:341-349`).
- Each level costs more than the last, so progression never trivialises
  (`app/test/balance.test.ts:354-362`).
- Resting restores you completely, so a session never turns into a war of attrition
  (`app/test/balance.test.ts:371-378`).

Two about the ladder out of the starting region, which are checked as *play* rather than as a
formula — the older "pays far better the deeper you go" above compares the experience multiplier at
two region weights, which cannot see win rates or what dying costs, and both of those are where the
ladder actually failed:

- Depth pays better in play, not merely in the experience formula
  (`app/test/balance.test.ts:413-418`).
- Dying does not tax you for being rich, which is what used to make depth irrational
  (`app/test/balance.test.ts:420-426`).

And five about the fight itself, which are the newest and were added because the game did not
honour them. Measured, a berserk charge used to beat an ordinary swing on **both** win rate and
death rate in every region — 0.954 against 0.846 in the Fields, at a tenth of the deaths — so five
of the six buttons the interface offers were decoration and the one it marks as primary was the
worst of them:

- No action is simply the best one: the charge wins more fights, the ambush loses fewer, and
  neither beats the other at both (`app/test/balance.test.ts:435-444`).
- An ordinary swing is part of the best line, because a charge leaves you winded and alternating
  beats holding one button down (`app/test/balance.test.ts:446-452`).
- A backstab needs something that is not yet fighting you; round after round it degrades to an
  ordinary swing (`app/test/balance.test.ts:454-462`).
- You cannot talk your way past the same creature twice, so Hypnotise and Swindle are a gamble
  rather than a free re-roll (`app/test/balance.test.ts:464-478`).
- A berserk charge costs its guard and its initiative — they swing first
  (`app/test/balance.test.ts:480-491`).

And two in a second file, `app/test/progression.test.ts`, which plays one campaign from a fresh hero
to the far end of the ladder rather than sampling a region. It exists because every assertion above
passed while the loop the game is built around did not close: at level 21 with the best weapon the
shops sell, a hero won 2% of fights in the Ocean, and 370,000 Marks of reforging moved that not at
all, because Attack is rounding error against creatures carrying 500 Guts and 600 Skill.

- Getting harder costs more for every point you already have, so no purse ever outruns it
  (`app/test/progression.test.ts:133-144`).
- The loop closes: hunt where you can survive, sell what you find, spend it on being harder, and
  thereby reach a region that would have killed you (`app/test/progression.test.ts:146-184`).

A change that breaks one of these assertions is a change to the design rather than a test failure to
be tuned away, and [balance-protocol.md](balance-protocol.md) says what to do about it. If another
assertion is ever added to either file, a bullet belongs here in the same change, because this list
claims to be complete.

## Open questions

Two things this document deliberately does not answer, recorded here rather than guessed at.

- **Is the game meant only for its author, or for an audience?** This decides whether onboarding, a
  tutorial and difficulty options are on-vision at all, so it is worth settling before anyone builds
  one. The nearest thing to a statement is the constraint at `docs/roadmap.md:321-325` that the game
  only needs to run locally on one machine — but that is about deployment, not about who plays it,
  so nothing here claims either way.
- **Do the unported Java areas arrive as ordinary content, and when?** The Java build still has the
  castle proper, the Vortex and the queen's minigames (`README.md:25-27`); the roadmap's phase table
  names only the Vortex and the minigames (`docs/roadmap.md:61`). That the game is endless says they
  would not be an endgame if they landed; it does not say whether or when they land, and this
  document does not either.

## Where to go next

- [balance-protocol.md](balance-protocol.md) — the procedure for changing any number the game plays
  by. Read it before touching a formula, cost, price or rate.
- [gameplay.md](gameplay.md) — the numbers and formulas themselves, read off the code with Java file
  references so you can check them.
- [porting-notes.md](porting-notes.md) — every deliberate departure from the 1997 original, and the
  reasoning this document points at rather than repeats.
- [roadmap.md](roadmap.md) — the sequenced work, and in its "Value against effort" section
  (`docs/roadmap.md:294-317`) the standing view of what is worth building. That judgement is not
  re-litigated here.
- [adr/2026-08-30-typescript-rewrite.md](adr/2026-08-30-typescript-rewrite.md) — why there is a
  rewrite at all, rather than more modernisation in Java.
