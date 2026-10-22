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

export class Checkbox {
    name: string;
    state: boolean;
    element: HTMLInputElement | null = null;
    constructor(name: string, state: boolean) { this.name = name; this.state = state; }
    getState(): boolean { return this.element ? this.element.checked : this.state; }
    setState(s: boolean): void { this.state = s; if (this.element) this.element.checked = s; }
}
