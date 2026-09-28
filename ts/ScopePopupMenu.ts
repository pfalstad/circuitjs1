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

import { CirSim } from "./CirSim";
import { CheckItem, MenuItem } from "./Menus";
import { Locale } from "./Locale";

export class ScopePopupMenu {

    private ul: HTMLUListElement;
    private maxScaleItem: CheckItem;
    private stackItem: MenuItem;
    private unstackItem: MenuItem;
    private combineItem: MenuItem;
    private dockItem: MenuItem;
    private undockItem: MenuItem;

    constructor(app?: CirSim) {
        this.ul = document.createElement('ul');

        const addPlain = (label: string, cmdName: string): MenuItem => {
            const item = new MenuItem();
            const li = document.createElement('li');
            li.className = 'menuItem';
            li.innerHTML = `<span class="checkMark" style="visibility:hidden">&#10003;</span> ${Locale.LS(label)}`;
            li.addEventListener('click', e => {
                if (li.classList.contains('menuItemDisabled')) return;
                e.stopPropagation();
                if (app) app.commands.menuPerformed('scopepop', cmdName);
            });
            item._li = li;
            this.ul.appendChild(li);
            return item;
        };

        addPlain("Remove Scope", "remove");
        this.dockItem   = addPlain("Dock Scope",   "dock");
        this.undockItem = addPlain("Undock Scope",  "undock");

        // maxScaleItem has a visible checkmark
        this.maxScaleItem = new CheckItem(false);
        const maxLi = document.createElement('li');
        maxLi.className = 'menuItem';
        maxLi.innerHTML = `<span class="checkMark" style="visibility:hidden">&#10003;</span> ${Locale.LS("Max Scale")}`;
        this.maxScaleItem._li = maxLi;
        maxLi.addEventListener('click', e => {
            e.stopPropagation();
            if (app) app.commands.menuPerformed('scopepop', 'maxscale');
        });
        this.ul.appendChild(maxLi);

        this.stackItem   = addPlain("Stack",        "stack");
        this.unstackItem = addPlain("Unstack",       "unstack");
        this.combineItem = addPlain("Combine",       "combine");
        addPlain("Remove Plot",   "removeplot");
        addPlain("Reset",         "reset");
        addPlain("Export CSV...", "exportcsv");
        addPlain("Export as PNG...", "exportpng");
        addPlain("Export as SVG...", "exportsvg");
        addPlain("Properties...", "properties");
    }

    doScopePopupChecks(floating: boolean, canstack: boolean, cancombine: boolean, canunstack: boolean, s: any): void {
        this.maxScaleItem.setState(s.maxScale);
        setLiVisible(this.stackItem._li,   !floating);
        this.stackItem.setEnabled(canstack);
        setLiVisible(this.unstackItem._li,  !floating);
        this.unstackItem.setEnabled(canunstack);
        setLiVisible(this.combineItem._li,  !floating);
        this.combineItem.setEnabled(cancombine);
        setLiVisible(this.dockItem._li,    floating);
        setLiVisible(this.undockItem._li,  !floating);
    }

    getMenuBar(): HTMLElement { return this.ul; }
}

function setLiVisible(li: HTMLLIElement | null, visible: boolean): void {
    if (li) li.style.display = visible ? '' : 'none';
}
