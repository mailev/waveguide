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

import { FunctionN } from "fp-ts/lib/function";
import { IO, sync } from "./io";

export interface Ref<A> {
    readonly get: IO<never, A>;
    set(a: A): IO<never, A>;
    update(f: FunctionN<[A], A>): IO<never, A>;
    modify<B>(f: FunctionN<[A], readonly [B, A]>): IO<never, B>;
}

/**
 * Creates an IO that will allocate a Ref.
 * Curried form of makeRef_ to allow for inference on the initial type
 */
export const makeRef = <E = never>() => <A>(initial: A): IO<E, Ref<A>> =>
    sync(() => {
        let value = initial;

        const get = sync(() => value);

        const set = (a: A): IO<never, A> => sync(() => {
            const prev = value;
            value = a;
            return prev;
        });

        const update = (f: FunctionN<[A], A>): IO<never, A> => sync(() => {
            return value = f(value);
        });

        const modify = <B>(f: FunctionN<[A], readonly [B, A]>): IO<never, B> => sync(() => {
            const [b, a] = f(value);
            value = a;
            return b;
        });

        return {
            get,
            set,
            update,
            modify
        };
    });

export function makeRef_<E, A>(initial: A): IO<E, Ref<A>> {
    return makeRef<E>()(initial);
}
