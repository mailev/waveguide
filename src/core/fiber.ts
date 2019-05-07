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

import { fromNullable, none, Option, some } from "fp-ts/lib/Option";
import { Driver } from "./driver";
import { Exit } from "./exit";
import { IO, io } from "./io";
import { Runtime } from "./runtime";

export interface Fiber<E, A> {
  readonly name: Option<string>;
  readonly interrupt: IO<never, void>;
  readonly wait: IO<never, Exit<E, A>>;
  readonly join: IO<E, A>;
  readonly result: IO<E, Option<A>>;
  readonly isComplete: IO<never, boolean>;
}

export class FiberContext<E, A> implements Fiber<E, A> {
  public readonly name: Option<string>;
  public readonly interrupt: IO<never, void>;
  public readonly wait: IO<never, Exit<E, A>>;
  public readonly join: IO<E, A>;
  public readonly result: IO<E, Option<A>>;
  public readonly isComplete: IO<never, boolean>;

  constructor(private readonly driver: Driver<E, A>, name?: string) {
    this.name = fromNullable(name);
    const sendInterrupt = io.effect(() => {
      this.driver.interrupt();
    });
    this.wait = io.asyncTotal(this.driver.onExit);
    this.interrupt = sendInterrupt.applySecond(this.wait.unit());
    this.join = this.wait.widenError<E>().chain((exit) => io.completeWith(exit));
    this.result = io.effect(() => this.driver.exit())
      .widenError<E>()
      // TODO: When Exit is a functor this gets easier
      .chain((opt) => opt.fold(io.succeed(none), (exit) => io.completeWith(exit).map(some)));
    this.isComplete = io.effect(() => this.driver.exit().isSome());
   }

   public start() {
    this.driver.start();
   }
}

function create<E, A>(init: IO<E, A>, runtime: Runtime, name?: string): IO<never, Fiber<E, A>> {
  return io.effect(() => {
    const driver = new Driver(init, runtime);
    const ctx = new FiberContext(driver);
    ctx.start();
    return ctx;
  });
}

function wrap<E, A>(driver: Driver<E, A>): Fiber<E, A> {
  return new FiberContext(driver);
}

function join<E, A>(fib: Fiber<E, A>): IO<E, A> {
  return fib.join;
}

export const fiber = {
  create,
  wrap,
  join
} as const;
