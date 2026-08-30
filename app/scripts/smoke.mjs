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
if (app.querySelectorAll('[role="progressbar"]').length !== 2) {
  fail("expected a health bar and an experience bar on the status panel");
}

clickButton("Go questing");
if (!app.querySelector(".log")) {
  fail("questing did not open a fight");
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
if (!ending.includes("Back to the fields") && !ending.includes("Begin again")) {
  fail(`the fight ended with no way out; buttons: ${ending.join(", ")}`);
}

clickButton(ending.includes("Begin again") ? "Begin again" : "Back to the fields");
if (!buttons().some((b) => b.textContent === "Go questing")) {
  fail("could not get back to the fields");
}

clickButton("Character");
if (!textOf().includes("Pack")) {
  fail("the character screen did not open");
}

console.log(
  `smoke: booted, fought ${String(rounds)} rounds, returned, opened the character screen`,
);
