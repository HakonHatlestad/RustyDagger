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

The save directory is **committed to this repo on purpose**:

```
# after playing
git add saves && git commit -m "Aldric: level 12" && git push

# on the other machine
git pull
```

That works because the format is line-oriented text, so `git diff` shows what actually changed
in a session rather than one opaque blob:

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

If you would rather not keep characters in the game repo, point `dragoncourt.saveDir` at a
separate private repo or a synced folder and the same workflow applies.

**Two machines editing the same hero will conflict**, and the merge will not be meaningful —
treat a hero as owned by one machine at a time, the same way you would a database.

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
