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
import { Trampoline } from "../src/trampoline";

describe("trampoline", () => {
  it("should invoke dispatches immediately", () => {
    const t = new Trampoline();
    let n = 1;
    t.dispatch(() => n++);
    expect(n).to.equal(2);
    expect(t.isRunning()).to.equal(false);
  });
  it("should trampoline dispatches that occur while running", () => {
    const t = new Trampoline();
    let n = 1;
    t.dispatch(() => {
      n++;
      t.dispatch(() => {
        n *= 2;
      });
      n--;
    });
    expect(n).to.equal(2);
  });
});