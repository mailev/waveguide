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

import { FunctionN, constant } from "fp-ts/lib/function";
import { Monad3, Monad2 } from "fp-ts/lib/Monad";
import { Semigroup } from "fp-ts/lib/Semigroup";
import { Monoid } from "fp-ts/lib/Monoid";
import { RIO } from "./wave";
import { Fiber } from "./fiber";
import * as io from "./wave";
import { Applicative3 } from "fp-ts/lib/Applicative";
import { Functor3 } from "fp-ts/lib/Functor";

export enum ManagedTag {
    Pure,
    Encase,
    Bracket,
    Suspended,
    Chain
}

/**
 * A Managed<E, A> is a type that encapsulates the safe acquisition and release of a resource.
 *
 * This is a friendly monadic wrapper around bracketExit.
 */
export type Managed<E, A> =
  Pure<E, A> |
  Encase<E, A> |
  Bracket<E, A> |
  Suspended<E, A>  |
  Chain<E, any, A>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * The short form of rsource
 */
export type Resource<E, A> = Managed<E, A>;

export interface Pure<E, A> {
    readonly _tag: ManagedTag.Pure;
    readonly value: A;
}

/**
 * Lift a pure value into a resource
 * @param value 
 */
export function pure<A>(value: A): Managed<never, A> {
    return {
        _tag: ManagedTag.Pure,
        value
    };
}

export interface Encase<E, A> {
    readonly _tag: ManagedTag.Encase;
    readonly acquire: RIO<E, A>;
}

/**
 * Create a Resource by wrapping an IO producing a value that does not need to be disposed
 * 
 * @param res 
 * @param f 
 */
export function encaseRIO<E, A>(rio: RIO<E, A>): Encase<E, A> {
    return { _tag: ManagedTag.Encase, acquire: rio };
}


export interface Bracket<E, A> {
    readonly _tag: ManagedTag.Bracket;
    readonly acquire: RIO<E, A>;
    readonly release: FunctionN<[A], RIO<E, unknown>>;
}

/**
 * Create a resource from an acquisition and release function
 * @param acquire 
 * @param release 
 */
export function bracket<E, A>(acquire: RIO<E, A>, release: FunctionN<[A], RIO<E, unknown>>): Bracket<E, A> {
    return {
        _tag: ManagedTag.Bracket,
        acquire,
        release
    };
}

export interface Suspended<E, A> {
    readonly _tag: ManagedTag.Suspended;
    readonly suspended: RIO<E, Managed<E, A>>;
}

/**
 * Lift an IO of a Resource into a resource
 * @param suspended 
 */
export function suspend<E, A>(suspended: RIO<E, Managed<E, A>>): Suspended<E, A> {
    return {
        _tag: ManagedTag.Suspended,
        suspended
    };
}

export interface Chain<E, L, A> {
    readonly _tag: ManagedTag.Chain;
    readonly left: Managed<E, L>;
    readonly bind: FunctionN<[L], Managed<E, A>>;
}

/**
 * Compose dependent resourcess.
 * 
 * The scope of left will enclose the scope of the resource produced by bind
 * @param left 
 * @param bind 
 */
export function chain<E, L, A>(left: Managed<E, L>, bind: FunctionN<[L], Managed<E, A>>): Chain<E, L, A> {
    return {
        _tag: ManagedTag.Chain,
        left,
        bind
    };
}

/**
 * Curried form of chain
 * @param bind 
 */
export function chainWith<E, L, A>(bind: FunctionN<[L], Managed<E, A>>): FunctionN<[Managed<E, L>], Managed<E, A>> {
    return (left) => chain(left, bind);
}

/**
 * Map a resource
 * @param res 
 * @param f 
 */
export function map<E, L, A>(res: Managed<E, L>, f: FunctionN<[L], A>): Managed<E, A> {
    return chain(res, (r) => pure(f(r)) as Managed<E, A>);
}

/**
 * Curried form of mapWith
 * @param f 
 */
export function mapWith<L, A>(f: FunctionN<[L], A>): <E>(res: Managed<E, L>) => Managed<E, A> {
    return<E>(res: Managed<E, L>) => map(res, f);
}

/**
 * Zip two resources together with the given function.
 * 
 * The scope of resa will enclose the scope of resb
 * @param resa 
 * @param resb 
 * @param f 
 */
export function zipWith<E, A, B, C>(resa: Managed<E, A>,
    resb: Managed<E, B>,
    f: FunctionN<[A, B], C>): Managed<E, C> {
    return chain(resa, (a) => map(resb, (b) => f(a, b)));
}

/**
 * Zip two resources together as a tuple.
 * 
 * The scope of resa will enclose the scope of resb
 * @param resa 
 * @param resb 
 */
export function zip<E, A, B>(resa: Managed<E, A>, resb: Managed<E, B>): Managed<E, readonly [A, B]> {
    return zipWith(resa, resb, (a, b) => [a, b] as const);
}

/**
 * Apply the function produced by resfab to the value produced by resa to produce a new resource.
 * @param resa 
 * @param resfab 
 */
export function ap<E, A, B>(resa: Managed<E, A>, resfab: Managed<E, FunctionN<[A], B>>): Managed<E, B> {
    return zipWith(resa, resfab, (a, f) => f(a));
}

/**
 * Flipped version of ap
 * @param resfab 
 * @param resa 
 */
export function ap_<E, A, B>(resfab: Managed<E, FunctionN<[A], B>>, resa: Managed<E, A>): Managed<E, B> {
    return zipWith(resfab, resa, (f, a) => f(a));
}

/**
 * Map a resource to a static value
 * 
 * This creates a resource of the provided constant b where the produced A has the same lifetime internally
 * @param fa 
 * @param b 
 */
export function as<E, A, B>(fa: Managed<E, A>, b: B): Managed<E, B> {
    return map(fa, constant(b));
}


/**
 * Curried form of as
 * @param b 
 */
export function to<B>(b: B): <E, A>(fa: Managed<E, A>) => Managed<E, B> {
    return (fa) => as(fa, b);
}

/**
 * Construct a new 'hidden' resource using the produced A with a nested lifetime
 * Useful for performing initialization and cleanup that clients don't need to see
 * @param left 
 * @param bind 
 */
export function chainTap<E, A>(left: Managed<E, A>, bind: FunctionN<[A], Managed<E, unknown>>): Managed<E, A> {
    return chain(left, (a) => as(bind(a), a));
}

/**
 * Curried form of chainTap
 * @param bind 
 */
export function chainTapWith<E, A>(bind: FunctionN<[A], Managed<E, unknown>>): FunctionN<[Managed<E, A>], Managed<E, A>> {
    return (inner) => chainTap(inner, bind);
}


/**
 * Curried data last form of use
 * @param f 
 */
export function consume<E, A, B>(f: FunctionN<[A], RIO<E, B>>): FunctionN<[Managed<E, A>], RIO<E, B>> {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return (r) => use(r, f);
}

/**
 * Create a Resource from the fiber of an IO.
 * The acquisition of this resource corresponds to forking rio into a fiber.
 * The destruction of the resource is interrupting said fiber.
 * @param rio 
 */
export function fiber<E, A>(rio: RIO<E, A>): Managed<never, Fiber<E, A>> {
    return bracket(io.fork(rio), (fiber) => fiber.interrupt as RIO<never, void>);
}

/**
 * Use a resource to produce a program that can be run.s
 * @param res 
 * @param f 
 */
export function use<E, A, B>(res: Managed<E, A>, f: FunctionN<[A], RIO<E, B>>): RIO<E, B> {
    switch (res._tag) {
        case ManagedTag.Pure:
            return f(res.value);
        case ManagedTag.Encase:
            return io.chain(res.acquire, f);
        case ManagedTag.Bracket:
            return io.bracket(res.acquire, res.release, f);
        case ManagedTag.Suspended:
            return io.chain(res.suspended, consume(f));
        case ManagedTag.Chain:
            return use(res.left, (a) => use(res.bind(a), f));
        default:
            throw new Error(`Die: Unrecognized current type ${res}`);
    }
}

export const URI = "Resource";
export type URI = typeof URI;

declare module "fp-ts/lib/HKT" {
    interface URItoKind2<E, A> {
        Resource: Managed<E, A>;
    }
}
export const instances: Monad2<URI> = {
    URI,
    of: <E, A>(a: A) => pure(a),
    map,
    ap: ap_,
    chain
} as const;

export function getSemigroup<E, A>(Semigroup: Semigroup<A>): Semigroup<Managed<E, A>> {
    return {
        concat(x: Managed<E, A>, y: Managed<E, A>): Managed<E, A> {
            return zipWith(x, y, Semigroup.concat)
        }
    };
}

export function getMonoid<E, A>(Monoid: Monoid<A>): Monoid<Managed<E, A>> {
    return {
        ...getSemigroup(Monoid),
        empty: pure(Monoid.empty)
    }
}
