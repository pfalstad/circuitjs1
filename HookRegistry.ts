/*
    Copyright (C) Paul Falstad

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

// Neutral registry for cross-module hooks that would otherwise create circular imports.
// This module has no imports, so it is safe to import from anywhere.

export const HookRegistry = {
    undumpSubcircuitModel:        null as ((xml: any) => void) | null,
    loadSubcircuitModelsFromStorage: null as (() => void) | null,
    clearSubcircuitModelDumpedFlags: null as (() => void) | null,
    createScopePropertiesDialog: null as ((app: any, scope: any) => any) | null,
    scopeNextHighestScale:       null as ((d: number) => number) | null,
    getCircuitAsComposite:       null as ((sim: any) => any) | null,
    createSubcircuitElm:    null as ((x: number, y: number, name: string) => any) | null,
    createJSInterface:           null as ((app: any) => any) | null,
    resetGroundNodeList:         null as (() => void) | null,
    resetLabeledNodeList:        null as (() => void) | null,
};
