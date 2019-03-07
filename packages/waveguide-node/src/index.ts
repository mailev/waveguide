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

import { IO } from "waveguide";

export function main(io: IO<never, number>): void {
  const interrupt = io.launch((result) => {
    if (result._tag === "interrupted") {
      process.exit(0);
    } else {
      if (result._tag === "value") {
        process.exit(result.value);
      } else {
        process.exit(-1);
      }
    }
  });
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  process.on("uncaughtException", (e) => {
    // tslint:disable-next-line
    console.error("uncaught exception: ", e);
    interrupt();
  });
}
