import { describe, expect, it } from "vitest";
import {
  compareToWorn,
  deltaClass,
  deltaLabel,
  describeItem,
  isUnidentified,
  isWearable,
  itemWorth,
  slotsOf,
  type ItemView,
} from "../src/ui/describe.js";

function item(name: string, over: Partial<ItemView> = {}): ItemView {
  return { name, attack: 0, defend: 0, skill: 0, enchant: 0, traits: [], ...over };
}

const sword = item("Long Sword", { attack: 15, traits: ["right"] });
const betterSword = item("Battle Axe", { attack: 25, traits: ["right"] });
const shield = item("Great Targe", { defend: 8, traits: ["left"] });
const pike = item("Pike", { attack: 30, traits: ["right", "left"] });
const plate = item("Half Plate", { defend: 12, traits: ["body"] });

describe("what an item is worth", () => {
  it("adds up everything it contributes", () => {
    expect(itemWorth(item("X", { attack: 3, defend: 4, skill: 5 }))).toBe(12);
  });

  it("counts the traits that change what it contributes", () => {
    const glowing = item("X", { skill: 1, traits: ["glows"] });
    expect(itemWorth(glowing)).toBe(itemWorth(item("X", { skill: 1 })) + 2);
  });

  it("knows where an item is worn", () => {
    expect(slotsOf(pike)).toEqual(["right", "left"]);
    expect(isWearable(pike)).toBe(true);
    expect(isWearable(item("Cookie"))).toBe(false);
  });
});

describe("comparing against what you are wearing", () => {
  it("is positive when the new item is better", () => {
    expect(compareToWorn(betterSword, [sword]).delta).toBe(10);
    expect(deltaLabel(compareToWorn(betterSword, [sword]))).toBe("+10");
    expect(deltaClass(compareToWorn(betterSword, [sword]))).toBe("delta--better");
  });

  it("is negative when it is worse", () => {
    expect(compareToWorn(sword, [betterSword]).delta).toBe(-10);
    expect(deltaLabel(compareToWorn(sword, [betterSword]))).toBe("-10");
    expect(deltaClass(compareToWorn(sword, [betterSword]))).toBe("delta--worse");
  });

  it("shows an equals sign for an even swap", () => {
    expect(
      deltaLabel(compareToWorn(sword, [item("Twin", { attack: 15, traits: ["right"] })])),
    ).toBe("=");
  });

  it("counts everything a two-handed weapon would displace", () => {
    // A pike takes both hands, so it costs you the shield as well as the sword.
    const comparison = compareToWorn(pike, [sword, shield]);
    expect(comparison.displaced).toHaveLength(2);
    expect(comparison.delta).toBe(30 - (15 + 8));
  });

  it("counts a two-handed weapon you are already holding only once", () => {
    const comparison = compareToWorn(betterSword, [pike]);
    expect(comparison.displaced).toHaveLength(1);
    expect(comparison.delta).toBe(25 - 30);
  });

  it("ignores gear in slots the item does not use", () => {
    expect(compareToWorn(sword, [plate]).displaced).toHaveLength(0);
    expect(compareToWorn(sword, [plate]).delta).toBe(15);
  });

  it("says nothing about an unidentified item, whose stats are hidden anyway", () => {
    const secret = item("Odd Blade", { attack: 99, traits: ["right", "secret"] });
    expect(isUnidentified(secret)).toBe(true);
    expect(compareToWorn(secret, [sword]).delta).toBeNull();
    expect(deltaLabel(compareToWorn(secret, [sword]))).toBe("");
  });

  it("says nothing about something you cannot wear", () => {
    expect(compareToWorn(item("Cookie", { attack: 5 }), [sword]).delta).toBeNull();
  });

  it("does not compare an item against itself", () => {
    expect(compareToWorn(sword, [sword]).delta).toBe(15);
  });
});

describe("the description", () => {
  it("leads with what the numbers mean", () => {
    const lines = describeItem(sword);
    expect(lines[0]).toContain("+15 attack");
  });

  it("says where it is worn", () => {
    expect(describeItem(plate).join(" ")).toContain("Worn: body");
  });

  it("calls out a two-handed weapon", () => {
    expect(describeItem(pike).join(" ")).toContain("Two-handed");
  });

  it("says what it would replace, and whether that is an improvement", () => {
    const lines = describeItem(betterSword, [sword]).join(" ");
    expect(lines).toContain("Long Sword");
    expect(lines).toContain("better by 10");
  });

  it("says when the slot is empty", () => {
    expect(describeItem(sword, []).join(" ")).toContain("Nothing equipped there");
  });

  it("explains traits in words rather than showing a keyword", () => {
    const flaming = item("Flame Brand", { attack: 10, traits: ["right", "flame"] });
    const text = describeItem(flaming).join(" ");
    expect(text).toContain("flame");
    expect(text).toContain("+8 attack");
  });

  it("says plainly that an unidentified item is a mystery", () => {
    const secret = item("Odd Blade", { attack: 99, traits: ["right", "secret"] });
    expect(describeItem(secret).join(" ")).toContain("Unidentified");
    // And does not leak the stats it is hiding.
    expect(describeItem(secret).join(" ")).not.toContain("99");
  });

  it("handles an item that does nothing at all", () => {
    expect(describeItem(item("Pebble", { traits: ["body"] }))[0]).toContain("No effect");
  });

  it("does not invent trait explanations it does not have", () => {
    const odd = item("Thing", { attack: 1, traits: ["right", "notarealtrait"] });
    expect(describeItem(odd).join(" ")).not.toContain("notarealtrait");
  });
});
