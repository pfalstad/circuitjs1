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

// A hyperlink: a button (or underlined text) that opens a reference document,
// e.g. an application note, a datasheet or a credit for the circuit's source.
// Clicking it (a click, not a drag) follows the link, also in read-only mode;
// it is edited from the right-click menu, like a switch.
//
// URL: https://... or a path relative to the app's folder (as the circuit menus
// use, e.g. "applied/lm109.txt").  Anything else (http:, javascript:, ...) is refused.
// New tab: opens the URL in a new tab.
// Same tab: a relative path is loaded as a circuit, inside the app.  Browser Back
//   returns to the circuit it came from (as it was, edits included); leaving a
//   circuit with unsaved edits asks first.  An https URL replaces the page (the
//   page's usual unsaved-changes warning applies).

import { GraphicElm } from "./GraphicElm";
import { CircuitElm } from "./CircuitElm";
import { Graphics } from "./Graphics";
import { Font } from "./Font";
import { Color } from "./Color";
import { StringTokenizer } from "./StringTokenizer";
import { Locale } from "./Locale";
import { EditInfo } from "./EditInfo";
import { Choice } from "./Choice";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { moduleBaseURL } from "./ModuleBase";

export class LinkElm extends GraphicElm {
    text: string = "Datasheet";
    url: string = "";
    sameTab: boolean = false;
    textStyle: boolean = false;    // false = button, true = underlined link text
    size: number = 16;
    // link text colour: light blue on the black canvas, darker blue on White Background
    static readonly linkColor = new Color("#4a90e2");
    static readonly linkColorPrint = new Color("#0645ad");

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined)
            super(xa, ya);
        else
            super(xa, ya, xb, yb!, f!);   // saved as XML only (undumpXml)
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "te", this.text);
        CircuitXMLSerializer.dumpAttr(elem, "url", this.url);
        CircuitXMLSerializer.dumpAttr(elem, "same", this.sameTab ? 1 : 0);
        CircuitXMLSerializer.dumpAttr(elem, "sty", this.textStyle ? 1 : 0);
        CircuitXMLSerializer.dumpAttr(elem, "si", this.size);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.text = xml.parseStringAttr("te", this.text) ?? this.text;
        this.url = xml.parseStringAttr("url", this.url) ?? this.url;
        this.sameTab = xml.parseIntAttr("same", 0) !== 0;
        this.textStyle = xml.parseIntAttr("sty", 0) !== 0;
        this.size = xml.parseIntAttr("si", this.size);
    }

    getDumpType(): number { return 443; }
    isLinkElm(): boolean { return true; }

    drag(xx: number, yy: number): void {
        this.x = xx;
        this.y = yy;
        this.x2 = xx + 16;
        this.y2 = yy;
    }

    draw(g: Graphics): void {
        g.save();
        g.setFont(new Font("SansSerif", 0, this.size));
        const s = Locale.LS(this.text);
        const w = Math.trunc(g.context.measureText(s).width);
        const h = this.size;
        const hl = this.needsHighlight();
        if (this.textStyle) {
            g.setColor(hl ? CircuitElm.selectColor :
                       (CircuitElm.app as any).isPrintable() ? LinkElm.linkColorPrint : LinkElm.linkColor);
            g.drawString(s, this.x, this.y);
            g.drawLine(this.x, this.y + 3, this.x + w, this.y + 3);
            this.setBbox(this.x, this.y - h, this.x + w, this.y + 4);
        } else {
            // button: padded, rounded box around the text
            const px = Math.trunc(h / 2), py = Math.trunc(h / 3);
            const bx = this.x - px, by = this.y - h - py + 2;
            const bw = w + 2 * px, bh = h + 2 * py;
            const c = g.context;
            c.beginPath();
            c.roundRect(bx, by, bw, bh, 4);
            c.fillStyle = "#e7e7e7";
            c.fill();
            c.lineWidth = hl ? 3 : 1;
            c.strokeStyle = hl ? CircuitElm.selectColor.getHexValue() : "#888888";
            c.stroke();
            c.fillStyle = "#000000";
            c.fillText(s, this.x, this.y);
            this.setBbox(bx, by, bx + bw, by + bh);
        }
        this.x2 = this.boundingBox.x + this.boundingBox.width;
        this.y2 = this.boundingBox.y + this.boundingBox.height;
        g.restore();
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("Text", 0, -1, -1);
            ei.text = this.text;
            return ei;
        }
        if (n === 1) {
            const ei = new EditInfo("URL (https:// or relative path)", 0, -1, -1);
            ei.text = this.url;
            return ei;
        }
        if (n === 2) {
            const ei = new EditInfo("Opens In", 0, -1, -1);
            ei.choice = new Choice();
            ei.choice.add("New Tab");
            ei.choice.add("Same Tab");
            ei.choice.select(this.sameTab ? 1 : 0);
            return ei;
        }
        if (n === 3) {
            const ei = new EditInfo("Style", 0, -1, -1);
            ei.choice = new Choice();
            ei.choice.add("Button");
            ei.choice.add("Link Text");
            ei.choice.select(this.textStyle ? 1 : 0);
            return ei;
        }
        if (n === 4)
            return new EditInfo("Size", this.size, 5, 100);
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.text = ei.textf!.value;
        if (n === 1) {
            const u = ei.textf!.value.trim();
            if (u !== "" && !LinkElm.isAllowedUrl(u))
                window.alert(Locale.LS("Link must start with https:// or be a relative path."));
            else
                this.url = u;
        }
        if (n === 2)
            this.sameTab = ei.choice!.getSelectedIndex() === 1;
        if (n === 3)
            this.textStyle = ei.choice!.getSelectedIndex() === 1;
        if (n === 4)
            this.size = Math.trunc(ei.value);
    }

    getElmType(): string { return "link"; }
    getInfo(arr: string[]): void {
        arr[0] = this.text;
        arr[1] = this.url;
    }
    canViewInScope(): boolean { return false; }

    // ---- following the link ----

    // https://..., or a relative path (no scheme, not //host)
    static isAllowedUrl(u: string): boolean {
        if (/^https:\/\//i.test(u))
            return true;
        return !/^[a-z][a-z0-9+.-]*:/i.test(u) && !u.startsWith("//") && !u.startsWith("\\");
    }

    followLink(): void {
        const u = this.url;
        if (u === "" || !LinkElm.isAllowedUrl(u))
            return;
        const relative = !/^https:/i.test(u);
        const full = relative ? new URL(u, moduleBaseURL).href : u;
        if (!this.sameTab) {
            window.open(full, "_blank", "noopener");
            return;
        }
        if (!relative) {
            window.location.href = full;   // beforeunload warns about unsaved changes
            return;
        }
        // same tab, circuit file: load it here, with a history entry so Back returns
        const app = CircuitElm.app as any;
        // keep the circuit we're leaving (as it is now) in its own history entry
        // n = position in our chain of entries, so a cancelled Back/Forward can step back to it
        const n = history.state?.n ?? 0;
        history.replaceState({ linkCct: app.dumpCircuit(), title: LinkElm.currentTitle(),
                               modified: app.isModified(), n: n }, "");
        history.pushState({ linkUrl: full, title: this.text, n: n + 1 }, "");
        LinkElm.shownState = history.state;
        app.undoManager?.pushUndo();
        LinkElm.loadState(history.state);
    }

    static currentTitle(): string | null {
        return (CircuitElm.app as any).ui?.titleLabel?.textContent ?? null;
    }

    // state of the history entry being shown (so Back can be undone if the user cancels)
    static shownState: any = null;
    static returning = false;

    static async loadState(st: any): Promise<void> {
        const app = CircuitElm.app as any;
        app.resetEditingContext?.();
        if (st.linkCct != null) {
            await app.loader.readCircuit(st.linkCct, 8 /* CircuitLoader.RC_KEEP_TITLE */);
            app.setCircuitTitle(st.title);
            // it had unsaved edits when we left it; it still does
            app.unsavedChanges = st.modified;
        } else {
            await app.loader.loadFileFromURL(st.linkUrl);
            app.setCircuitTitle(st.title);
        }
    }

    static onPopState(e: PopStateEvent): void {
        const st = e.state;
        if (st == null || (st.linkCct == null && st.linkUrl == null))
            return;   // not one of ours
        if (LinkElm.returning) {
            // the history.go() after a Cancel, below: we're back where we were
            LinkElm.returning = false;
            return;
        }
        const app = CircuitElm.app as any;
        if (app.isModified() &&
            !window.confirm(Locale.LS("Leave this circuit?  Your changes to it will be lost."))) {
            // stay: step back to the entry we were on.  (Adding a new entry here instead
            // makes Chrome skip this one on the next Back, which leaves the page.)
            if (LinkElm.shownState != null) {
                LinkElm.returning = true;
                history.go(LinkElm.shownState.n - st.n);
            }
            return;
        }
        LinkElm.shownState = st;
        LinkElm.loadState(st);
    }

    static {
        // (no window when generateRegistrations.ts builds the element under Node)
        if (typeof window !== "undefined")
            window.addEventListener("popstate", e => LinkElm.onPopState(e));
    }
}
