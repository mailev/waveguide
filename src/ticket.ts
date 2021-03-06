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

import { Exit, ExitTag } from "./exit";
import { Wave, unit } from "./wave";

export function ticketExit<A>(ticket: Ticket<A>, exit: Exit<never, A>): Wave<never, void> {
  if (exit._tag === ExitTag.Interrupt) {
    return ticket.cleanup;
  }
  return unit;
}

export function ticketUse<A>(ticket: Ticket<A>): Wave<never, A> {
  return ticket.acquire;
}

export interface Ticket<A> {
    readonly acquire: Wave<never, A>;
    readonly cleanup: Wave<never, void>;
}

export function makeTicket<A>(acquire: Wave<never, A>, cleanup: Wave<never, void>): Ticket<A> {
  return {
    acquire,
    cleanup
  };
}
