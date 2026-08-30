/**
 * The `{type|field|field}` format the 1997 game uses for everything it stores.
 *
 * Every monster, weapon and quest in the game is written in it, and so is every save file, which is
 * why this is the first thing the port needs. The grammar is documented in `../../SPEC.md`.
 *
 * Two things about it are worth knowing before reading the code. Entities nest: a field can itself
 * be a `{...}` entity, and lists routinely contain other lists several deep. And a type is spelled
 * either as a full name (`itArms`) or as a one-character icon (`~` for a list, `=` for a key/value
 * pair), with the two entirely interchangeable — the same monster can be written either way.
 */

/** The one-character forms, and the full names they abbreviate. */
const ICONS: Readonly<Record<string, string>> = {
  "=": "itValue",
  "~": "itList",
  "#": "itCount",
  "%": "itPercent",
  "@": "itRandom",
};

/**
 * A parsed entity: its type, its name, and its remaining fields in source order.
 *
 * Fields stay as a mixed list of strings and nested entities rather than being mapped into named
 * properties, because what a field *means* depends on the type and this layer deliberately does not
 * know the game's rules. Interpreting them is the job of the code that asked for the parse.
 */
export interface Entity {
  /** Always the full name, never the icon — `itList`, not `~`. */
  readonly type: string;
  readonly name: string;
  readonly fields: readonly Field[];
}

export type Field = string | Entity;

export class ParseError extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(`${message} (at offset ${offset})`);
    this.name = "ParseError";
  }
}

/**
 * Parses one entity from `text`.
 *
 * Leading and trailing whitespace is ignored, and so is whitespace between fields: the game
 * pretty-prints nested entities with newlines and tabs when it writes them out, and that layout
 * carries no meaning.
 *
 * @throws ParseError if the text is not a single well-formed entity.
 */
export function parseEntity(text: string): Entity {
  const parser = new Parser(text);
  parser.skipSpace();
  const entity = parser.entity();
  parser.skipSpace();
  if (!parser.atEnd) {
    throw new ParseError("trailing text after the entity", parser.offset);
  }
  return entity;
}

/** True if `text` is a single well-formed entity. Useful for probing untrusted input. */
export function isEntity(text: string): boolean {
  try {
    parseEntity(text);
    return true;
  } catch {
    return false;
  }
}

class Parser {
  offset = 0;

  constructor(private readonly text: string) {}

  get atEnd(): boolean {
    return this.offset >= this.text.length;
  }

  skipSpace(): void {
    while (this.offset < this.text.length && /\s/.test(this.text[this.offset]!)) {
      this.offset++;
    }
  }

  entity(): Entity {
    if (this.text[this.offset] !== "{") {
      throw new ParseError("expected '{'", this.offset);
    }
    this.offset++;

    const rawType = this.token();
    const type = ICONS[rawType] ?? rawType;
    if (type === "") {
      throw new ParseError("entity has no type", this.offset);
    }

    // A bare `{~}` is a legal empty list: type, no name, no fields.
    if (this.text[this.offset] === "}") {
      this.offset++;
      return { type, name: "", fields: [] };
    }
    this.expect("|");

    const name = this.token();
    const fields: Field[] = [];
    for (;;) {
      const c = this.text[this.offset];
      if (c === undefined) {
        throw new ParseError("unterminated entity", this.offset);
      }
      if (c === "}") {
        this.offset++;
        return { type, name, fields };
      }
      this.expect("|");
      this.skipSpace();
      // A field is either a nested entity or a plain token. `{` can only start the former,
      // because the format has no escape for a literal brace inside a value.
      fields.push(this.text[this.offset] === "{" ? this.entity() : this.token());
    }
  }

  /** Everything up to the next structural character, with surrounding whitespace trimmed. */
  private token(): string {
    const start = this.offset;
    while (this.offset < this.text.length && !"|{}".includes(this.text[this.offset]!)) {
      this.offset++;
    }
    return this.text.slice(start, this.offset).trim();
  }

  private expect(char: string): void {
    if (this.text[this.offset] !== char) {
      throw new ParseError(`expected '${char}'`, this.offset);
    }
    this.offset++;
  }
}
