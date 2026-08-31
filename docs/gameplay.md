# Gameplay systems

Everything here was read off the code, with file references so you can check it. Read this before
touching balance. The intent behind these numbers is in [design-vision.md](design-vision.md), and
changing any of them goes through [balance-protocol.md](balance-protocol.md).

## Creating a hero

[`arCreate`](../src/main/java/DCourt/Screens/Command/arCreate.java) gives you **20 build points**.
Guts, Wits and Charm each start at 4; money starts at 1 point, worth $25. Every extra pip of
anything costs one point. Four optional traits come out of the same pool:

| Trait | Cost |
|---|---|
| Noble | 12 |
| Trader | 10 |
| Wizard | 9 |
| Warrior | 8 |

A trait is roughly half your build, so it is a real commitment. There are no classes and no
skill trees beyond this.

## Derived combat stats

Your three raw stats do not fight for you. [`itAgent.calcCombat()`](../src/main/java/DCourt/Items/List/itAgent.java)
derives the numbers that actually get used:

```
Skill (initiative + accuracy) = (2*Wits + Charm + 2) / 3  + gearSkill  + magicRank
Attack                        = gearAttack + fightRank
Defence                       = gearDefend + thiefRank
```

**Attack and Defence come entirely from equipment and guild rank.** A naked hero with maxed Guts
has zero attack. Guts is your health pool and your damage multiplier.

**Skill is the accuracy stat, not Attack.** Attack and Defence only size a blow that has already
landed — see the hit roll below.

Traits add 10% on top: `Agile`→Skill, `Strong`→Attack, `Sturdy`→Defence.

Levelling costs `50 * 1.5^(level-1)` experience, truncated — 50, 75, 112, 168, 253… so it
steepens fast.

## Combat

One round, in [`arBattle.battle()`](../src/main/java/DCourt/Screens/Quest/arBattle.java):

1. **Swings** — each side rolls `twice(3)`, giving 0–4 attacks, averaging 2. Very swingy; a 0
   means you flail for the round.
2. **Initiative** — `contest(yourSpeed, theirSpeed)`, so you act first with probability
   `yours / (yours + theirs)`.
3. **Hit or miss** — a miss when `roll(theirSkill) > yourSkill`, so this is **Skill against
   Skill; Attack and Defence do not enter it.** `agentAct` takes the two speeds as `as`/`ds`
   ([`arBattle.java:216`](../src/main/java/DCourt/Screens/Quest/arBattle.java), called from line
   159), which is easy to misread as attack and defence. The consequences: `roll(n)` tops out at
   `n-1`, so **once your Skill is within one of theirs you cannot miss at all**, and below that
   you connect `(yourSkill + 1) / theirSkill` of the time. A defender with `Alert` against a
   Backstab, or `Fencer` against a Berzerk or Ieatsu, gets +30 Skill for this roll only.

   **Two fixes for the plateau were measured and neither was adopted.** Recorded so the
   experiment is not repeated: over 1,980 harness battles, capping the hit chance at 95% (widening
   the roll only where it saturates) barely moves the game — monster kill rate 45%→44%, dodges up
   about a fifth — but Skill still stops paying once you pass them, so it fixes invulnerability
   and not the wasted stat. Replacing the roll with `contest(yourSkill, theirSkill)` fixes both,
   since `a/(a+b)` never saturates, but it more than doubles dodges (432→999) and drops the
   monster kill rate to 34%, lengthening every fight in the game by roughly a third. The
   saturating rule was kept deliberately.
4. **Damage** — `(Guts * (2 + swings)) / 10 + Attack - Defence`.
5. **Severity** — scaled against the defender's *remaining* health, not their maximum. If damage
   is at least what they have left, it is an instant kill.

Special actions are multipliers, not modifiers:

| Action | Effect |
|---|---|
| Backstab | doubles your Guts and Speed, and cuts the enemy to a single swing |
| Berzerk / Ieatsu | doubles your Guts and Speed, and locks you at the maximum 4 swings |
| Control | replaces your Speed with Wits |
| Swindle | replaces your Speed with Charm |
| `Reflex` trait | flat +30 Speed — decisive at low levels |
| `Blind` | halves Speed and swings |

### Winning without a fight

Control and Swindle are not weaker attacks, they are **the other two ways to win**, and they pay
differently. Each is one opposed check — twice your Wits against their Wits, twice your Charm
against their Charm — and taking it ends the encounter on the spot.

| | Kill | Hypnotise | Swindle |
|---|---|---|---|
| Its pack | yours | yours | yours |
| Experience | `baseExp + (2·Guts + Wits + Charm)·weight / 4` | `baseExp + its Wits` | `baseExp + its Charm` |
| Health cost | whatever the fight took | none | none |
| Teaches | Guts | Wits | Charm |

So talking something down is worth the same goods, less experience, and no blood. **Losing the
check is a real loss**: it hands you nothing, an aggressive creature that hypnotises you kills you
outright, and one that swindles you takes half your purse unless you are carrying Thief Insurance.

The names in the code say who *won*, not which flag is set — `wonByHypnosis`, `lostToHypnosis` — 
because naming them after the flag got the port's messages and rewards exactly backwards once
already. See [porting-notes.md](porting-notes.md).

### After a blow lands

A weapon can carry Blind, Panic or Disease, and thrown dust queues the same three. Both go into one
queue on the attacker and are settled together by `arBattle.spellEffects`, which is why a blinding
blade and a handful of Blinding Dust behave identically:

- **Blind** and **Panic** are opposed checks of `yourWits × count` against their Wits, so throwing
  more at once makes them stronger. Blinding halves what the target can do; panic ends the fight.
- **Disease** needs no check and lands for `(damage + 3) / 5`, halved against anyone `Hardy`. It
  drags Skill down and persists until cured.
- A **blast** suppresses disease for that blow: the explosion reached the target, not the blade.

## Growing by what you do

Levelling grants a flat +2 to Guts, Wits and Charm however you play. **This is the other half**, and
it is what makes one character different from another — a win teaches you whatever won it:

| How you won | Teaches |
|---|---|
| Berzerk | Guts, at weight × 5 |
| Backstab | Charm at weight × 3, and Guts at weight × 2 |
| An ordinary attack | Guts, at weight × 1 |
| Hypnotise | Wits, at weight × 5 |
| Swindle | Charm, at weight × 5 |

The chance is `weight / current stat`, from `itHero.gainGuts` and its two siblings — so **it has
diminishing returns built into its shape**: a hero with 10 Guts and a weight of 5 grows half the
time, the same hero at 60 grows one time in twelve. Nothing caps a stat; the curve does it. `weight`
is the region's depth, so the same victory teaches more the further out you got it.

Measured: restoring this, together with the weight term in kill experience, took a 400-quest
campaign in the Fields from level 6 to level 11 and halved the deaths.

## How monsters scale

[`itMonster.balance()`](../src/main/java/DCourt/Items/List/itMonster.java) runs once per
encounter. Guts, Wits and Charm are multiplied by `0.9 + 0.1 * heroLevel` and then passed through
`spread()`; **Attack and Defence are the literal numbers in the `Quests` string and never move.**
So a monster tracks your level but not your gear, and every area gets permanently easier as you
buy armour. Encounter tables also swap at a level threshold — the Fields use `loweight` below
level 3 and `hiweight` from 3 up, which is where the Soldier first appears.

### The `adjust` flag does nothing, and could not be made to work

**Eight** monsters are tagged `adjust` — field Wizard and Soldier, forest Unicorn, mound Queen,
Hills Giant, Hills Dragon, Ocean Mermaid and the Faery. (An earlier version of this note said five;
it missed the Giant, the Dragon and the Mermaid.) The tag was meant to scale them to the hero's
`getPower()`. It never fires: `itAgent.hasTrait` only looks at the `temp` and `stat` lists, and
`adjust` is declared inside `values`. Verified by instrumenting `balance()` — with a hero geared to
power 949, the field Wizard still rolls 1–2 Guts at hero levels 1, 3, 5, 10 and 20.

**It was enabled, measured, and reverted.** Two separate faults, and the second one is fatal.

*The shallow fault.* The guarded block divides by `(float) (getPower() / heroPower)` — an *integer*
division, so any monster weaker than the hero gives `0`, the ratio becomes `Infinity`, and
`alterGuts()` writes `Integer.MAX_VALUE`. The damage term `(guts * (2 + swings)) / 10` then
overflows, and because the sign flips with the parity of `2 + swings` it comes out as either `0` or
`214748364` — a monster that is unkillable, harmless on even swings, and an instant death on odd
ones. That part is fixable: divide in floating point and guard both zero cases.

*The fatal fault.* With the division fixed and the flag reaching the list it lives in, the parity
harness recorded 288 rounds against those eight monsters. **The monster died 0 times**, against 114
before the change. The mechanic multiplies Guts, Wits, Charm and the base attack, defence and skill
all by the same power ratio, and against a late-game hero that ratio is around 150. The field
Wizard's Defence goes from 12 to 2,547 while your Attack is 150 — and since damage is
`Guts × (2 + swings) / 10 + Attack − Defence`, a linear rule, you do nothing at all. Forever. The
Wizard hypnotises you until you die.

So uniform multiplication cannot produce a fair fight against this damage formula, only an
unwinnable one. Scaling a monster to a hero needs a rule built for the damage model, which is
design work rather than a bug fix — see [roadmap.md](roadmap.md), where it belongs to the
rules-changing group that ships as an opt-in toggle.

**Leave the flag dead.** It is not a latent feature waiting for a one-line fix.

## A monster decides what to do before it fights you

`itMonster.chooseActions` runs every round and the order of its decisions matters more than any
single one of them.

**A monster with no actions left goes straight to its skills**, skipping everything else. That gate
decides a great deal: the field Wizard and the Hills Wyvern carry no `Actions` at all, so they
always cast rather than throw dust.

**A scripted move outranks everything** — the goat's charge, the worm's swallow — and is spent as it
is used.

**Then dust against skill.** How much dust it can throw is capped by its actions, and the skill side
is weighted by how outmatched it is, so a creature facing someone far stronger leans on what it
knows rather than what it carries.

**Then `useSkills`.** It bolts when `roll(3)` reaches its stance — so a passive creature nearly
always flees and an aggressive one never does, which is why stance rising each round is what commits
it to the fight. Otherwise: opening round, magic against thievery and swordsmanship; later rounds,
only magic against fighting.

**A monster that decides to run leaves, and no round happens at all.** `arQuest` returns
`mobFlees()` the moment the chosen action is Runaway, before a blow is struck. This is easy to miss
and changes the whole early game: without it, timid creatures stand and fight to the death.

Note also that `isMatch` is **case-insensitive**, and monsters carry their options in the content in
lower case (`control`, `swindle`) while the constants are capitalised. Comparing exactly means a
monster never hypnotises anyone.

## Every number you own is stored obfuscated

`itCount` — which holds your Marks, your stats, every weapon's attack value, every count in the
game — does not store its number. It stores a random offset and the number minus that offset:

```java
public void setCount(int num) {
  this.offset = Tools.roll(1024) + 1;
  this.value = num - this.offset;
}
public int getCount() {
  return this.value + this.offset;
}
```

This is 1997 anti-cheat. The applet ran on the player's own machine, so a memory scanner looking
for "you have 4000 Marks" would find nothing, and freezing either half corrupts the value rather
than pinning it.

**It has one consequence that matters far more than the protection does: every write to any count
advances the random generator.** Wearing down a weapon looks like two random draws in the source and
actually costs five, because the three stat reductions each set a count and each set consumes a
roll. Nothing observable changes — `getCount` gives the same answer either way — but the generator
moves.

That is why parity for the rewrite is defined in two halves ([development.md](development.md)):
demanding an identical sequence of random draws would require the TypeScript port to reimplement
this obfuscation, purely to stay in step with a memory-protection trick that a local web app has no
use for.

## Randomness

All of it goes through a handful of helpers in
[`Tools`](../src/main/java/DCourt/Tools/Tools.java):

| Helper | Distribution |
|---|---|
| `roll(n)` | uniform `0..n-1` |
| `twice(n)` | two rolls summed — triangular, clusters mid-range |
| `contest(a,b)` | true with probability `a/(a+b)` — the universal opposed check |
| `percent(v)` | `v`% chance |
| `chance(v)` | 1 in `v` |
| `fourTest(a,b)` | four independent `a/(a+b)` trials, returns 0–4 successes |
| `skew(v)` | keep rolling `v`% until one fails — geometric, occasionally huge |
| `spread(v)` | `1 + 5v/7 + twice(2v/7)` — clusters just below `v`; used for treasure |

**The generator is deliberately reseeded from the character sheet.**
[`itHero.update()`](../src/main/java/DCourt/Items/List/itHero.java) calls
`Tools.setSeed(level + exp + money + age + fame + guildRank)` on load, so a session's rolls are a
function of who you are rather than the clock. That was almost certainly anti-savescumming for
the server version. It is worth knowing before you try to explain a "streak".

### A fixed bug worth knowing about

`roll()` used to be `|nextInt()| % value`. `Integer.MIN_VALUE` negates to itself, so once in 2^32
calls it returned a **negative** number, which reaches `select(list)` as `list[roll(list.length)]`
and throws. It is now `nextInt(value)`, which also drops the modulo bias the old form had.
Verified uniform across 6M samples with no negatives and no out-of-range values.

This does change the random sequence relative to the 1997 build, which matters only if you were
trying to reproduce historical rolls.

## Items and gear

Three containers:

| Container | Capacity |
|---|---|
| pack | 75, +20 `Trader`, +20 `Merchant` |
| gear | what you are wearing |
| store (bank) | 100, +50 `Hotel` |

Exceeding the pack triggers **overload**: every surplus item costs you one quest. That is a
carry-weight rule and is still enforced even with the daily limit off.

Weapons and armour are [`itArms`](../src/main/java/DCourt/Items/List/itArms.java) carrying
attack/defend/skill plus trait flags (`RIGHT` hand slot, `BLAST`, `Blind`, `SECRET`). Their stats
are shown inline in every list as `Name[+3a+2d+1s]` via `toShow()`.

**Gear wears out — in the Java build.** After each fight, `decay((rate + fightRank) * 5)` rolls
against every item in gear *and* pack; a hit permanently subtracts roughly `1 + stat/12` from each
of the item's three stats, and one time in twelve strips a trait as well. There is no separate
durability counter — decay just erodes the stats you can already see, and replacing gear is that
build's main money sink.

**The rewrite has no decay at all.** It was ported, checked against 91 recorded item trajectories,
and then deliberately removed along with the rest of the daily-game scaffolding —
[porting-notes.md](porting-notes.md) says why. What money is for in `app/` is better gear and the
supplies that keep you alive inside a fight.

### What a piece of equipment is worth

Nothing stores a weapon's price. `itArms.stockValue()` derives it:

```
worth = ((attack + defend)² × 5  ±  skill² × 2) / 2      both terms signed, integer division
      + the trait values below
```

Squaring is what stops good gear being a formality: twice the Attack costs about four times as
much. Traits are worth far more than the stats they sit on, from
[`ArmsTrait.traitValue`](../src/main/java/DCourt/Static/ArmsTrait.java):

| Trait | Worth | Trait | Worth |
|---|---|---|---|
| Glows | 50 | Disease | 1500 |
| Lucky | 250 | Blast | 2000 |
| Bless | 300 | Panic | 3000 |
| Flame | 800 | Blind | 4000 |
| Enchant | 100 (per point) | | |

Anything `SECRET` or `CURSE` is worth exactly 2, because nobody pays for a promise. A shop then
marks up what it specialises in by a third — `arWeapon` anything held in the right hand, `arArmour`
anything worn on the body — with a floor of 2.

These numbers are recorded in `baseline/rules.txt` and checked by `app/test/economy.test.ts`.

## Where you go, and what you meet

Each area holds a **weighted table** and rolls against it — `arField`, `arForest`, `arHills`,
`arMound` and `arCastle` each have one, and `WildsScreen.selectQuest` does the rolling. A uniform
pick over everything sharing the area's prefix is wrong twice over: common creatures stop being
common, and creatures that are not random encounters at all start turning up. **The Dragon is not
in the Hills table.** The Mound's Queen appears only in the deepest of its three.

The Fields alone swap tables at level 3 — no soldiers below it, barely a gypsy — which is the
original's only difficulty ramp. And one encounter in a hundred is the wandering Faery, wherever
you are, which is where that prefix-less monster in the content belongs.

`weight` is what the area passes to `arQuest`: the Fields are 1, the Forest 2, the Hills and Mound
3, and the places beyond them more. It scales kill experience, Fame, and how fast a win teaches
you — it is not a difficulty multiplier. What makes a region hard is what lives in it.

## Scrolls, and what money is for

Both gear shops together come to about three thousand Marks. The best weapon in the game is worth
forty-one thousand and **cannot be bought at all**: sixty-three of the ninety-one pieces of
equipment are loot only. Two ladders connect the two, and both are priced in the 1997 gear table.

**Scrolls**, 60 to 3,500 Marks, each granting a trait the combat maths already applies — Glow,
Bless, Luck, Flame. Whether one takes at all is `contest(your Wits, the item's power)`, where
`power = attack × 3 + defend × 2 + skill`, so a better weapon resists you harder. A Magic guild
rank counts towards your side of that check.

**Enchanting** is the one that repeats, and the only sink with no ceiling:

- Each success is +1 enchantment, worth `(enchant + 9) / 10` Attack, `(enchant + 4) / 10` Defence
  and **the full amount in Skill**.
- It is **safe while the enchantment is below the item's power**, so a great sword absorbs many and
  a knife almost none.
- Past that, each attempt is `contest(overshoot, power)`. Lose it and the item disintegrates and
  the magic goes through you for `overshoot` wounds — which can kill you.

**Key items**, 500 to 18,000 Marks, open the regions beyond the first four. Fifty-eight thousand
Marks of ladder against three thousand of shop, and they are bought *and* found, never consumed.

## Wearing things

Equipment claims one or more of five slots — head, body, feet, right hand, left hand — and putting
one on **displaces whatever holds those slots**, back into the pack. Sixteen weapons are two-handed
and claim both, so a pike costs you the shield as well as the sword. Something claiming no slot at
all cannot be worn, and a cursed item cannot be taken off, which blocks the whole swap rather than
half of it. `arStatus.wearGear`.

## Quests (the day allowance)

`getBaseQuests()` is `27 + 3 * level`, or `27 + 4 * level` with the `Quick` trait. In the original,
every action spent fatigue against that pool and you were locked out until the calendar date
changed.

**This port ignores fatigue by default** — see [porting-notes.md](porting-notes.md). Overload still
counts. Roughly 30 places gate on `getQuests()`, but they all call the one method on `itHero`, so
the switch is in a single place.
