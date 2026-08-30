# Test fixtures

`hero.hero` is the save the suite reads. It is a fixture and nothing writes to it.

It used to read `saves/Timber.hero` instead, which is a **live play file** — the Java build writes
to it whenever anyone plays. Three tests quietly came to depend on items a play session had
happened to add (a Cookie, a Bottled Faery, a note from Fred), so they passed on the machine that
had played and failed everywhere else. That is exactly the failure a fixture exists to prevent, and
it went unnoticed because CI had never successfully run the suite.

The file is a real `.hero` in the 1997 format and deliberately carries one of everything the tests
need to see:

- a stack (`Cookie`), so list rows and counts have something to render
- an `itNote`, which the port does not model, to prove an unknown item survives a round trip
- a worn `itArms`, so the gear list and the stat comparison are not empty
- guild rank and the `Guild` trait, so ranks are proven to load from a real save
