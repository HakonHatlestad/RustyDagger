# Saves

## Where they live

One plain-text file per hero, `saves/<Hero Name>.hero`, relative to the working directory.
`./gradlew run` runs from the project root, so that is `saves/` in the checkout.

Override with a system property:

```
java -Ddragoncourt.saveDir=/path/to/elsewhere -jar build/libs/RustyDagger.jar
```

[`SaveStore`](../src/main/java/DCourt/Control/SaveStore.java) owns all of this. Nothing else
should touch save paths.

## Moving a hero between computers

Saves are **not committed**. They were, once: `saves/` was in the repository so a hero moved
between machines by `git push`. It worked, and it cost more than it was worth — play files became
part of the source, and the test suite ended up reading one as a fixture, so three tests passed
only on the machine that had played. Fixtures live in
[`app/test/fixtures/`](../app/test/fixtures/) now, and `.gitignore` keeps `saves/*.hero` out.

To keep a hero in two places, point the save directory somewhere of your own — a private repo, a
synced folder, a memory stick:

```
java -Ddragoncourt.saveDir=/path/to/synced/folder -jar build/libs/RustyDagger.jar
```

The format is line-oriented text either way, so `git diff` still shows what actually changed in a
session rather than one opaque blob:

```
{itHero|Sir Testalot|9|7|0
	|
	{~|pack}|
	{~|gear}|
	{~|stat}|
	{~|temp}|
	{~|rank}|
	{~|values|{=|place|Fields}}|
	{~|store}|
	{~|looks}|{=|Date|2026-08-30}}
```

**Two machines editing the same hero will conflict**, and the merge will not be meaningful —
treat a hero as owned by one machine at a time, the same way you would a database.

## The two builds keep them in different places

| Build | Where a character lives |
|---|---|
| Java | `saves/<Name>.hero` |
| `app/` | the browser's local storage, under `rustydagger.hero` |

Both read and write the same format, so a character crosses either way. In the web app, **Save a
copy** downloads a `.hero` the Java build opens, and **Load a character** takes one back. The
importer is deliberately forgiving about surrounding whitespace and deliberately unforgiving about
everything else: it reports what is wrong and leaves the character you already had alone, because
the file it was handed may be somebody's only copy.

## Format

The game's own `{type|field|field}` serialization, documented in [SPEC.md](../SPEC.md). A hero is
an `itHero`: name, then Guts/Wits/Charm, then the named child lists (`pack`, `gear`, `stat`,
`temp`, `rank`, `values`, `store`, `looks`) and a `Date` stamp of the last day played.

The `Date` field is what the original compared against the server clock to decide whether a new
day had started. With the daily quest limit off it no longer gates play, but it is still written
and still drives the once-a-day `advance()` that ages the hero and applies stat raises.

## Safety

Writes go to a temporary file and are then atomically moved into place, so an interrupted save
cannot truncate an existing hero. The original wrote straight over the file.

## Legacy saves

Builds before this port wrote a bare file named after the hero — no extension — into whatever the
working directory happened to be. `SaveStore.read` still falls back to that location when no
`.hero` file exists, and the next save writes to the new one. Nothing is deleted; move or bin the
old file yourself once you have confirmed the hero loads.
