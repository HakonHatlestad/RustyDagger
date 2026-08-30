/**
 * Writing entities back out in the game's own format.
 *
 * The port keeps the 1997 save format rather than inventing one. Two reasons: existing characters
 * keep working without a migration, and saves stay human-readable plain text that produces
 * meaningful git diffs between sessions, which is how they are synced between machines
 * (`docs/saves.md`).
 *
 * Output is not byte-identical to the Java build's, and is not meant to be. The Java pretty-prints
 * with its own tab conventions; what matters is that both sides read what the other writes.
 * `parse(serialise(x))` deep-equals `x`, which is the property the tests hold this to.
 */

import type { Entity, Field } from "./parse.js";

/** The one-character forms, for types that have one. Anything else is written in full. */
const SHORT: Readonly<Record<string, string>> = {
  itValue: "=",
  itList: "~",
  itCount: "#",
  itPercent: "%",
  itRandom: "@",
};

export interface SerialiseOptions {
  /**
   * Break nested entities onto their own indented lines. Easier to read and to diff; the parser
   * ignores the layout either way.
   */
  readonly pretty?: boolean;
}

/** Writes one entity as `{type|name|field|field}`. */
export function serialiseEntity(entity: Entity, options: SerialiseOptions = {}): string {
  return write(entity, options.pretty ?? false, 0);
}

function write(entity: Entity, pretty: boolean, depth: number): string {
  const type = SHORT[entity.type] ?? entity.type;

  // A type with no name and no fields is the empty-list form, `{~}`.
  if (entity.name === "" && entity.fields.length === 0) {
    return `{${type}}`;
  }

  const parts = entity.fields.map((field) => writeField(field, pretty, depth + 1));
  if (parts.length === 0) {
    return `{${type}|${entity.name}}`;
  }

  // Only break lines where a nested entity actually appears; a run of plain values stays inline,
  // which keeps a weapon on one line and a hero's pack readable.
  const hasNested = entity.fields.some((f) => typeof f !== "string");
  if (!pretty || !hasNested) {
    return `{${type}|${entity.name}|${parts.join("|")}}`;
  }
  const indent = "\t".repeat(depth + 1);
  return `{${type}|${entity.name}|\n${indent}${parts.join(`|\n${indent}`)}}`;
}

function writeField(field: Field, pretty: boolean, depth: number): string {
  return typeof field === "string" ? field : write(field, pretty, depth);
}
