/**
 * A hero, read from and written back to a `.hero` save.
 *
 * The 1997 format stores a hero as a name, three base stats, and a set of named lists — pack, gear,
 * stat, temp, rank, values, store, looks. Everything else about a character is somewhere in those:
 * your level is a count called `Level` in `rank`, your money is a count called `Marks` in `pack`,
 * whether you are alive is a value called `state` in `values`.
 *
 * Lists are found **by name, not by position**, which is how the Java build does it too
 * (`itAgent.fixLists`). That matters: real saves carry an empty field between the stats and the
 * lists, and older ones may carry lists in a different order.
 */

import { parseEntity, type Entity, type Field } from "../format/parse.js";
import { serialiseEntity } from "../format/serialise.js";

/** A carried item: a stack of something, or a piece of equipment. */
export interface CarriedCount {
  readonly kind: "count";
  readonly name: string;
  readonly count: number;
}

export interface CarriedArms {
  readonly kind: "arms";
  readonly name: string;
  readonly attack: number;
  readonly defend: number;
  readonly skill: number;
  readonly traits: readonly string[];
}

/** Anything the port does not model yet — notes, nested oddities — kept verbatim so it survives. */
export interface CarriedOpaque {
  readonly kind: "opaque";
  readonly name: string;
  readonly entity: Entity;
}

export type Carried = CarriedCount | CarriedArms | CarriedOpaque;

export interface Hero {
  readonly name: string;
  readonly guts: number;
  readonly wits: number;
  readonly charm: number;
  readonly pack: readonly Carried[];
  readonly gear: readonly Carried[];
  /** Counts and flags: Age, Version, Fame, and bare tokens like `Guild`. */
  readonly stat: ReadonlyMap<string, number>;
  readonly statFlags: readonly string[];
  readonly temp: ReadonlyMap<string, number>;
  readonly rank: ReadonlyMap<string, number>;
  readonly values: ReadonlyMap<string, string>;
  /**
   * Everything from the original entity that this model does not interpret, kept so that saving a
   * hero the port has loaded never quietly drops part of the character.
   */
  readonly extra: readonly Field[];
}

export class SaveFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveFormatError";
  }
}

const LIST_NAMES = ["pack", "gear", "stat", "temp", "rank", "values", "store", "looks"];

function isEntity(field: Field): field is Entity {
  return typeof field !== "string";
}

function findList(entity: Entity, name: string): Entity | null {
  for (const field of entity.fields) {
    if (isEntity(field) && field.type === "itList" && field.name === name) {
      return field;
    }
  }
  return null;
}

function toCarried(field: Field): Carried | null {
  if (!isEntity(field)) {
    return null;
  }
  if (field.type === "itArms") {
    const [attack, defend, skill, ...rest] = field.fields;
    const num = (f: Field | undefined): number => (typeof f === "string" ? Number(f) : 0);
    return {
      kind: "arms",
      name: field.name,
      attack: num(attack),
      defend: num(defend),
      skill: num(skill),
      traits: rest.filter((f): f is string => typeof f === "string" && f.length > 0),
    };
  }
  if (field.type === "itCount" || field.type === "itPercent" || field.type === "itRandom") {
    const payload = field.fields[0];
    return {
      kind: "count",
      name: field.name,
      count: typeof payload === "string" ? Number(payload) : 0,
    };
  }
  return { kind: "opaque", name: field.name, entity: field };
}

/** Counts in a list, keyed by name. Bare tokens are flags and are collected separately. */
function countsOf(list: Entity | null): { counts: Map<string, number>; flags: string[] } {
  const counts = new Map<string, number>();
  const flags: string[] = [];
  if (list === null) {
    return { counts, flags };
  }
  for (const field of list.fields) {
    if (typeof field === "string") {
      if (field.length > 0) flags.push(field);
    } else if (field.fields.length > 0) {
      const payload = field.fields[0];
      counts.set(field.name, typeof payload === "string" ? Number(payload) : 0);
    } else {
      flags.push(field.name);
    }
  }
  return { counts, flags };
}

function valuesOf(list: Entity | null): Map<string, string> {
  const values = new Map<string, string>();
  if (list === null) {
    return values;
  }
  for (const field of list.fields) {
    if (isEntity(field) && field.type === "itValue") {
      // A value's payload is plain text. A nested entity here would be malformed, so it is
      // skipped rather than stringified into "[object Object]".
      const payload = field.fields[0];
      values.set(field.name, typeof payload === "string" ? payload : "");
    }
  }
  return values;
}

/**
 * Reads a `.hero` save.
 *
 * @throws SaveFormatError if the text is not a hero.
 */
export function parseHero(text: string): Hero {
  const entity = parseEntity(text);
  if (entity.type !== "itHero" && entity.type !== "itAgent") {
    throw new SaveFormatError(`expected an itHero, got ${entity.type}`);
  }

  const [guts, wits, charm] = entity.fields;
  const stat0 = (f: Field | undefined): number => (typeof f === "string" ? Number(f) : 0);
  const stat = countsOf(findList(entity, "stat"));

  const known = new Set(LIST_NAMES);
  const extra = entity.fields
    .slice(3)
    .filter((f) => !(isEntity(f) && f.type === "itList" && known.has(f.name)))
    .filter((f) => !(typeof f === "string" && f.trim() === ""));

  return {
    name: entity.name,
    guts: stat0(guts),
    wits: stat0(wits),
    charm: stat0(charm),
    pack: (findList(entity, "pack")?.fields ?? [])
      .map(toCarried)
      .filter((c): c is Carried => c !== null),
    gear: (findList(entity, "gear")?.fields ?? [])
      .map(toCarried)
      .filter((c): c is Carried => c !== null),
    stat: stat.counts,
    statFlags: stat.flags,
    temp: countsOf(findList(entity, "temp")).counts,
    rank: countsOf(findList(entity, "rank")).counts,
    values: valuesOf(findList(entity, "values")),
    extra,
  };
}

/** Convenience readers for the things buried in the lists. */
export const heroLevel = (h: Hero): number => h.rank.get("Level") ?? 1;
export const heroSocial = (h: Hero): number => h.rank.get("Social") ?? 0;
export const heroFame = (h: Hero): number => h.stat.get("Fame") ?? 0;
export const heroExp = (h: Hero): number => h.stat.get("Exp") ?? 0;
export const heroAge = (h: Hero): number => h.stat.get("Age") ?? 16;
export const heroState = (h: Hero): string => h.values.get("state") ?? "Alive";
export const heroPlace = (h: Hero): string => h.values.get("place") ?? "fields";
export const heroMarks = (h: Hero): number => {
  const marks = h.pack.find((c) => c.name === "Marks");
  return marks?.kind === "count" ? marks.count : 0;
};

function carriedToEntity(item: Carried): Entity {
  switch (item.kind) {
    case "count":
      return { type: "itCount", name: item.name, fields: [String(item.count)] };
    case "arms":
      return {
        type: "itArms",
        name: item.name,
        fields: [String(item.attack), String(item.defend), String(item.skill), ...item.traits],
      };
    case "opaque":
      return item.entity;
  }
}

function countsToEntity(
  name: string,
  counts: ReadonlyMap<string, number>,
  flags: readonly string[] = [],
): Entity {
  return {
    type: "itList",
    name,
    fields: [
      ...[...counts].map(([key, value]) => ({
        type: "itCount",
        name: key,
        fields: [String(value)],
      })),
      ...flags,
    ],
  };
}

/** Writes a hero back out in the same format the game reads. */
export function serialiseHero(hero: Hero, pretty = true): string {
  const entity: Entity = {
    type: "itHero",
    name: hero.name,
    fields: [
      String(hero.guts),
      String(hero.wits),
      String(hero.charm),
      { type: "itList", name: "pack", fields: hero.pack.map(carriedToEntity) },
      { type: "itList", name: "gear", fields: hero.gear.map(carriedToEntity) },
      countsToEntity("stat", hero.stat, hero.statFlags),
      countsToEntity("temp", hero.temp),
      countsToEntity("rank", hero.rank),
      {
        type: "itList",
        name: "values",
        fields: [...hero.values].map(([key, value]) => ({
          type: "itValue",
          name: key,
          fields: [value],
        })),
      },
      ...hero.extra,
    ],
  };
  return serialiseEntity(entity, { pretty });
}
