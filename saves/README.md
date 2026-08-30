# Saves

One plain-text `.hero` file per character. **These are committed on purpose** -- that is how
a hero moves between machines:

```
# after playing
git add saves && git commit -m "Aldric: level 12" && git push

# on the other machine
git pull
```

The format is the game's own token syntax, one field per line, so `git diff` shows what
actually changed between sessions rather than an opaque blob.

To keep saves somewhere else -- a synced folder, or a separate private repo -- launch with:

```
java -Ddragoncourt.saveDir=/path/to/saves -jar build/libs/RustyDagger.jar
```

Saves written by older builds were bare files named after the hero in the working
directory. Those are still read if no `.hero` file exists yet, and rewritten here on the
next save.
