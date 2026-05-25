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

import { Scope } from "./Scope";
import type { ScopeElm } from "./ScopeElm";
import { ScopePopupMenu } from "./ScopePopupMenu";
import { CircuitElm } from "./CircuitElm";
import { CirSim } from "./CirSim";
import { Graphics } from "./Graphics";
import { Color } from "./Color";
import { Rectangle } from "./Rectangle";

export class ScopeManager {

    sim: CirSim;

    scopes: Scope[];
    scopeCount: number;
    hoverScope: Scope | null;
    scopeColCount: number[];
    scopeSelected: number = -1;
    scopeMenuSelected: number = -1;
    menuScope: number = -1;
    menuPlot: number = -1;
    scopeHeightFraction: number = 0.2;
    oldScopeCount: number = -1;
    scopePopupMenu: ScopePopupMenu | null = null;

    // GWT MenuBar/MenuItem skipped; init() and composeSelectScopeMenu() are stubs.
    selectScopeMenuBar: any = null;

    constructor(sim?: CirSim) {
        this.sim = sim as CirSim;
        this.scopes = new Array(20);
        this.scopeColCount = new Array(20).fill(0);
        this.scopeCount = 0;
        this.hoverScope = null;
        this.init();
    }

    init(): void {
        // GWT MenuBar/DOM browser event handling skipped
        this.scopePopupMenu = new ScopePopupMenu(this.sim);
    }

    composeSelectScopeMenu(sb: any): void {
        // GWT MenuBar/MenuItem/SafeHtml skipped — no-op
    }

    scopeMenuIsSelected(s: Scope): boolean {
        if (this.scopeMenuSelected < 0)
            return false;
        if (this.scopeMenuSelected < this.scopeCount)
            return this.scopes[this.scopeMenuSelected] === s;
        return this.getNthScopeElm(this.scopeMenuSelected - this.scopeCount)?.elmScope === s;
    }

    timeStep(): void {
        let i;
        for (i = 0; i !== this.scopeCount; i++)
            this.scopes[i].timeStep();
        const scopeElmArr = this.sim.scopeElmArr;
        if (scopeElmArr !== null) {
            for (i = 0; i !== scopeElmArr.length; i++)
                scopeElmArr[i].stepScope();
        }
        if (this.hoverScope !== null)
            this.hoverScope.timeStep();
    }

    drawHoverScope(g: Graphics, canvasWidth: number, canvasHeight: number): void {
        const mouseElm = this.sim.mouse.getMouseElm();
        if (mouseElm === null || mouseElm.isWireEquivalent() || mouseElm.isSwitchElm()) {
            this.hoverScope = null;
            return;
        }
        if (this.hoverScope === null || this.hoverScope.getElm() !== mouseElm) {
            this.hoverScope = null;
            if (!mouseElm.canViewInScope())
                return;
            for (let i = 0; i < this.scopeCount; i++)
                if (this.scopes[i].showingElm(mouseElm))
                    return;
            const scopeElmArr = this.sim.scopeElmArr;
            if (scopeElmArr !== null) {
                for (let i = 0; i < scopeElmArr.length; i++)
                    if (scopeElmArr[i].elmScope !== null && scopeElmArr[i].elmScope.showingElm(mouseElm))
                        return;
            }
            this.hoverScope = new Scope(this.sim, this.sim.sim);
            this.hoverScope.setElm(mouseElm);
            this.hoverScope.showMax = true;
            this.hoverScope.showRMS = true;
            if (this.scopeCount > 0)
                this.hoverScope.speed = this.scopes[this.scopeCount - 1].speed;
        }
        const w = CirSim.infoWidth * 2;
        const h0 = Math.trunc(canvasHeight * this.scopeHeightFraction);
        const h = h0;
        const y = canvasHeight - h0 - h;
        if (y < 0)
            return;
        if (canvasWidth < w)
            return;
        const scopeRect = new Rectangle(canvasWidth - w, y, w, h);
        for (const ce of this.sim.elmList) {
            const bb = (ce as CircuitElm).getBoundingBox();
            const ex1 = this.sim.mouse.transformX(bb.x);
            const ey1 = this.sim.mouse.transformY(bb.y);
            const ex2 = this.sim.mouse.transformX(bb.x + bb.width);
            const ey2 = this.sim.mouse.transformY(bb.y + bb.height);
            const elmRect = new Rectangle(Math.min(ex1, ex2), Math.min(ey1, ey2),
                    Math.abs(ex2 - ex1) + 1, Math.abs(ey2 - ey1) + 1);
            if (scopeRect.intersects(elmRect))
                return;
        }
        this.hoverScope.setRect(scopeRect);
        g.setColor(this.sim.menus.printableCheckItem.getState() ? Color.white : Color.black);
        g.fillRect(canvasWidth - w, y, w, h);
        this.hoverScope.draw(g);
    }

    setupScopes(): void {
        let i;

        // check scopes to make sure the elements still exist, and remove
        // unused scopes/columns
        let pos = -1;
        for (i = 0; i < this.scopeCount; i++) {
            if (this.scopes[i].needToRemove()) {
                let j;
                for (j = i; j !== this.scopeCount; j++)
                    this.scopes[j] = this.scopes[j + 1];
                this.scopeCount--;
                i--;
                continue;
            }
            if (this.scopes[i].position > pos + 1)
                this.scopes[i].position = pos + 1;
            pos = this.scopes[i].position;
        }
        while (this.scopeCount > 0 && this.scopes[this.scopeCount - 1].getElm() === null)
            this.scopeCount--;
        const ui = this.sim.ui;
        const h = ui.canvasHeight - this.sim.circuitArea.height;
        pos = 0;
        for (i = 0; i !== this.scopeCount; i++)
            this.scopeColCount[i] = 0;
        for (i = 0; i !== this.scopeCount; i++) {
            pos = ScopeManager.max(this.scopes[i].position, pos);
            this.scopeColCount[this.scopes[i].position]++;
        }
        const colct = pos + 1;
        let iw = CirSim.infoWidth;
        if (colct <= 2)
            iw = Math.trunc(iw * 3 / 2);
        let w = Math.trunc((ui.canvasWidth - iw) / colct);
        const marg = 10;
        if (w < marg * 2)
            w = marg * 2;
        pos = -1;
        let colh = 0;
        let row = 0;
        let speed = 0;
        for (i = 0; i !== this.scopeCount; i++) {
            const s = this.scopes[i];
            if (s.position > pos) {
                pos = s.position;
                colh = Math.trunc(h / this.scopeColCount[pos]);
                row = 0;
                speed = s.speed;
            }
            s.stackCount = this.scopeColCount[pos];
            if (s.speed !== speed) {
                s.speed = speed;
                s.resetGraph();
            }
            const r = new Rectangle(pos * w, ui.canvasHeight - h + colh * row, w - marg, colh);
            row++;
            if (!r.equals(s.rect))
                s.setRect(r);
        }
        if (this.oldScopeCount !== this.scopeCount) {
            ui.setCircuitArea();
            this.oldScopeCount = this.scopeCount;
        }
    }

    // we need to calculate wire currents for every iteration if someone is viewing a wire in the
    // scope.  Otherwise we can do it only once per frame.
    canDelayWireProcessing(): boolean {
        let i;
        for (i = 0; i !== this.scopeCount; i++)
            if (this.scopes[i].viewingWire())
                return false;
        for (const ce of this.sim.elmList)
            if ((ce as CircuitElm).isScopeElm() && (ce as any).elmScope !== null && (ce as any).elmScope.viewingWire())
                return false;
        return true;
    }

    countScopeElms(): number {
        let c = 0;
        for (let i = 0; i !== this.sim.elmList.length; i++) {
            if ((this.sim.elmList[i] as CircuitElm).isScopeElm())
                c++;
        }
        return c;
    }

    getNthScopeElm(n: number): ScopeElm | null {
        for (let i = 0; i !== this.sim.elmList.length; i++) {
            if ((this.sim.elmList[i] as CircuitElm).isScopeElm()) {
                n--;
                if (n < 0)
                    return this.sim.elmList[i] as ScopeElm;
            }
        }
        return null;
    }

    canStackScope(s: number): boolean {
        if (this.scopeCount < 2)
            return false;
        if (s === 0)
            s = 1;
        if (this.scopes[s].position === this.scopes[s - 1].position)
            return false;
        return true;
    }

    canCombineScope(s: number): boolean {
        return this.scopeCount >= 2;
    }

    canUnstackScope(s: number): boolean {
        if (this.scopeCount < 2)
            return false;
        if (s === 0)
            s = 1;
        if (this.scopes[s].position !== this.scopes[s - 1].position) {
            if (s + 1 < this.scopeCount && this.scopes[s + 1].position === this.scopes[s].position) // Allow you to unstack by selecting the top scope in the stack
                return true;
            else
                return false;
        }
        return true;
    }

    stackScope(s: number): void {
        if (!this.canStackScope(s))
            return;
        if (s === 0) {
            s = 1;
        }
        this.scopes[s].position = this.scopes[s - 1].position;
        for (s++; s < this.scopeCount; s++)
            this.scopes[s].position--;
    }

    unstackScope(s: number): void {
        if (!this.canUnstackScope(s))
            return;
        if (s === 0) {
            s = 1;
        }
        if (this.scopes[s].position !== this.scopes[s - 1].position) // Allow you to unstack by selecting the top scope in the stack
            s++;
        for (; s < this.scopeCount; s++)
            this.scopes[s].position++;
    }

    combineScope(s: number): void {
        if (!this.canCombineScope(s))
            return;
        if (s === 0) {
            s = 1;
        }
        this.scopes[s - 1].combine(this.scopes[s]);
        this.scopes[s].setElm(null);
    }

    stackAll(): void {
        let i;
        for (i = 0; i !== this.scopeCount; i++) {
            this.scopes[i].position = 0;
            this.scopes[i].showMax = this.scopes[i].showMin = false;
        }
    }

    unstackAll(): void {
        let i;
        for (i = 0; i !== this.scopeCount; i++) {
            this.scopes[i].position = i;
            this.scopes[i].showMax = true;
        }
    }

    combineAll(): void {
        let i;
        for (i = this.scopeCount - 2; i >= 0; i--) {
            this.scopes[i].combine(this.scopes[i + 1]);
            this.scopes[i + 1].setElm(null);
        }
    }

    separateAll(): void {
        let i;
        const newscopes: Scope[] = new Array(20);
        let ct = 0;
        for (i = 0; i < this.scopeCount; i++)
            ct = this.scopes[i].separate(newscopes, ct);
        this.scopes = newscopes;
        this.scopeCount = ct;
    }

    deleteUnusedScopeElms(): void {
        // Remove any scopeElms for elements that no longer exist
        for (let i = this.sim.elmList.length - 1; i >= 0; i--) {
            const ce = this.sim.elmList[i] as CircuitElm;
            if (ce.isScopeElm() && (ce as any).elmScope !== null && (ce as any).elmScope.needToRemove()) {
                ce.delete();
                this.sim.elmList.splice(i, 1);

                // need to rebuild scopeElmArr
                this.sim.needAnalyze();
            }
        }
    }

    addScope(sc: Scope): void {
        if (sc.position < 0)
            sc.position = this.scopeCount;
        this.scopes[this.scopeCount++] = sc;
    }

    clearScopes(): void {
        this.scopeCount = 0;
    }

    resetGraphs(): void {
        for (let i = 0; i !== this.scopeCount; i++)
            this.scopes[i].resetGraphFull(true);
    }

    static max(a: number, b: number): number { return (a > b) ? a : b; }
}
