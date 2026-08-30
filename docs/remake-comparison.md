# What the remake changed, and which of it we take

[Dragon Court: Revived](https://dragoncourt.penguinchilling.com/) is the live, still-maintained
descendant of this game — the same 1997 original, kept running and actively developed. It
publishes [patch notes](https://dragoncourt.penguinchilling.com/DCourt/PatchNotes.html), which
means someone else has already worked out which of this game's rough edges are worth filing off.
This document is the assessment of that list: what has already been taken, what is worth taking,
and what cannot come across.

**Where the coverage stops.** The published patch notes run to **V1.22.002**; the remake's live
build is advertised as **v1.22.012**. This document is exhaustive against the published notes and
says nothing about the ten builds between them. Every release from V1.19.038 to V1.22.002 has a
row below, including the ones with nothing in them for us — a silently skipped release is exactly
the failure this document exists to prevent.

**What this port already shares with the remake.** More than the two changes the porting notes
record as taken. Bag space 60→75 and mouse-wheel plus keyboard list navigation were ported
deliberately ([porting-notes.md](porting-notes.md)). But this port also independently arrived at
**save-on-every-screen-change**, which the remake added in V1.19.039, and **multiple hero slots**,
which the remake added in V1.20.001. Those were not ported — they were reached separately, and the
overlap is four items rather than three.

**A caution about the "free" verdicts.** Several rows say a change costs nothing once the game is
a web app rather than a 400x300 bitmap. That is true of the rendering ones without qualification.
It is *not* unconditionally true of the text-clipping ones: a web layout clips text just as
happily as AWT does if a container is given a fixed width. Those rows read "free if the layout
reflows" for that reason, and the constraint is the point of the row.

## The assessment

| Change | Patch | Verdict | Note |
|---|---|---|---|
| Status bar cutting off Marks and worn equipment | V1.19.038 | Free if the layout reflows | Costs nothing provided no container is pinned to a fixed width. Pin one and the defect returns. |
| Cut-off text in Silas' Keepers Tavern | V1.19.038 | Free if the layout reflows | Same condition as above. |
| Tab and Enter on the login screen | V1.19.039 | Portable | Pure ergonomics. Cheap, and the entry screen is the first thing anyone touches. |
| Mouse wheel scrolling in lists | V1.19.039 | Ported | Already here — every list is the one shared `FTextList` widget, so it landed everywhere at once. |
| Auto-save | V1.19.039 | Already here independently | Reached separately; hangs off `DCourtPanel.setRegion`, the single navigation chokepoint. Toggleable via `dragoncourt.autosave`. |
| Original Times New Roman font loading | V1.19.039 | Not portable | A defect of the remake's own font pipeline. Does not exist here and will not exist in a web app. |
| Base quest replenish 40 → 50 | V1.19.039 | Moot | This port removes the daily quest allowance entirely ([porting-notes.md](porting-notes.md)), so there is nothing to replenish. |
| Sage training subtracting the wrong stats | V1.19.039 | Not portable | Checked against the code: there is no Sage skill in this game. The guild teaches Fighter, Magery and Trader, each costing 2 points of two stats, and each matches its own flavour text. Remake-only content. |
| Status screen remembering Name/Stats ordering across logins | V1.19.040 | Portable | Small, and the kind of thing that is invisible until it is missing. |
| Anti-aliased rendering | V1.19.040 | Free once rendering is not a 400x300 bitmap | Handled by the platform rather than scheduled as work. |
| Bold and italic font rendering fixes | V1.19.040 | Free once rendering is not a 400x300 bitmap | As above. |
| Saved login and hero switching for heroes on one email | V1.19.040 | Not portable | Account-backed. This port has no accounts; hero switching already exists locally off the save directory. |
| Early mobile/tablet support | V1.19.040 | Not portable as written | Depends on the saved-login work above. A web app gets touch input for free, but this is not a change to adopt. |
| "Elden needs a new private boat" | V1.19.040 | Not portable | Remake-specific content. |
| Auto-save tracking location | V1.19.041 | Already here independently | This port saves on every screen change, so location is inherently current. |
| Clan page link and ability display at login | V1.19.041 | Not portable | Clan features are server-backed. |
| 32-character limit on clan names | V1.19.041 | Not portable | As above. |
| Illuminati Sage skill Mark costs halved | V1.19.041 | Rules — needs a toggle | A balance change, not a fix. Gated per the toggle policy below if adopted at all. |
| "Faery Fridays" enchanting events made universal | V1.19.041 | Not portable | A live-service event system. |
| Soulbound items with no degradation | V1.19.041 | Not portable | Start of the soulbound system, which is large new content. |
| Silver and Crystal equipment "Bind on Equip" | V1.19.041 | Not portable | Depends on the soulbound system. |
| Fates Wheel reward scaling | V1.19.041 | Rules — needs a toggle | Balance. Gated if adopted. |
| Soulbound equipment on the Fates Wheel | V1.19.041 | Not portable | Depends on the soulbound system. |
| Item identification firing at exactly the required Marks | V1.19.041 | Not here | Checked: every threshold on the identify path uses `>=`, including the button-enable check in `Shop`. No off-by-one to inherit. |
| Royal Court negative-quest exploit | V1.19.041 | Cannot bite by default | This port ignores fatigue unless the daily quest limit is switched on, so quests never go negative. Only reachable with `-Ddragoncourt.dailyQuestLimit=true`. |
| Glimmerforge Caverns questing zone | V1.20.001 | Not portable | Large new content. |
| Dorin Stonekeeper, soulbind management and dismantling | V1.20.001 | Not portable | Depends on the soulbound system. |
| Rux, trading Essences and Marks | V1.20.001 | Not portable | Depends on the essence system. |
| Rare Essences dropping per region | V1.20.001 | Not portable | New system plus new content. |
| New items, equipment and super-rare world drops | V1.20.001 | Not portable | New content. |
| Soulbound equipment granting +10% stats | V1.20.001 | Not portable | Depends on the soulbound system. |
| Stat buffs to underused equipment | V1.20.001 | Rules — needs a toggle | Balance, and balanced around content this port does not have. |
| New enemies in Sea / Go Fish | V1.20.001 | Not portable | New content. |
| End-game equipment via Fate's Wheel | V1.20.001 | Not portable | New content. |
| New Dragon Guard missions and end-game boss | V1.20.001 | Not portable | New content. |
| Silver Masamune and Silver Gladius skill values corrected | V1.20.001 | Needs their numbers | Both items ship here in `ArmsTable`, but the notes do not say what the values were corrected *to*. This is a comparison to go and make, not a known fix. |
| Spelling errors in Fred's dialogue | V1.20.001 | Not portable | Remake-specific text. |
| BoE messages and confirmation prompt | V1.20.001 | Not portable | Depends on Bind on Equip. |
| Max enchanting stacks increased | V1.20.001 | Rules — needs a toggle | Balance. |
| Enchant success rates scaling with enchant count | V1.20.001 | Rules — needs a toggle | Balance. |
| Mage skill ranks raising scroll application rates | V1.20.001 | Rules — needs a toggle | Balance. |
| Equipment info showing maximum trait status | V1.20.001 | Portable | Presentation. Tells the player when an item cannot improve further — currently unknowable without outside knowledge. |
| Illuminati guild skill purchase buttons not working | V1.20.001 | Not portable | A defect of the remake's own UI. |
| Jaguar dropping SJF again | V1.20.001 | Not portable | Remake-specific regression. |
| Panic gear reducing enemy flee chance | V1.20.001 | Rules — needs a toggle | Changes combat outcomes. |
| Improved Silvers/Crystals spawn rates | V1.20.001 | Rules — needs a toggle | Balance. |
| Guild status bar not responding to clicks | V1.20.001 | Portable — bug fix | Worth checking against this port's guild screen when Phase 5 reaches it. |
| Mouse wheel scrolling two items per notch | V1.20.001 | Ported | Already here, at exactly two rows per notch. |
| Arrow and WASD keys for item selection | V1.20.001 | Ported | Already here, along with PageUp/Down, Home/End and Enter/Space. |
| Sending mail made case-insensitive | V1.20.001 | Not portable | Mail is server-backed. |
| 100k bank transfer size option | V1.20.001 | Portable | Removes repetitive clicking on a screen that is pure friction today. |
| Bag space to 75, bank space to 100 | V1.20.001 | Ported (bag) | Bag space 60→75 is already here. Bank space is a separate, un-taken half of the same line. |
| Hero selector for switching after login | V1.20.001 | Already here independently | The entry screen lists heroes that have saves. |
| End-of-day screen restart button | V1.20.001 | Portable | Pure ergonomics. |
| End-of-day screen showing wealth gained/lost | V1.20.001 | Portable | Presentation only, and genuinely informative. |
| Tonic of Unskilling recovering lost stats | V1.20.001 | Rules — needs a toggle | Refunds initial stat training costs. A real change to how a character is built. |
| Ieatsu core stat gain chances | V1.20.001 | Rules — needs a toggle | Changes progression rates. |
| Backstab and Ieatsu granting stat gains on non-finishing blows | V1.20.001 | Rules — needs a toggle | Same. |
| Hero Rebirth — free hero reset at the guild | V1.21.001 | Rules — needs a toggle | The largest single rules change on the list. Removes the permanence of a build. |
| Solo Legends mode | V1.21.001 | Not portable | Defined by leaderboards and mail/clan restrictions — all server-backed. |
| Hardcore Legends mode | V1.21.001 | Not portable | As above. The single-life mechanic alone would be portable, but the mode is not. |
| Developing equipped gear during challenges | V1.21.001 | Rules — needs a toggle | Balance. |
| Reduced weapon gamble and item Mark costs | V1.21.001 | Rules — needs a toggle | Balance. |
| Reduced essence tier conversion costs | V1.21.001 | Not portable | Depends on the essence system. |
| Manticoria expansion and new zones | V1.22.002 | Not portable | Large new content. |
| Fishing minigame | V1.22.002 | Not portable | New content. |
| PvP encounters and Infamy leaderboard | V1.22.002 | Not portable | Requires other players and a server. |
| New guild abilities (Brave, Fudoshin, Hydration, Third Eye, Villainy) | V1.22.002 | Not portable | Two of the five depend on Glimmerforge and Infamy; all five are new systems layered on content this port lacks. |
| Looted equipment displaying its quality stat | V1.22.002 | Portable | Presentation. Fits naturally with the item-description work. |

## Why the rules-changing ones are gated

Anything above marked **Rules — needs a toggle** changes how the game plays, not how it looks or
how it feels to operate. The standing constraint on this port is the game as it was, so those ship
switched off by default, with the 1997 behaviour as the default and the remake's behaviour behind
a flag.

This is not a new pattern here. `DCourt.Control.GameRules` already holds exactly three such flags
— `dragoncourt.dailyQuestLimit`, `dragoncourt.multiplayerScreens` and `dragoncourt.autosave`,
documented in the options table in [README.md](../README.md). Each is a single constant read from
a system property, carrying a comment explaining the 1997 behaviour it departs from, and every
call site funnels through it. That is why removing the daily quest limit was a one-line change
rather than thirty scattered conditionals.

The rewrite keeps one such chokepoint. It does not scatter conditionals through the screens.

See [roadmap.md](roadmap.md) for when this work happens — the ergonomic and bug-fix rows are not
scheduled as one lump, and the gated rules changes come last.
