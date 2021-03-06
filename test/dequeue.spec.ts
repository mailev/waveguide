// Copyright 2019 Ryan Zeigler
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { expect } from "chai";
import fc, { Arbitrary, Command } from "fast-check";
import * as O from "fp-ts/lib/Option";
import { none, some } from "fp-ts/lib/Option";
import * as p from "fp-ts/lib/pipeable";
import { pipe } from "fp-ts/lib/pipeable";
import { Dequeue, empty } from "../src/support/dequeue";

describe("Dequeue", () => {
  it("take on empty is none", () => {
    expect(empty().take()).to.deep.equal(none);
  });
  it("pull on empty is none", () => {
    expect(empty().pull()).to.deep.equal(none);
  });
  it("take after offer is a value", () => {
    const queue = empty().offer(42);
    const result = pipe(queue.take(), O.map((v) => v[0]));
    expect(result).to.deep.equal(some(42));
  });
  it("pull after offer is a value", () => {
    const queue = empty<number>().offer(42);
    const result = queue.pull();
    p.pipe(
      result,
      O.fold(
        () => { throw new Error("expected some"); },
        (tuple) => expect(tuple[0]).to.equal(42)
      )
    );
  });
  it("take after multiple offers is the first", () => {
    const queue = empty()
      .offer(42)
      .offer(43)
      .offer(44);
    const result = queue.take();
    p.pipe(
      result,
      O.fold(
        () => { throw new Error("expected some"); },
        (tuple) => {
          expect(tuple[0]).to.equal(42);
          expect(tuple[1].size()).to.equal(2);
        }
      )
    );
  });
  it("pull after multiple offers is the last", () => {
    const queue = empty()
      .offer(42)
      .offer(43)
      .offer(44);
    const result = queue.pull();
    p.pipe(
      result,
      O.fold(
        () => { throw new Error("expected some"); },
        (tuple) => {
          expect(tuple[0]).to.equal(44);
          expect(tuple[1].size()).to.equal(2);
        }
      )
    );
  });

    interface Model {
        fake: number[];
    }
    interface Real {
        actual: Dequeue<number>;
    }

    // push addss to the right, offer adds to the left
    // pull takes from the left, take takes from the right
    const pushCommandArb: Arbitrary<Command<Model, Real>> = fc.nat()
      .map((n) => {
        return {
          check(_m: Model): boolean {
            return true;
          },
          run(m: Model, r: Real): void {
            m.fake.push(n);
            r.actual = r.actual.push(n);
          },
          toString() {
            return `push ${n}`;
          }
        };
      });

    const pullCommandArb: Arbitrary<Command<Model, Real>> = fc.constant({
      check(_m: Model): boolean {
        return true;
      },
      run(m: Model, r: Real): void {
        const expected = m.fake.shift();
        p.pipe(
          r.actual.pull(),
          O.fold(
            () => {
              if (expected) {
                throw new Error("expected there to be something");
              }
            },
            ([n, q]) => {
              expect(n).to.equal(expected);
              r.actual = q;
            }
          )
        );
      },
      toString() {
        return "pull";
      }
    });

    const offerCommandArb: Arbitrary<Command<Model, Real>> = fc.nat()
      .map((n) => {
        return {
          check(_m: Model): boolean {
            return true;
          },
          run(m: Model, r: Real): void {
            m.fake.unshift(n);
            r.actual = r.actual.offer(n);
          },
          toString() {
            return `offer ${n}`;
          }
        };
      });

    const takeCommandArb: Arbitrary<Command<Model, Real>> = fc.constant({
      check(_m: Model): boolean {
        return true;
      },
      run(m: Model, r: Real): void {
        const expected = m.fake.pop();
        p.pipe(
          r.actual.take(),
          O.fold(
            () => {
              if (expected) {
                throw new Error("expected there to be something");
              }
            },
            ([n, q]) => {
              expect(n).to.equal(expected);
              r.actual = q;
            }
          )
        );
      },
      toString() {
        return "take";
      }
    });

    const commandsArb = fc.commands([pushCommandArb, pullCommandArb, offerCommandArb, takeCommandArb]);

    it("should never lose elements", () => {
      fc.assert(
        fc.property(commandsArb, (commands) => {
          fc.modelRun(() => ({model: {fake: []}, real: {actual: empty()}}), commands);
        })
      );
    });
});
