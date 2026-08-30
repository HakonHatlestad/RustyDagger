# Gameplay systems

Everything here was read off the code, with file references so you can check it. Read this before
touching balance.

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
Skill (initiative) = (2*Wits + Charm + 2) / 3  + gearSkill  + magicRank
Attack             = gearAttack + fightRank
Defence            = gearDefend + thiefRank
```

**Attack and Defence come entirely from equipment and guild rank.** A naked hero with maxed Guts
has zero attack. Guts is your health pool and your damage multiplier, not your accuracy.

Traits add 10% on top: `Agile`→Skill, `Strong`→Attack, `Sturdy`→Defence.

Levelling costs `50 * 1.5^(level-1)` experience — 50, 75, 113, 169, 253… so it steepens fast.

## Combat

One round, in [`arBattle.battle()`](../src/main/java/DCourt/Screens/Quest/arBattle.java):

1. **Swings** — each side rolls `twice(3)`, giving 0–4 attacks, averaging 2. Very swingy; a 0
   means you flail for the round.
2. **Initiative** — `contest(yourSpeed, theirSpeed)`, so you act first with probability
   `yours / (yours + theirs)`.
3. **Hit or miss** — a miss when `roll(theirDefence) > yourAttack`. Note the consequence: **once
   your Attack meets or exceeds their Defence you cannot miss at all.**
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

### A latent bug

`roll()` is `|nextInt()| % value`. When `nextInt()` returns `Integer.MIN_VALUE`, negating it
overflows back to `Integer.MIN_VALUE`, so `roll()` returns a **negative** number — which reaches
`select(list)` as `list[roll(list.length)]` and throws. Odds are 1 in 2^32 per call. `nextInt(value)`
is the correct fix; it is left alone for now because it would perturb the historical sequence.

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

**Gear wears out.** After each fight, `decay((rate + fightRank) * 5)` rolls against every item in
gear *and* pack; a hit permanently subtracts roughly `1 + stat/12` from each of the item's three
stats, and one time in twelve strips a trait as well. There is no separate durability counter —
decay just erodes the stats you can already see. Replacing gear is the game's main money sink.

## Quests (the day allowance)

`getBaseQuests()` is `27 + 3 * level`, or `27 + 4 * level` with the `Quick` trait. In the original,
every action spent fatigue against that pool and you were locked out until the calendar date
changed.

**This port ignores fatigue by default** — see [porting-notes.md](porting-notes.md). Overload still
counts. Roughly 30 places gate on `getQuests()`, but they all call the one method on `itHero`, so
the switch is in a single place.
