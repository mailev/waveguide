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

export type FiberResult<E, A> = Interrupted | Result<E, A>;

export class Interrupted {
  public readonly _tag: "interrupted" = "interrupted";
}

export const interrupted = new Interrupted();

export type Result<E, A> = Cause<E> | Value<A>;

export type Attempt<E, A> = Raise<E> | Value<A>;

export class Value<A> {
  public readonly _tag: "value" = "value";
  constructor(public readonly value: A) { }
}

export type Cause<E> = Raise<E> | Abort;

export class Raise<E> {
  public readonly _tag: "raise" = "raise";
  constructor(public readonly error: E, public readonly more: ReadonlyArray<Cause<E>> = []) { }
  public and(cause: Cause<E>): Cause<E> {
    return new Raise(this.error, [...this.more, cause]);
  }
}

export class Abort {
  public readonly _tag: "abort" = "abort";
  constructor(public readonly error: unknown, public readonly more: ReadonlyArray<Cause<unknown>> = []) { }
  public and(cause: Cause<unknown>): Cause<unknown> {
    return new Abort(this.error, [...this.more, cause]);
  }
}

export type OneOf<A, B> = First<A> | Second<B>;

export class First<A> {
  public readonly _tag: "first" = "first";
  constructor(public readonly first: A) {}
}

export class Second<B> {
  public readonly _tag: "second" = "second";
  constructor(public readonly second: B) { }
}
