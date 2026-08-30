/**
 * Boots the built bundle and plays a fight through it.
 *
 * The suite tests the source. This tests the artefact: that what `vite build` actually emits loads,
 * finds its content files, renders, and can be clicked through. Those are different failures — a
 * broken content path or a bundling mistake passes every unit test and gives you a blank page.
 *
 * Run with `pnpm smoke`, after `pnpm build`.
 */

import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const DIST = "dist";

function fail(message) {
  console.error(`smoke: ${message}`);
  process.exit(1);
}

const html = readFileSync(`${DIST}/index.html`, "utf8");
const bundlePath = html.match(/src="\/(assets\/[^"]+\.js)"/)?.[1];
if (!bundlePath) {
  fail("no module script in the built index.html");
}

const dom = new JSDOM(html, {
  url: "http://localhost/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
});

// jsdom has no fetch, and the bundle asks for its content over HTTP. Serve it off disk.
dom.window.fetch = (path) => {
  const name = String(path).replace(/^\//, "");
  try {
    const body = readFileSync(`${DIST}/${name}`, "utf8");
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(JSON.parse(body)),
    });
  } catch {
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error(name)) });
  }
};

// jsdom will not execute type="module", so evaluate the bundle directly.
dom.window.eval(readFileSync(`${DIST}/${bundlePath}`, "utf8").replace(/^export\{[^}]*\};?/m, ""));

await new Promise((resolve) => setTimeout(resolve, 500));

const app = dom.window.document.getElementById("app");
const textOf = () => app.textContent ?? "";
const buttons = () => [...app.querySelectorAll("button")];
const clickButton = (label) => {
  const target = buttons().find((b) => b.textContent === label);
  if (!target) {
    fail(
      `no button "${label}"; have: ${buttons()
        .map((b) => b.textContent)
        .join(", ")}`,
    );
  }
  target.click();
};

if (textOf().includes("Could not start")) {
  fail(`the app reported a startup error: ${textOf()}`);
}
if (buttons().length === 0) {
  fail("nothing rendered");
}

// A fresh browser has no save, so the first thing the game asks for is a character.
if (!textOf().includes("Who were you before that")) {
  fail(`a browser with no save should open on character creation; got: ${textOf().slice(0, 120)}`);
}
const background = [...app.querySelectorAll("button.choice")].find((b) =>
  b.textContent.startsWith("Squire"),
);
if (!background) {
  fail("character creation offered no backgrounds");
}
background.click();
const nameField = app.ownerDocument.getElementById("hero-name");
nameField.value = "Smoke";
nameField.dispatchEvent(new dom.window.Event("input"));
clickButton("Begin");

if (!textOf().includes("Smoke")) {
  fail("the character that was just made is not on the status panel");
}
if (app.querySelectorAll('[role="progressbar"]').length !== 2) {
  fail("expected a health bar and an experience bar on the status panel");
}

// Timid creatures bolt on sight and the encounter ends before a blow is struck, so this hunts until
// something actually stands and fights. Assuming the first one does is flaky by construction.
const has = (label) => buttons().some((b) => b.textContent === label);

/** Walks to the region list from wherever the last quest left us. */
const toRegions = () => {
  for (let step = 0; step < 6; step++) {
    if (app.querySelector("button.choice")) {
      return;
    }
    if (has("Wake up in town")) clickButton("Wake up in town");
    else if (has("Back to the hunt")) clickButton("Back to the hunt");
    else if (has("Go hunting")) clickButton("Go hunting");
    else if (has("Back")) clickButton("Back");
    else break;
  }
  fail(
    `could not reach the region list; buttons: ${buttons()
      .map((b) => b.textContent)
      .join(" | ")}`,
  );
};

const hunt = () => {
  toRegions();
  const region = [...app.querySelectorAll("button.choice")].find((b) =>
    b.textContent.startsWith("The Fields"),
  );
  if (!region) {
    fail("the hunting screen offered no regions");
  }
  region.click();
  if (!app.querySelector(".log")) {
    fail("questing did not open a fight");
  }
};

let engaged = false;
for (let attempt = 0; attempt < 60 && !engaged; attempt++) {
  hunt();
  engaged = has("Attack");
}
if (!engaged) {
  fail("nothing stood and fought in 60 quests");
}

let rounds = 0;
while (buttons().some((b) => b.textContent === "Attack") && rounds < 300) {
  clickButton("Attack");
  rounds++;
}
if (rounds === 0) {
  fail("could not throw a single punch");
}
if (rounds >= 300) {
  fail("the fight never ended");
}

const ending = buttons().map((b) => b.textContent);
if (!ending.includes("Back to the hunt") && !ending.includes("Wake up in town")) {
  fail(`the fight ended with no way out; buttons: ${ending.join(", ")}`);
}

const lost = ending.includes("Wake up in town");
clickButton(lost ? "Wake up in town" : "Back to the hunt");
if (!lost) {
  // "Back to the hunt" lands on the region list; town is one more step away.
  clickButton("Back");
}
if (!buttons().some((b) => b.textContent === "Go hunting")) {
  fail(
    `could not get back to town; buttons: ${buttons()
      .map((b) => b.textContent)
      .join(", ")}`,
  );
}

clickButton("Character");
if (!textOf().includes("Pack")) {
  fail("the character screen did not open");
}
clickButton("Back");

// Saving is the bug this whole exercise started from: prove the artefact actually writes one.
clickButton("Temple");
clickButton("Back");
const stored = dom.window.localStorage.getItem("rustydagger.hero");
if (!stored || !stored.startsWith("{itHero")) {
  fail("nothing was autosaved after a session of play");
}

console.log(
  `smoke: booted, fought ${String(rounds)} rounds, returned, opened the character screen, autosaved`,
);
