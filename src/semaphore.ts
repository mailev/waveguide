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

import * as e from "fp-ts/lib/Either";
import { Either, left, right } from "fp-ts/lib/Either";
import { constant, identity, not } from "fp-ts/lib/function";
import * as o from "fp-ts/lib/Option";
import { pipe } from "fp-ts/lib/pipeable";
import { Deferred, makeDeferred } from "./deferred";
import * as io from "./wave";
import { RIO } from "./wave";
import { makeRef, Ref } from "./ref";
import { Dequeue, empty } from "./support/dequeue";
import { makeTicket, Ticket, ticketExit, ticketUse } from "./ticket";

export interface Semaphore {
    readonly acquire: RIO<never, void>;
    readonly release: RIO<never, void>;
    readonly available: RIO<never, number>;

    acquireN(n: number): RIO<never, void>;
    releaseN(n: number): RIO<never, void>;
    withPermitsN<E, A>(n: number, io: RIO<E, A>): RIO<E, A>;
    withPermit<E, A>(n: RIO<E, A>): RIO<E, A>;
}

type Reservation = readonly [number, Deferred<never, void>];
type State = Either<Dequeue<Reservation>, number>;

const isReservationFor = (latch: Deferred<never, void>) => (rsv: readonly [number, Deferred<never, void>]): boolean =>
    rsv[1] === latch;

function sanityCheck(n: number): RIO<never, void> {
    if (n < 0) {
        return io.raiseAbort(new Error("Die: semaphore permits must be non negative"));
    }
    if (Math.round(n) !== n) {
        return io.raiseAbort(new Error("Die: semaphore permits may not be fractional"));
    }
    return io.unit;
}

function makeSemaphoreImpl(ref: Ref<State>): Semaphore {
    const releaseN = <E = never>(n: number): RIO<E, void> =>
        io.applySecond(
            sanityCheck(n),
            io.uninterruptible(
                n === 0 ? io.unit :
                    io.flatten(ref.modify(
                        (current) =>
                            pipe(
                                current,
                                e.fold(
                                    (waiting) =>
                                        pipe(
                                            waiting.take(),
                                            o.fold(
                                                () => [io.unit, right(n) as State] as const,
                                                ([[needed, latch], q]) => n >= needed ?
                                                    [
                                                        io.applyFirst(latch.done(undefined), n > needed ? releaseN(n - needed) : io.unit),
                                                        left(q) as State
                                                    ] as const :
                                                    [
                                                        io.unit,
                                                        left(q.push([needed - n, latch] as const)) as State
                                                    ] as const
                                            )
                                        ),
                                    (ready) => [io.unit, right(ready + n) as State] as const
                                )
                            )
                    ))
            ));


    const cancelWait = (n: number, latch: Deferred<never, void>): RIO<never, void> =>
        io.uninterruptible(io.flatten(
            ref.modify(
                (current) =>
                    pipe(
                        current,
                        e.fold(
                            (waiting) =>
                                pipe(
                                    waiting.find(isReservationFor(latch)),
                                    o.fold(
                                        () => [releaseN(n), left(waiting) as State] as const,
                                        ([pending]) => [
                                            releaseN(n - pending),
                                            left(waiting.filter(not(isReservationFor(latch)))) as State
                                        ] as const
                                    )
                                ),
                            (ready) => [io.unit, right(ready + n) as State] as const
                        )
                    )
            )
        ));

    const ticketN = (n: number): RIO<never, Ticket<void>> =>
        io.chain(makeDeferred<never, void>(),
            (latch) =>
                ref.modify(
                    (current) =>
                        pipe(
                            current,
                            e.fold(
                                (waiting) => [
                                    makeTicket(latch.wait, cancelWait(n, latch)),
                                    left(waiting.offer([n, latch] as const)) as State
                                ] as const,
                                (ready) => ready >= n ?
                                    [
                                        makeTicket(io.unit, releaseN(n)),
                                        right(ready - n) as State
                                    ] as const :
                                    [
                                        makeTicket(latch.wait, cancelWait(n, latch)),
                                        left(empty().offer([n - ready, latch] as const)) as State
                                    ] as const
                            )
                        )
                )
        );

    const acquireN = <E = never>(n: number): RIO<E, void> =>
        io.applySecond(
            sanityCheck(n),
            n === 0 ? 
                io.unit : 
                io.bracketExit(ticketN(n), ticketExit, ticketUse)
        );

    const withPermitsN = <E, A>(n: number, inner: RIO<E, A>): RIO<E, A> => {
        const acquire = io.interruptible(acquireN<E>(n)) as RIO<E, void>;
        const release = releaseN(n) as RIO<E, void>;
        return io.bracket(acquire, constant(release), () => inner);
    }

    const available = io.map(ref.get, e.fold((q) => -1 * q.size(), identity));

    return {
        acquireN,
        acquire: acquireN(1),
        releaseN,
        release: releaseN(1),
        withPermitsN,
        withPermit: (inner) => withPermitsN(1, inner),
        available
    };
}

/**
 * Allocate a semaphore.
 *
 * @param n the number of permits
 * This must be non-negative
 */
export function makeSemaphore(n: number): RIO<never, Semaphore> {
    return io.applySecond(
        sanityCheck(n),
        io.map(makeRef(right(n) as State), makeSemaphoreImpl)
    );
}
