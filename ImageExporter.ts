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
import { Graphics } from "./Graphics";
import { CircuitElm } from "./CircuitElm";
import { Color } from "./Color";
import { Rectangle } from "./Rectangle";

export class ImageExporter {
    static readonly CAC_PRINT = 0;
    static readonly CAC_IMAGE = 1;
    static readonly CAC_SVG   = 2;

    sim: CirSim;

    constructor(sim: CirSim) {
        this.sim = sim;
    }

    static defaultFileName(ext: string): string {
        const d = new Date();
        const pad = (n: number) => (n < 10 ? "0" + n : "" + n);
        const dtf = "" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
            "-" + pad(d.getHours()) + pad(d.getMinutes());
        return "circuit-" + dtf + ext;
    }

    doExportAsImage(): void {
        if (CirSim.isElectron()) {
            const dataURL = this.getCircuitAsCanvas(ImageExporter.CAC_IMAGE).toDataURL();
            const base64 = dataURL.substring(dataURL.indexOf(',') + 1);
            (window as any).showSaveDialog?.(ImageExporter.defaultFileName(".png")).then((file: any) => {
                if (file.canceled)
                    return;
                (window as any).saveFile(file, base64, "base64");
            });
            return;
        }
        CirSim.dialogShowing = new (window as any).ExportAsImageDialog(ImageExporter.CAC_IMAGE, this.sim);
        CirSim.dialogShowing.show();
    }

    doImageToClipboard(): void {
        const cv = this.getCircuitAsCanvas(ImageExporter.CAC_IMAGE);
        cv.toBlob((blob) => {
            if (blob == null)
                return;
            const item = new (window as any).ClipboardItem({ "image/png": blob });
            navigator.clipboard.write([item]).then((x: any) => console.log(x));
        });
    }

    doPrint(): void {
        const cv = this.getCircuitAsCanvas(ImageExporter.CAC_PRINT);
        const img = cv.toDataURL("image/png");
        const style = document.createElement("style");
        style.id = "circuit-print-style";
        style.innerHTML = "@media print { body > *:not(#circuit-print-overlay) { display: none !important; } } " +
            "#circuit-print-overlay { display: none; } " +
            "@media print { @page { size: auto; margin: 10mm; } " +
            "#circuit-print-overlay { display: block !important; width: 100%; height: 100%; } " +
            "#circuit-print-overlay img { max-width: 100%; max-height: 100%; width: auto; height: auto; " +
            "display: block; margin: 0 auto; page-break-inside: avoid; } }";
        document.head.appendChild(style);
        const overlay = document.createElement("div");
        overlay.id = "circuit-print-overlay";
        const imgEl = document.createElement("img");
        imgEl.src = img;
        overlay.appendChild(imgEl);
        document.body.appendChild(overlay);
        setTimeout(() => {
            window.print();
            document.body.removeChild(overlay);
            document.head.removeChild(style);
        }, 500);
    }

    doExportAsSVG(): void {
        if (CirSim.isElectron()) {
            (window as any).showSaveDialog?.(ImageExporter.defaultFileName(".svg")).then((file: any) => {
                if (file.canceled)
                    return;
                (window as any).saveFile(file, this.getCircuitAsSVG(), "utf8");
            });
            return;
        }
        CirSim.dialogShowing = new (window as any).ExportAsImageDialog(ImageExporter.CAC_SVG, this.sim);
        CirSim.dialogShowing.show();
    }

    doExportAsSVGFromAPI(): void {
        const svg = this.getCircuitAsSVG();
        this.sim.jsInterface.callSVGRenderedHook(svg);
    }

    getCircuitAsCanvas(type: number): HTMLCanvasElement {
        const cv = document.createElement("canvas");
        const bounds = this.sim.getCircuitBounds();

        // add some space on edges because bounds calculation is not perfect
        const wmargin = 140;
        const hmargin = 100;
        const w = bounds.width * 2 + wmargin;
        const h = bounds.height * 2 + hmargin;
        cv.width = w;
        cv.height = h;

        const context = cv.getContext("2d") as CanvasRenderingContext2D;
        this.drawCircuitInContext(context, type, bounds, w, h);
        return cv;
    }

    getCircuitAsSVG(): string {
        const bounds = this.sim.getCircuitBounds();

        // add some space on edges because bounds calculation is not perfect
        const wmargin = 140;
        const hmargin = 100;
        const w = bounds.width + wmargin;
        const h = bounds.height + hmargin;
        const context = new (window as any).C2S(w, h);
        this.drawCircuitInContext(context, ImageExporter.CAC_SVG, bounds, w, h);
        return context.getSerializedSvg();
    }

    drawCircuitInContext(context: CanvasRenderingContext2D, type: number, bounds: Rectangle, w: number, h: number): void {
        const g = new Graphics(context);
        context.setTransform(1, 0, 0, 1, 0, 0);
        const oldTransform = this.sim.transform.slice();

        let scale = 1;

        // turn on white background, turn off current display
        const p = this.sim.menus.printableCheckItem.getState();
        const c = this.sim.menus.dotsCheckItem.getState();
        const print = (type === ImageExporter.CAC_PRINT);
        if (print)
            this.sim.menus.printableCheckItem.setState(true);
        if (this.sim.menus.printableCheckItem.getState()) {
            CircuitElm.whiteColor = Color.black;
            CircuitElm.lightGrayColor = Color.black;
            g.setColor(Color.white);
        } else {
            CircuitElm.whiteColor = Color.white;
            CircuitElm.lightGrayColor = Color.lightGray;
            g.setColor(Color.black);
        }
        g.fillRect(0, 0, w, h);
        this.sim.menus.dotsCheckItem.setState(false);

        const wmargin = 140;
        const hmargin = 100;
        if (bounds != null)
            scale = Math.min(w / (bounds.width + wmargin), h / (bounds.height + hmargin));

        // ScopeElms need the transform array to be updated
        this.sim.transform[0] = this.sim.transform[3] = scale;
        this.sim.transform[4] = -(bounds.x - wmargin / 2);
        this.sim.transform[5] = -(bounds.y - hmargin / 2);
        context.scale(scale, scale);
        context.translate(this.sim.transform[4], this.sim.transform[5]);
        context.lineCap = "round";

        // draw elements
        for (const ce of this.sim.elmList)
            ce.draw(g);
        for (let i = 0; i !== this.sim.postDrawList.length; i++)
            CircuitElm.drawPost(g, this.sim.postDrawList[i]);

        // restore everything
        this.sim.menus.printableCheckItem.setState(p);
        this.sim.menus.dotsCheckItem.setState(c);
        this.sim.transform = oldTransform;
    }
}
