# Saves

One plain-text `.hero` file per character. The Java build writes them here; `.gitignore` keeps them
out of the repository.

**They used to be committed**, so that a hero moved between machines by `git push`. That worked,
but it made play files part of the source, and the test suite quietly came to read one as a fixture
— three tests then passed only on the machine that had played, and stayed broken everywhere else
until CI was fixed and caught it. Test fixtures now live in
[`app/test/fixtures/`](../app/test/fixtures/) and are never written to.

If you want a character on two machines, keep the directory somewhere of your own:

```
java -Ddragoncourt.saveDir=/path/to/synced/folder -jar build/libs/RustyDagger.jar
```

That can be a private repo, a synced folder, or a memory stick. The format is the game's own token
syntax, one field per line, so `git diff` still shows what changed in a session.

**Two machines editing the same hero will conflict** and the merge will not be meaningful. Treat a
hero as owned by one machine at a time.

## The two builds keep saves in different places

| Build | Where a character lives |
|---|---|
| Java | this directory, as `<Name>.hero` |
| `app/` | your browser's local storage, under `rustydagger.hero` |

They read and write the same format, so a character can move either way: **Save a copy** in the web
app downloads a `.hero` the Java build can open, and **Load a character** takes one back.

Saves written by builds older than this port were bare files named after the hero in whatever the
working directory happened to be. Those are still read if no `.hero` file exists yet, and rewritten
here on the next save.
