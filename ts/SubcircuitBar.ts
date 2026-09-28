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
import { UIManager } from "./UIManager";
import { Locale } from "./Locale";
import { SubcircuitModel } from "./SubcircuitModel";
import { EditSubcircuitModelDialog } from "./EditSubcircuitModelDialog";

export class SubcircuitBar {
    element: HTMLElement;
    private subcircuitLabel: HTMLElement;
    private backButton: HTMLButtonElement;
    private contextLabel: HTMLElement;
    private contextSaveButton: HTMLButtonElement;
    private contextSaveCopyButton: HTMLButtonElement;

    private hasSubcircuit: boolean = false;
    private hasContext: boolean = false;

    constructor() {
        this.element = document.createElement('div');
        this.element.className = 'subcircuitBar';
        const style = this.element.style;
        style.background = 'rgba(248,248,248,0.85)';
        style.position = 'absolute';
        // no z-index so menu popups (added later in DOM) stack above us
        style.padding = '4px';
        style.paddingLeft = '8px';
        style.paddingRight = '8px';
        style.borderBottom = '1px solid #ccc';
        style.pointerEvents = 'auto';
        style.boxSizing = 'border-box';
        style.whiteSpace = 'nowrap';
        // start hidden
        style.display = 'none';

        // Subcircuit path label
        this.subcircuitLabel = document.createElement('span');
        this.styleLabel(this.subcircuitLabel);
        this.subcircuitLabel.style.display = 'none';
        this.element.appendChild(this.subcircuitLabel);

        // Context editing label
        this.contextLabel = document.createElement('span');
        this.styleLabel(this.contextLabel);
        this.contextLabel.style.display = 'none';
        this.element.appendChild(this.contextLabel);

        // Back button (serves both subcircuit back and context back)
        this.backButton = this.createButton("◀ Back", () => {
            const app = CirSim.theApp;
            if (UIManager.theUI.subcircuitStack.length > 0)
                UIManager.theUI.popSubcircuit();
            else
                app.popContext();
        });
        this.backButton.style.display = 'none';
        this.element.appendChild(this.backButton);

        // Context Save button
        this.contextSaveButton = this.createButton("Save", () => {
            const app = CirSim.theApp;
            const modelName = app.getEditingModelName();
            const dlg = new EditSubcircuitModelDialog();
            if (!dlg.createModel())
                return;
            // Look up existing model before setName() inserts the new one under the same key
            const existingModel = SubcircuitModel.getModelWithName(modelName);
            dlg.model.setName(modelName);
            if (existingModel !== null)
                EditSubcircuitModelDialog.preservePinLayout(dlg.model, existingModel);
            dlg.popContext = true;
            dlg.createDialog();
            CirSim.dialogShowing = dlg;
            dlg.show();
        });
        this.contextSaveButton.style.display = 'none';
        this.element.appendChild(this.contextSaveButton);

        // Context Save Copy button
        this.contextSaveCopyButton = this.createButton("Save Copy", () => {
            const app = CirSim.theApp;
            const modelName = app.getEditingModelName();
            const dlg = new EditSubcircuitModelDialog();
            if (!dlg.createModel())
                return;
            const existingModel = SubcircuitModel.getModelWithName(modelName);
            if (existingModel !== null)
                EditSubcircuitModelDialog.preservePinLayout(dlg.model, existingModel);
            dlg.popContext = true;
            dlg.createDialog();
            CirSim.dialogShowing = dlg;
            dlg.show();
        });
        this.contextSaveCopyButton.style.display = 'none';
        this.element.appendChild(this.contextSaveCopyButton);
    }

    private styleLabel(el: HTMLElement): void {
        el.style.fontSize = '14px';
        el.style.color = '#333';
        el.style.paddingRight = '10px';
    }

    private createButton(text: string, handler: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.textContent = Locale.LS(text);
        btn.addEventListener('click', handler);
        btn.style.marginLeft = '5px';
        btn.style.marginRight = '5px';
        return btn;
    }

    setSubcircuitPath(path: string | null): void {
        this.hasSubcircuit = path !== null;
        this.subcircuitLabel.style.display = this.hasSubcircuit ? '' : 'none';
        if (this.hasSubcircuit)
            this.subcircuitLabel.textContent = path;
        this.updateVisibility();
    }

    setContextInfo(modelName: string | null): void {
        this.hasContext = modelName !== null;
        this.contextLabel.style.display = this.hasContext ? '' : 'none';
        this.contextSaveButton.style.display = this.hasContext ? '' : 'none';
        this.contextSaveCopyButton.style.display = this.hasContext ? '' : 'none';
        if (this.hasContext)
            this.contextLabel.textContent = Locale.LS("Editing: ") + modelName;
        this.updateVisibility();
    }

    private updateVisibility(): void {
        const show = this.hasSubcircuit || this.hasContext;
        // Use display style directly to avoid overriding it
        this.element.style.display = show ? 'block' : 'none';
        this.backButton.style.display = show ? '' : 'none';
    }

    updatePosition(left: number, top: number, width: number): void {
        this.element.style.left = left + 'px';
        this.element.style.top = top + 'px';
        this.element.style.width = width + 'px';
    }
}
