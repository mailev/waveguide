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

import fc from "fast-check";
import { pipe } from "fp-ts/lib/pipeable";
import { makeDeferred } from "../src/deferred";
import { done, interrupt } from "../src/exit";
import * as io from "../src/wave";
import { makeRef } from "../src/ref";
import { arbEitherIO, eqvIO, expectExit } from "./tools.spec";
import * as waver from "../src/waver";

describe("fiber", () => {
  it("fibers are joinable", () =>
    expectExit(
      pipe(
        io.delay(io.pure(42), 10),
        io.fork,
        io.chainWith((fiber) => fiber.join)
      ),
      done(42)
    )
  );
  it("fibers are interruptible", () =>
    expectExit(
      pipe(
        io.never,
        io.fork,
        io.chainWith((fiber) =>
          io.applySecond(
            io.delay(fiber.interrupt, 10),
            fiber.wait
          )
        )
      ),
      done(interrupt)
    )
  );
  it("fibers interrupt is a no-op after interruption", () => {
    const wave = io.chain(io.fork(io.delay(io.pure(undefined), 1000)), (fiber) => 
      io.applySecond(
        fiber.interrupt,
        io.shiftAsyncBefore(io.applySecond(
          fiber.interrupt,
          fiber.wait
        ))
      )
    )
    return expectExit(wave, done(interrupt));
  })
  it("fiber interrupt is a no-op after completion", () => {
    const wave = io.chain(io.fork(io.pure(1)), (fiber) => 
      io.applySecond(
        fiber.wait,
        io.shiftAsyncBefore(io.applySecond(
          fiber.interrupt,
          fiber.wait
        ))
      )
    )
    return expectExit(wave, done(done(1)));
  })
  it("environments should propogate across fibers", () => {
    const fiber = waver.env<string>();
    const host = 
            waver.chain(waver.fork(fiber), (f) => waver.contravaryR(f.join));
    return expectExit(host("hello"), done("hello"));
  });
  describe("properties", function() {
    this.timeout(5000);
    it("fork/join is the same result as initial", () =>
      fc.assert(
        fc.asyncProperty(
          arbEitherIO(fc.string(), fc.integer()),
          (inner) => eqvIO(
            io.result(inner),
            io.chain(io.fork(inner), (fiber) => fiber.wait)
          )
        ),
        { verbose: true }
      )
    );
    // Fuzz timing effects
    it("uninterruptible fibers are not interruptible", () =>
      fc.assert(
        fc.asyncProperty(
          fc.nat(50),
          (delay) =>
            expectExit(
              io.chain(
                makeDeferred<never, void>(),
                (latch) =>
                  io.chain(makeRef(false),
                    (cell) =>
                      io.chain(
                        io.fork(
                          io.uninterruptible(io.applySecond(latch.wait, cell.set(true)))
                        ),
                        (child) =>
                          io.applySecond(
                            io.fork(io.shiftAsyncBefore(child.interrupt)),
                            io.applySecond(
                              io.delay(latch.done(undefined), delay),
                              io.applySecond(
                                child.wait,
                                cell.get
                              )
                            )
                          )
                      )
                  )
              ),
              done(true)
            )
        ),
        {verbose: true}
      )
    );
    // Counter-example from above
    it("interruptible fibers are interruptible", () =>
      fc.assert(
        fc.asyncProperty(
          fc.integer(0, 50),
          (delay) =>
            expectExit(
              io.chain(makeDeferred<never, void>(),
                (latch) =>
                  io.chain(io.fork(io.as(latch.wait, 42)),
                    (child) =>
                      io.applySecond(
                        io.shiftAsyncBefore(child.interrupt),
                        io.applySecond(
                          io.delay(latch.done(undefined), delay),
                          child.wait
                        )
                      )
                  )
              ),
              done(interrupt)
            )
        )
      )
    );
  });
});
