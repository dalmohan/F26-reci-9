import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { mergeIntervals, type Interval } from '../src/intervals';

// Read the spec in src/intervals/mergeIntervals.ts, then check your progress
// with `npm run mutants:intervals`.
//
// Label every property with its pattern, on the line above its `it(`:
//   // Pattern: invariant. The output is sorted.
// (invariant, algebraic, metamorphic, differential, or conditional)

// Valid intervals by construction: pick a start, then a non-negative length,
// so start <= end always holds (the spec's precondition). Zero-length
// intervals like [3, 3] are allowed. Small ranges make overlaps and
// exactly-touching endpoints common.
const interval: fc.Arbitrary<Interval> = fc
  .tuple(fc.integer({ min: -20, max: 20 }), fc.nat(10))
  .map(([start, len]): Interval => [start, start + len]);
const intervalList = fc.array(interval, { maxLength: 10 });

// Intervals that already neither overlap nor touch, built directly (no filter):
// each interval starts at least 1 after the previous one ends. A gap of exactly
// 1 (e.g. [1, 2] then [3, 4]) is common, so "integer neighbours" show up often.
const disjointSorted: fc.Arbitrary<Interval[]> = fc
  .tuple(
    fc.integer({ min: -20, max: 20 }),
    fc.array(fc.tuple(fc.integer({ min: 1, max: 3 }), fc.nat(4)), { maxLength: 8 }),
  )
  .map(([first, steps]) => {
    const out: Interval[] = [];
    let cursor = first - 1;
    for (const [gap, len] of steps) {
      const start = cursor + gap;
      out.push([start, start + len]);
      cursor = start + len;
    }
    return out;
  });

// A list together with a shuffled copy of the same intervals.
const shuffled = <T>(xs: T[]) =>
  fc.shuffledSubarray(xs, { minLength: xs.length, maxLength: xs.length });

// Obviously correct reference check: is point p inside any interval?
const covers = (xs: readonly Interval[], p: number) => xs.some(([s, e]) => s <= p && p <= e);

// Every integer and half-integer point across the generator's whole range.
// Half-integers matter: the spec says points are all real numbers.
const samplePoints: number[] = [];
for (let k = -44; k <= 64; k++) samplePoints.push(k / 2);

describe('mergeIntervals', () => {
  // Pattern: invariant. Every input interval lies inside some output interval.
  it('every input interval lies inside some output interval', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        const uncovered = xs.filter(([s, e]) => !out.some(([a, b]) => a <= s && e <= b));
        expect(uncovered).toEqual([]);
      }),
    );
  });

  // Pattern: invariant. The output is sorted, and consecutive intervals neither overlap nor touch.
  it('output is sorted with a strict gap between consecutive intervals', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        for (const [s, e] of out) expect(s).toBeLessThanOrEqual(e);
        for (let i = 0; i + 1 < out.length; i++) {
          expect(out[i][1]).toBeLessThan(out[i + 1][0]);
        }
      }),
    );
  });

  // Pattern: invariant. The input array and the intervals in it are not modified.
  it('does not modify its input', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const before = xs.map(([s, e]) => [s, e]);
        mergeIntervals(xs);
        expect(xs).toEqual(before);
      }),
    );
  });

  // Pattern: differential. Every point (including non-integers) is covered by the output exactly when it is covered by the input.
  it('covers exactly the same points as the input', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        const mismatches = samplePoints.filter(p => covers(xs, p) !== covers(out, p));
        expect(mismatches).toEqual([]);
      }),
    );
  });

  // Pattern: metamorphic. Shuffling the input does not change the output.
  it('input order does not matter', () => {
    fc.assert(
      fc.property(
        intervalList.chain(xs => fc.tuple(fc.constant(xs), shuffled(xs))),
        ([xs, ys]) => {
          const a = mergeIntervals(xs.map(([s, e]): Interval => [s, e]));
          const b = mergeIntervals(ys.map(([s, e]): Interval => [s, e]));
          expect(b).toEqual(a);
        },
      ),
    );
  });

  // Pattern: algebraic. Merging is idempotent: merging an already-merged list changes nothing.
  it('merging twice is the same as merging once', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const once = mergeIntervals(xs);
        expect(mergeIntervals(once)).toEqual(once);
      }),
    );
  });

  // Pattern: conditional. If no two input intervals overlap or touch, the output is just the input sorted.
  it('already-disjoint intervals come back sorted and unchanged', () => {
    fc.assert(
      fc.property(
        disjointSorted.chain(sorted => fc.tuple(fc.constant(sorted), shuffled(sorted))),
        ([sorted, input]) => {
          expect(mergeIntervals(input)).toEqual(sorted);
        },
      ),
    );
  });
});
