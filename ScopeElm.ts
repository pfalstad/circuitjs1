/*
    Copyright (C) Paul Falstad and Iain Sharp

    This file is part of CircuitJS1.

    CircuitJS1 is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    CircuitJS1 is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with CircuitJS1.  If not, see <http://www.gnu.org/licenses/>.
*/

// Stub — to be implemented from ScopeElm.java
// Note: will extend CircuitElm when fully implemented; left as standalone stub
// to avoid circular imports during translation.
import { Scope } from "./Scope";

export class ScopeElm {
    elmScope: Scope | null = null;
    isScopeElm(): boolean { return true; }
    stepScope(): void {
        if (this.elmScope !== null)
            this.elmScope.timeStep();
    }
}
