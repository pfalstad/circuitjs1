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
import { MyCommand } from "./MyCommand";

export class Toolbar {
    element: HTMLElement;
    private modeLabel: HTMLElement;
    private highlightableButtons: Map<string, HTMLElement> = new Map();
    private activeButton: HTMLElement | null = null;
    resistorButton: HTMLElement;

    constructor() {
        this.element = document.createElement('div');
        const style = this.element.style;
        style.padding = '2px';
        style.backgroundColor = '#f8f8f8';
        style.borderWidth = '1px';
        style.borderStyle = 'solid';
        style.borderColor = '#ccc';
        style.display = 'flex';
        style.alignItems = 'center';
        style.flexWrap = 'nowrap';
        style.overflow = 'hidden';
        style.boxSizing = 'border-box';

        this.element.appendChild(this.createIconButton("reply",   "Undo", new MyCommand("edit", "undo")));
        this.element.appendChild(this.createIconButton("forward", "Redo", new MyCommand("edit", "redo")));
        this.element.appendChild(this.createIconButton("scissors", "Cut", new MyCommand("edit", "cut")));
        this.element.appendChild(this.createIconButton("copy", "Copy", new MyCommand("edit", "copy")));
        this.element.appendChild(this.createIconButton("paste", "Paste", new MyCommand("edit", "paste")));
        this.element.appendChild(this.createIconButton("clone", "Duplicate", new MyCommand("edit", "duplicate")));
        this.element.appendChild(this.createIconButton("search", "Find Component...", new MyCommand("edit", "search")));

        this.element.appendChild(this.createIconButton("zoom-11", "Zoom 100%", new MyCommand("zoom", "zoom100")));
        this.element.appendChild(this.createIconButton("zoom-in", "Zoom In", new MyCommand("zoom", "zoomin")));
        this.element.appendChild(this.createIconButton("zoom-out", "Zoom Out", new MyCommand("zoom", "zoomout")));

        this.element.appendChild(this.createIconButtonForClass(this.wireIcon, "WireElm"));
        this.resistorButton = this.createIconButtonForClass(this.resistorIcon, "ResistorElm");
        this.element.appendChild(this.resistorButton);
        this.element.appendChild(this.createIconButtonForClass(this.groundIcon, "GroundElm"));
        this.element.appendChild(this.createIconButtonForClass(this.capacitorIcon, "CapacitorElm"));
        this.element.appendChild(this.createIconButtonForClass(this.inductIcon, "InductorElm"));
        this.element.appendChild(this.createIconButtonForClass(this.diodeIcon, "DiodeElm"));
        const srcInfo = [this.voltage2Icon, "DCVoltageElm", this.acSrcIcon, "ACVoltageElm"];
        this.element.appendChild(this.createButtonSet(srcInfo));
        this.element.appendChild(this.createIconButtonForClass(this.railIcon, "RailElm"));

        const switchInfo = [this.switchIcon, "SwitchElm", this.spdtIcon, "Switch2Elm", this.aswitch1Icon, "AnalogSwitchElm",
                            this.aswitch2Icon, "AnalogSwitch2Elm"];
        this.element.appendChild(this.createButtonSet(switchInfo));

        const opAmpInfo = [this.opAmpBotIcon, "OpAmpElm", this.opAmpTopIcon, "OpAmpSwapElm"];
        this.element.appendChild(this.createButtonSet(opAmpInfo));

        const transistorInfo = [this.transistorIcon, "NTransistorElm", this.pnpTransistorIcon, "PTransistorElm"];
        this.element.appendChild(this.createButtonSet(transistorInfo));

        const fetInfo = [this.fetIcon, "NMosfetElm", this.fetIcon2, "PMosfetElm"];
        this.element.appendChild(this.createButtonSet(fetInfo));

        this.element.appendChild(this.createIconButtonForClass(this.inverterIcon, "InverterElm"));
        const gateInfo = [this.andIcon, "AndGateElm", this.nandIcon, "NandGateElm",
                          this.orIcon, "OrGateElm", this.norIcon, "NorGateElm", this.xorIcon, "XorGateElm",
                          this.xnorIcon, "XnorGateElm"];
        this.element.appendChild(this.createButtonSet(gateInfo));

        // Create and add the mode label
        this.modeLabel = document.createElement('span');
        this.styleModeLabel(this.modeLabel);
        this.element.appendChild(this.modeLabel);
    }

    setModeLabel(text: string): void { this.modeLabel.textContent = text; }

    private createIconButtonForClass(icon: string, cls: string): HTMLElement {
        const app = CirSim.theApp;
        return this.createIconButton(icon, app.getLabelTextForClass(cls) ?? cls, new MyCommand("main", cls));
    }

    private createIconButton(iconClass: string, tooltip: string, command: MyCommand): HTMLElement {
        // Create a span to hold the icon
        const iconLabel = document.createElement('span');
        if (iconClass.startsWith("<svg"))
            iconLabel.innerHTML = this.makeSvg(iconClass, 24);
        else
            iconLabel.classList.add("cirjsicon-" + iconClass);
        iconLabel.title = Locale.LS(tooltip);

        // Style the icon button
        const style = iconLabel.style;
        style.fontSize = '24px';
        style.color = '#333';
        style.padding = '1px';
        style.marginRight = '5px';
        style.cursor = 'pointer';
        if (iconClass.startsWith("<svg"))
            style.paddingTop = '5px';
        style.touchAction = 'none';

        // Add hover effect for the button
        iconLabel.addEventListener('mouseover', () => iconLabel.style.color = '#007bff');
        iconLabel.addEventListener('mouseout', () => iconLabel.style.color = '#333');

        // Add a click handler to perform the action
        iconLabel.addEventListener('click', () => {
            // un-highlight
            iconLabel.style.color = '#333';
            if (iconLabel === this.activeButton) {
                new MyCommand("main", "Select").execute();
                this.activeButton = null;
            } else
                command.execute();
        });

        // Track buttons that belong to the "main" command group
        if (command.getMenuName() === "main") {
            this.highlightableButtons.set(command.getItemName(), iconLabel);

            // pressing and dragging (rather than just clicking) drops a new element
            // where the mouse is released, instead of switching modes
            iconLabel.addEventListener('mousedown', (mde: MouseEvent) => {
                if (mde.button === 0)
                    UIManager.theUI.mouse.beginToolbarDrag(command.getItemName(), mde.clientX, mde.clientY);
            });
            this.addTouchDragSupport(iconLabel);

            // while hovering over an element-creation button, tell the user how to use it
            iconLabel.addEventListener('mouseover', () => {
                const label = CirSim.theApp.getLabelTextForClass(command.getItemName());
                if (label != null)
                    this.setModeLabel(label + Locale.LS(": Drag And Drop To Create"));
            });
            iconLabel.addEventListener('mouseout', () => UIManager.theUI.updateToolbar());
        }

        return iconLabel;
    }

    // Translate touch gestures on a toolbar button into the synthetic mouse events that
    // beginToolbarDrag/toolbarDragMove/toolbarDragEnd already expect, since iOS/touch browsers
    // don't emit real mousemove events during a touch-drag (they just pan the page instead).
    // touchstart re-dispatches a "mousedown" on the button itself, which the existing
    // mousedown handler picks up; touchmove/touchend dispatch "mousemove"/"mouseup" on the
    // document so the document-level listeners (which drive the drag once it's pending)
    // see them just like they would for a real mouse drag.
    private addTouchDragSupport(el: HTMLElement): void {
        let startX = 0, startY = 0, moved = false;
        const TAP_THRESHOLD = 6;
        el.addEventListener('touchstart', (e: TouchEvent) => {
            if (e.touches.length !== 1)
                return;
            const t = e.touches[0];
            startX = t.clientX;
            startY = t.clientY;
            moved = false;
            el.dispatchEvent(new MouseEvent('mousedown', { clientX: t.clientX, clientY: t.clientY, bubbles: true, cancelable: true, button: 0 }));
        }, { passive: true });
        el.addEventListener('touchmove', (e: TouchEvent) => {
            if (e.touches.length !== 1)
                return;
            e.preventDefault();
            const t = e.touches[0];
            const dx = t.clientX - startX, dy = t.clientY - startY;
            if (dx*dx + dy*dy > TAP_THRESHOLD*TAP_THRESHOLD)
                moved = true;
            document.dispatchEvent(new MouseEvent('mousemove', { clientX: t.clientX, clientY: t.clientY, bubbles: true, cancelable: true }));
        }, { passive: false });
        el.addEventListener('touchend', (e: TouchEvent) => {
            e.preventDefault();
            const t = e.changedTouches[0];
            document.dispatchEvent(new MouseEvent('mouseup', { clientX: t.clientX, clientY: t.clientY, bubbles: true, cancelable: true }));
            // preventDefault() suppressed the browser's own synthetic click for this tap,
            // so re-create it ourselves when the touch didn't turn into a drag.
            if (!moved)
                el.dispatchEvent(new MouseEvent('click', { clientX: t.clientX, clientY: t.clientY, bubbles: true, cancelable: true }));
        }, { passive: false });
        el.addEventListener('touchcancel', (e: TouchEvent) => {
            const t = e.changedTouches[0];
            document.dispatchEvent(new MouseEvent('mouseup', { clientX: t.clientX, clientY: t.clientY, bubbles: true, cancelable: true }));
        }, { passive: true });
    }

    makeSvg(s: string, size: number): string {
        const scale = size / 24.0;
        return "<svg xmlns='http://www.w3.org/2000/svg' width='" + size + "' height='" + size + "'><g transform='scale(" + scale + ")'>" +
                 s.substring(5, s.length - 5) + "<g></svg>";
    }

    // New method for creating variant buttons
    private createButtonSet(info: string[]): HTMLElement {
        const mainCommand = new MyCommand("main", info[1]);
        const app = CirSim.theApp;
        const iconLabel = this.createIconButton(info[0], app.getLabelTextForClass(info[1]) ?? info[1], mainCommand);

        const paletteContainer = document.createElement('div');
        paletteContainer.style.display = 'none';
        paletteContainer.className = 'palette-container';

        // Apply CSS styles for positioning and visibility
        const paletteStyle = paletteContainer.style;
        paletteStyle.position = 'absolute';
        paletteStyle.zIndex = '1000';
        paletteStyle.backgroundColor = '#ffffff';
        paletteStyle.borderWidth = '1px';
        paletteStyle.borderColor = '#ccc';
        paletteStyle.borderStyle = 'solid';
        paletteStyle.padding = '5px';
        paletteStyle.display = 'none';
        paletteStyle.flexDirection = 'column';

        for (let i = 0; i < info.length; i += 2) {
            // Create each variant button
            const variantButton = document.createElement('span');
            variantButton.innerHTML = this.makeSvg(info[i], 40);
            variantButton.title = app.getLabelTextForClass(info[i + 1]) ?? info[i + 1];

            // Style the variant button
            const variantStyle = variantButton.style;
            variantStyle.color = '#333';
            //variantStyle.padding = '5px';
            variantStyle.cursor = 'pointer';
            variantStyle.touchAction = 'none';

            const command = new MyCommand("main", info[i + 1]);
            const smallSvg = this.makeSvg(info[i], 24);

            // Change the icon of the main button to reflect the variant selected
            const selectVariant = () => {
                iconLabel.innerHTML = smallSvg;
                this.highlightableButtons.delete(mainCommand.getItemName());
                this.highlightableButtons.set(command.getItemName(), iconLabel);
                paletteContainer.style.display = 'none';
                mainCommand.setItemName(command.getItemName());
            };

            // Add click handler to update the main button and execute the command
            variantButton.addEventListener('click', () => {
                selectVariant();
                command.execute();  // Execute the corresponding command for the selected variant
            });

            // pressing and dragging (rather than just clicking) a variant drops that
            // variant directly, instead of switching modes
            variantButton.addEventListener('mousedown', (mde: MouseEvent) => {
                if (mde.button === 0) {
                    selectVariant();
                    UIManager.theUI.mouse.beginToolbarDrag(command.getItemName(), mde.clientX, mde.clientY);
                }
            });
            this.addTouchDragSupport(variantButton);

            // while hovering over a variant button, tell the user how to use it
            variantButton.addEventListener('mouseover', () => {
                const label = app.getLabelTextForClass(command.getItemName());
                if (label != null)
                    this.setModeLabel(label + Locale.LS(": Drag And Drop To Create"));
            });
            variantButton.addEventListener('mouseout', () => UIManager.theUI.updateToolbar());

            // Append the variant button to the palette container
            paletteContainer.appendChild(variantButton);
        }

        // Add the palette container to the document (or you could append it to the toolbar directly)
        document.body.appendChild(paletteContainer);

        // Show palette on mouse-over
        iconLabel.addEventListener('mouseover', () => {
            paletteContainer.style.display = 'flex';

            // Position the palette relative to the icon label
            const rect = iconLabel.getBoundingClientRect();
            const leftOffset = rect.left + window.scrollX - 12;
            const topOffset = rect.top + window.scrollY + iconLabel.offsetHeight - 2;
            paletteContainer.style.left = leftOffset + 'px';
            paletteContainer.style.top = topOffset + 'px';
        });

        // Hide palette on mouse-out
        iconLabel.addEventListener('mouseout', () => { paletteContainer.style.display = 'none'; });

        // Keep the palette visible when hovering over it
        paletteContainer.addEventListener('mouseover', () => paletteContainer.style.display = 'flex');
        paletteContainer.addEventListener('mouseout', () => { paletteContainer.style.display = 'none'; });

        return iconLabel;
    }

    private styleModeLabel(el: HTMLElement): void {
        el.style.fontSize = '16px';
        el.style.color = '#333';
        el.style.paddingRight = '10px';
        el.style.whiteSpace = 'nowrap';
    }

    highlightButton(key: string): void {
        // Deactivate the currently active button
        if (this.activeButton !== null) {
            this.activeButton.style.color = '#333';  // Reset color
            this.activeButton.style.backgroundColor = '';
        }

        // Activate the new button
        const newActiveButton = this.highlightableButtons.get(key) ?? null;
        if (newActiveButton !== null) {
            newActiveButton.style.color = '#007bff';  // Active color
            newActiveButton.style.backgroundColor = '#e6f7ff';
            this.activeButton = newActiveButton;
        }
    }

    setEuroResistors(euro: boolean): void {
        this.resistorButton.innerHTML = this.makeSvg(euro ? this.euroResistorIcon : this.resistorIcon, 24);
    }

    readonly wireIcon = "<svg><g transform='scale(0.208) translate(7.5, 32)'>" +
           "<line x1='5' y1='45' x2='95' y2='5' stroke='currentColor' stroke-width='8' /> " +
           "<circle cx='5' cy='45' r='10' fill='currentColor' /><circle cx='95' cy='5' r='10' fill='currentColor' /> " +
           "</g></svg>";

    readonly resistorIcon = "<svg> <g transform='scale(.5,.5) translate(-544,-297)'>" +
      "<path stroke='#000000' d=' M 544 320 L 552 320' stroke-width='3'/>" +
      "<path stroke='#000000' d=' M 584 320 L 592 320' stroke-width='3'/>" +
      "<g transform='matrix(1,0,0,1,552,320)'><path fill='none' stroke='currentColor' " +
      "d=' M 0 0 L 2 6 L 6 -6 L 10 6 L 14 -6 L 18 6 L 22 -6 L 26 6 L 30 -6 L 32 0' stroke-width='2'/> </g> </g> </svg>";
    readonly euroResistorIcon = "<svg><g transform='translate(97.71,-28.71) scale(0.428571)'><path fill='none' stroke='currentColor' d=' M -224 96 L -216 96' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M -184 96 L -176 96' stroke-linecap='round' stroke-width='3' /><g transform='matrix(1,0,0,1,-216,96)'><rect fill='none' stroke='currentColor' x='0' y='-6' width='32' height='12' stroke-linecap='round' stroke-width='3' /></g><path fill='currentColor' stroke='currentColor' d=' M -221 96 A 3 3 0 1 1 -221.00026077471009 95.96044522459944 Z' /><path fill='currentColor' stroke='currentColor' d=' M -173 96 A 3 3 0 1 1 -173.00026077471009 95.96044522459944 Z' /></g></svg>";

    readonly groundIcon = "<svg><defs /><g transform='scale(.6) translate(-826.46,-231.31) scale(1.230769)'><path fill='none' stroke='currentColor' d=' M 688 192 L 688 208' stroke-linecap='round' stroke-width='3' /> <path fill='none' stroke='currentColor' d=' M 698 208 L 678 208' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 694 213 L 682 213' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 690 218 L 686 218' stroke-linecap='round' stroke-width='3' /><path fill='currentColor' stroke='currentColor' d=' M 691 192 A 3 3 0 1 1 690.9997392252899 191.96044522459943 Z' /> </g></svg>";

    readonly capacitorIcon = "<svg><defs /><g transform='translate(-323.76,-71.18) scale(0.470588)'><path fill='none' stroke='currentColor' d=' M 688 176 L 708 176' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 708 164 L 708 188' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 736 176 L 716 176' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 716 164 L 716 188' stroke-linecap='round' stroke-width='3' /><path fill='currentColor' stroke='currentColor' d=' M 691 176 A 3 3 0 1 1 690.9997392252899 175.96044522459943 Z' /><path fill='currentColor' stroke='currentColor' d=' M 739 176 A 3 3 0 1 1 738.9997392252899 175.96044522459943 Z' /></g></svg>";

    readonly diodeIcon = "<svg><defs /><g transform='translate(-323.76,-72.06) scale(0.470588)'><path fill='none' stroke='currentColor' d=' M 688 176 L 704 176' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 720 176 L 736 176' stroke-linecap='round' stroke-width='3' /><path fill='currentColor' stroke='currentColor' d=' M 704 168 L 704 184 L 720 176 Z' /><path fill='none' stroke='currentColor' d=' M 720 168 L 720 184' stroke-linecap='round' stroke-width='3' /><path fill='currentColor' stroke='currentColor' d=' M 691 176 A 3 3 0 1 1 690.9997392252899 175.96044522459943 Z' /><path fill='currentColor' stroke='currentColor' d=' M 739 176 A 3 3 0 1 1 738.9997392252899 175.96044522459943 Z' /></g></svg>";

    readonly switchIcon = "<svg><defs /><g transform='translate(55.79,-100.42) scale(0.421053)'><path fill='none' stroke='currentColor' d=' M -128 272 L -120 272' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M -88 272 L -80 272' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M -120 272 L -88 256' stroke-linecap='round' stroke-width='3' /></g></svg>";

    readonly voltage2Icon = "<svg><defs /><g transform='scale(.8) translate(-122.00,-53.00) scale(0.500000)'><path fill='none' stroke='currentColor' d=' M 272 160 L 272 140' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 272 132 L 272 112' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 262 140 L 282 140' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 256 132 L 288 132' stroke-linecap='round' stroke-width='3' /><path fill='currentColor' stroke='currentColor' d=' M 275 160 A 3 3 0 1 1 274.99973922528994 159.96044522459943 Z' /><path fill='currentColor' stroke='currentColor' d=' M 275 112 A 3 3 0 1 1 274.99973922528994 111.96044522459944 Z' /></g></svg>";

    readonly transistorIcon = "<svg><defs /><g transform='translate(-107.73,-90.40) scale(0.533333)'><path fill='none' stroke='currentColor' d=' M 240 176 L 227 186' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 240 208 L 227 198' stroke-linecap='round' stroke-width='3' /><path fill='currentColor' stroke='currentColor' d=' M 240 208 L 236 200 L 231 206 Z' /><path fill='none' stroke='currentColor' d=' M 208 192 L 224 192' stroke-linecap='round' stroke-width='3' /><path fill='currentColor' stroke='currentColor' d=' M 224 176 L 227 176 L 227 208 L 224 208 Z' /><path fill='currentColor' stroke='currentColor' d=' M 211 192 A 3 3 0 1 1 210.99973922528991 191.96044522459943 Z' /><path fill='currentColor' stroke='currentColor' d=' M 243 176 A 3 3 0 1 1 242.99973922528991 175.96044522459943 Z' /><path fill='currentColor' stroke='currentColor' d=' M 243 208 A 3 3 0 1 1 242.99973922528991 207.96044522459943 Z' /></g></svg>";
    readonly pnpTransistorIcon = "<svg><defs /><g transform='translate(-116.27,-90.40) scale(0.533333)'><path fill='none' stroke='currentColor' d=' M 256 208 L 243 198' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 256 176 L 243 186' stroke-linecap='round' stroke-width='3' /><path fill='currentColor' stroke='currentColor' d=' M 245 187 L 253 184 L 248 178 Z' /><path fill='none' stroke='currentColor' d=' M 224 192 L 240 192' stroke-linecap='round' stroke-width='3' /><path fill='currentColor' stroke='currentColor' d=' M 240 176 L 243 176 L 243 208 L 240 208 Z' /><path fill='currentColor' stroke='currentColor' d=' M 227 192 A 3 3 0 1 1 226.99973922528991 191.96044522459943 Z' /><path fill='currentColor' stroke='currentColor' d=' M 259 208 A 3 3 0 1 1 258.99973922528994 207.96044522459943 Z' /><path fill='currentColor' stroke='currentColor' d=' M 259 176 A 3 3 0 1 1 258.99973922528994 175.96044522459943 Z' /></g></svg>";

    readonly fetIcon = "<svg><defs /><g transform='translate(-68.92,-50.27) scale(0.324324)'><path fill='none' stroke='currentColor' d=' M 272 208 L 250 208' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 272 176 L 250 176' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 250 208 L 250 203' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 250 197 L 250 192' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 250 192 L 250 187' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 250 181 L 250 176' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 250 208 L 250 213' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 250 176 L 250 171' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 272 208 L 272 192' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 272 192 L 250 192' stroke-linecap='round' stroke-width='3' /><path fill='currentColor' stroke='currentColor' d=' M 250 192 L 262 197 L 262 187 Z' /><path fill='none' stroke='currentColor' d=' M 224 192 L 244 192' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 244 184 L 244 200' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 272 176 L 272 160' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 272 208 L 272 224' stroke-linecap='round' stroke-width='3' /><path fill='currentColor' stroke='currentColor' d=' M 227 192 A 3 3 0 1 1 226.99973922528991 191.96044522459943 Z' /><path fill='currentColor' stroke='currentColor' d=' M 275 160 A 3 3 0 1 1 274.99973922528994 159.96044522459943 Z' /><path fill='currentColor' stroke='currentColor' d=' M 275 224 A 3 3 0 1 1 274.99973922528994 223.96044522459943 Z' /></g></svg>";
    readonly fetIcon2 = "<svg><defs /><g transform='translate(-68.92,-50.27) scale(0.324324)'><path fill='none' stroke='currentColor' d=' M 272 176 L 272 160' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 272 208 L 272 224' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 272 208 L 250 208' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 272 176 L 250 176' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 250 208 L 250 203' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 250 197 L 250 192' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 250 192 L 250 187' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 250 181 L 250 176' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 250 208 L 250 213' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 250 176 L 250 171' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 272 176 L 272 192' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 272 192 L 250 192' stroke-linecap='round' stroke-width='3' /><path fill='currentColor' stroke='currentColor' d=' M 272 192 L 260 187 L 260 197 Z' /><path fill='none' stroke='currentColor' d=' M 224 192 L 244 192' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 244 184 L 244 200' stroke-linecap='round' stroke-width='3' /><path fill='currentColor' stroke='currentColor' d=' M 275 160 A 3 3 0 1 1 274.99973922528994 159.96044522459943 Z' /><path fill='currentColor' stroke='currentColor' d=' M 275 224 A 3 3 0 1 1 274.99973922528994 223.96044522459943 Z' /><path fill='currentColor' stroke='currentColor' d=' M 227 192 A 3 3 0 1 1 226.99973922528991 191.96044522459943 Z' /></g></svg>";

    readonly inductIcon = "<svg><g transform='translate(-101.59,-58.18) scale(0.405680)'><path fill='none' stroke='currentColor' d=' M 256 176 L 264 176' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 296 176 L 304 176' stroke-linecap='round' stroke-width='3' /><g transform='matrix(1,0,0,1,264,176) scale(1,1)'><path fill='none' stroke='currentColor' d=' M 0 0 L 0 6.53144959545255e-16 A 5.333333333333333 5.333333333333333 0 0 1 10.666666666666666 0 L 10.666666666666666 0' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 10.666666666666666 0 L 10.666666666666668 6.53144959545255e-16 A 5.333333333333333 5.333333333333333 0 0 1 21.333333333333332 0 L 21.333333333333332 0' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 21.333333333333332 0 L 21.333333333333336 6.53144959545255e-16 A 5.333333333333333 5.333333333333333 0 0 1 32 0 L 32 0' stroke-linecap='round' stroke-width='3' /></g><path fill='currentColor' stroke='currentColor' d=' M 259 176 A 3 3 0 1 1 258.99973922528994 175.96044522459943 Z' /><path fill='currentColor' stroke='currentColor' d=' M 307 176 A 3 3 0 1 1 306.99973922528994 175.96044522459943 Z' /></g></svg>";

    readonly railIcon = "<svg><g><text style='user-select: none;' fill='currentColor' stroke='none' font-family='sans-serif' font-size='10px' font-style='normal' font-weight='normal' text-decoration='normal' x='2' y='11' text-anchor='start' dominant-baseline='central'>+5V</text></g></svg>";

    readonly andIcon = "<svg><g transform='translate(-143.64,-130.55) scale(0.363636)'><path fill='none' stroke='currentColor' d=' M 400 400 L 414 400' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 400 384 L 414 384' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 442 392 L 456 392' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 414 378 L 428 378 A 14 14 0 0 1 428 406 L 414 406 Z' stroke-linecap='round' stroke-width='3' /></g></svg>";
    readonly orIcon = "<svg><g transform='translate(-143.64,-153.82) scale(0.363636)'><path fill='none' stroke='currentColor' d=' M 400 464 L 414 464' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 400 448 L 414 448' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 442 456 L 456 456' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 413 442 L 422 442 C 434 445 434 445 442 456 C 434 467 434 467 422 470 L 413 470 C 416 456 416 456 413 442 Z' stroke-linecap='round' stroke-width='3' /></g></svg>";
    readonly xorIcon = "<svg><g transform='translate(-143.64,-180.00) scale(0.363636)'><path fill='none' stroke='currentColor' d=' M 400 536 L 414 536' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 400 520 L 414 520' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 442 528 L 456 528' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 413 514 L 422 514 C 434 517 434 517 442 528 C 434 539 434 539 422 542 L 413 542 C 416 528 416 528 413 514 Z M 408 514 C 411 528 411 528 408 542' stroke-linecap='round' stroke-width='3' /></g></svg>";
    readonly nandIcon = "<svg><g transform='translate(-143.64,-142.18) scale(0.363636)'><path fill='none' stroke='currentColor' d=' M 400 432 L 414 432' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 400 416 L 414 416' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 450 424 L 456 424' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 414 410 L 428 410 A 14 14 0 0 1 428 438 L 414 438 Z' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 448.94 424 A 2.94 2.94 0 1 1 448.93999853000014 423.99706000049' stroke-linecap='round' stroke-width='3' /></g></svg>";
    readonly norIcon = "<svg><g transform='translate(-143.64,-165.45) scale(0.363636)'><path fill='none' stroke='currentColor' d=' M 400 496 L 414 496' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 400 480 L 414 480' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 450 488 L 456 488' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 413 474 L 422 474 C 434 477 434 477 442 488 C 434 499 434 499 422 502 L 413 502 C 416 488 416 488 413 474 Z' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 448.94 488 A 2.94 2.94 0 1 1 448.93999853000014 487.99706000049' stroke-linecap='round' stroke-width='3' /></g></svg>";
    readonly inverterIcon = "<svg><g transform='translate(-288.41,-166.76) scale(0.413793)'><path fill='none' stroke='currentColor' d=' M 704 432 L 712 432' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 746 432 L 752 432' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 712 416 L 712 448 L 739 432 Z' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 744.94 432 A 2.94 2.94 0 1 1 744.9399985300001 431.99706000049' stroke-linecap='round' stroke-width='3' /></g></svg>";
    readonly xnorIcon = "<svg><g fill='none' stroke='currentColor' stroke-linecap='round' stroke-width='3'><path stroke-width='1.0909200000000001' d='M1.814 14.909h5.091M1.814 9.09h5.091M6.542 6.909h3.272c4.364 1.09 4.364 1.09 7.273 5.09-2.909 4-2.909 4-7.273 5.092H6.542C7.632 12 7.632 12 6.542 6.909Zm-1.819 0c1.091 5.09 1.091 5.09 0 10.182M19.996 11.98h2.182M19.61 11.98a1.07 1.07 0 1 1 0-.002'/></g></svg>";
    readonly aswitch1Icon = "<svg><g transform='translate(-242.27,-122.92) scale(0.324324)'><path fill='none' stroke='currentColor' d=' M 752 416 L 768 416' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 800 416 L 816 416' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 768 416 L 800 400' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 784 432 L 784 424' stroke-linecap='round' stroke-width='3' /></g></svg>";
    readonly aswitch2Icon = "<svg><g transform='translate(-237.08,-146.27) scale(0.324324)'><path fill='none' stroke='currentColor' d=' M 736 480 L 752 480' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 784 496 L 800 496' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 784 464 L 800 464' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 752 480 L 784 464' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 768 496 L 768 512' stroke-linecap='round' stroke-width='3' /></g></svg>";
    readonly dpdtIcon = "<svg><g transform='translate(-205.60,-130.93) scale(0.266667)'><path fill='none' stroke='currentColor' d=' M 784 512 L 800 512' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 848 528 L 832 528' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 848 496 L 832 496' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 816 520 L 816 557' stroke-linecap='round' /><path fill='none' stroke='currentColor' d=' M 800 512 L 832 528' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 784 560 L 800 560' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 848 576 L 832 576' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 848 544 L 832 544' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 800 560 L 832 576' stroke-linecap='round' stroke-width='3' /></g></svg>";
    readonly spdtIcon = "<svg><g transform='translate(-242.27,-143.68) scale(0.324324)'><path fill='none' stroke='currentColor' d=' M 752 480 L 768 480' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 800 464 L 816 464' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 800 496 L 816 496' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 768 480 L 800 464' stroke-linecap='round' stroke-width='3' /></g></svg>";
    readonly acSrcIcon = "<svg><g transform='translate(-104.09,-66.93) scale(0.266667)'><path fill='none' stroke='currentColor' d=' M 432 336 L 432 313' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 432 279 L 432 256' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 448.66 296 A 16.66 16.66 0 1 1 448.6599916700007 295.98334000277663' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 422 296 L 423 294 L 424 292 L 425 290 L 426 289 L 427 289 L 428 289 L 429 290 L 430 292 L 431 294 L 432 296 L 433 298 L 434 300 L 435 302 L 436 303 L 437 303 L 438 303 L 439 302 L 440 300 L 441 298 L 442 296' stroke-linecap='round' stroke-width='3' /></g></svg>";
    readonly opAmpTopIcon = "<svg><g transform='translate(-169.33,-86.13) scale(0.266667)'><path fill='none' stroke='currentColor' d=' M 640 384 L 654 384' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 640 352 L 654 352' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 706 368 L 720 368' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 654 400 L 654 336 L 706 368 Z' stroke-linecap='round' stroke-width='3' /><g><text fill='currentColor' stroke='currentColor' font-family='sans-serif' font-size='14px' font-style='normal' font-weight='normal' text-decoration='normal' x='664' y='382' text-anchor='middle' dominant-baseline='central'>-</text></g><g><text fill='currentColor' stroke='currentColor' font-family='sans-serif' font-size='14px' font-style='normal' font-weight='normal' text-decoration='normal' x='664' y='352' text-anchor='middle' dominant-baseline='central'>+</text></g></g></svg>";
    readonly opAmpBotIcon = "<svg><g transform='translate(-169.33,-86.13) scale(0.266667)'><path fill='none' stroke='currentColor' d=' M 640 352 L 654 352' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 640 384 L 654 384' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 706 368 L 720 368' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 654 336 L 654 400 L 706 368 Z' stroke-linecap='round' stroke-width='3' /><g><text fill='currentColor' stroke='currentColor' font-family='sans-serif' font-size='14px' font-style='normal' font-weight='normal' text-decoration='normal' x='664' y='350' text-anchor='middle' dominant-baseline='central'>-</text></g><g><text fill='currentColor' stroke='currentColor' font-family='sans-serif' font-size='14px' font-style='normal' font-weight='normal' text-decoration='normal' x='664' y='384' text-anchor='middle' dominant-baseline='central'>+</text></g></g></svg>";
}
