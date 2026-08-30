/**
 * The game's random generator, reproduced exactly.
 *
 * Every rule in Dragon Court is built on the five helpers at the bottom of this file, so if this
 * layer is even slightly off, nothing above it can match the Java build no matter how carefully it
 * is ported. That makes it the one place where "close enough" is worth nothing.
 *
 * The Java side calls `java.util.Random`, whose algorithm is not an implementation detail — it is
 * specified exactly, precisely so that a seeded sequence is reproducible. So this is a faithful
 * reimplementation of that specification rather than an approximation of it, and the tests check it
 * against sequences recorded from the real thing in `baseline/rules.txt`.
 *
 * `BigInt` is used for the 48-bit state deliberately. The multiplier overflows a double long before
 * the state does, so ordinary JavaScript numbers would silently lose the low bits and produce a
 * sequence that looks random and is wrong.
 */

const MULTIPLIER = 0x5deece66dn;
const ADDEND = 0xbn;
const MASK = (1n << 48n) - 1n;

/** Two-to-the-31, for wrapping a 32-bit result back into a signed integer. */
const TWO_31 = 2 ** 31;
const TWO_32 = 2 ** 32;

/**
 * A seeded generator matching `java.util.Random`.
 *
 * Not a global: the Java build keeps one static generator and reseeds it, which is convenient there
 * and awkward to test. Keeping instances means a test can hold its own sequence without disturbing
 * anyone else's.
 */
export class JavaRandom {
  private state = 0n;

  constructor(seed = 0) {
    this.setSeed(seed);
  }

  /** Reseeds, scrambling the way `Random.setSeed` does. */
  setSeed(seed: number): void {
    this.state = (BigInt(Math.trunc(seed)) ^ MULTIPLIER) & MASK;
  }

  /** The generator's core step: advance the state, return the top `bits` bits. */
  private next(bits: number): number {
    this.state = (this.state * MULTIPLIER + ADDEND) & MASK;
    return Number(this.state >> BigInt(48 - bits));
  }

  /** A uniform signed 32-bit integer, the whole range. */
  nextInt(): number {
    const raw = this.next(32);
    return raw >= TWO_31 ? raw - TWO_32 : raw;
  }

  /**
   * A uniform integer in `[0, bound)`.
   *
   * The power-of-two case and the rejection loop are both from the specification. The loop matters
   * for faithfulness as well as fairness: it consumes a further value whenever it rejects one, so
   * dropping it would leave the generator in a different position and every later roll would
   * diverge.
   */
  nextIntBounded(bound: number): number {
    if (bound <= 0) {
      throw new RangeError(`bound must be positive, got ${bound}`);
    }
    if ((bound & -bound) === bound) {
      return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);
    }
    let bits: number;
    let val: number;
    do {
      bits = this.next(31);
      val = bits % bound;
    } while (bits - val + (bound - 1) >= TWO_31);
    return val;
  }
}

/**
 * The game's own helpers, in terms of that generator.
 *
 * These are ported from `DCourt.Tools.Tools`, and the shapes are worth keeping in mind because the
 * rules lean on them: `twice` is triangular rather than flat, and `contest` is the opposed check
 * used for everything from initiative to haggling.
 */
export class GameRandom {
  private readonly rng: JavaRandom;

  constructor(seed = 0) {
    this.rng = new JavaRandom(seed);
  }

  setSeed(seed: number): void {
    this.rng.setSeed(seed);
  }

  nextInt(): number {
    return this.rng.nextInt();
  }

  /**
   * Uniform over `0..value-1`, and zero for a non-positive bound.
   *
   * That guard is the Java build's, not an invention here: the original negated a raw `nextInt()`
   * and took a modulus, which could return a negative and crash a table lookup. See
   * `docs/porting-notes.md`.
   */
  roll(value: number): number {
    if (value < 1) {
      return 0;
    }
    return this.rng.nextIntBounded(value);
  }

  /** Two rolls summed — triangular, so results cluster in the middle. */
  twice(value: number): number {
    return this.roll(value) + this.roll(value);
  }

  /** True with probability `a / (a + b)`. The universal opposed check. */
  contest(a: number, b: number): boolean {
    return this.roll(a + b) < a;
  }

  /** True `value` percent of the time. */
  percent(value: number): boolean {
    return this.roll(100) < value;
  }

  /** True one time in `value`. */
  chance(value: number): boolean {
    return this.roll(value) === 0;
  }

  /** A uniform pick from `list`. */
  select<T>(list: readonly T[]): T {
    return list[this.roll(list.length)]!;
  }
}
