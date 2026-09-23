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

import { Color } from "./Color";
import { Font } from "./Font";
import { Polygon } from "./Polygon";
import { Point } from "./Point";

export class Graphics {
    context: CanvasRenderingContext2D;
    currentFontSize: number;
    lastColor: Color | null = null;
    savedFontSize: number = 12;
    static isFullScreen: boolean = false;

    constructor(context: CanvasRenderingContext2D) {
        this.context = context;
        this.currentFontSize = 12;
    }

    setColor(color: Color | string | null): void {
        if (color instanceof Color) {
            if (color != null) {
                const colorString = color.getHexValue();
                this.context.strokeStyle = colorString;
                this.context.fillStyle = colorString;
            } else {
                console.log("Ignoring null-Color");
            }
            this.lastColor = color;
        } else if (typeof color === "string") {
            this.context.strokeStyle = color;
            this.context.fillStyle = color;
            this.lastColor = null;
        }
    }

    clipRect(x: number, y: number, width: number, height: number): void {
        this.context.beginPath();
        this.context.rect(x, y, width, height);
        this.context.clip();
    }

    restore(): void {
        this.context.restore();
        this.currentFontSize = this.savedFontSize;
    }

    save(): void {
        this.context.save();
        this.savedFontSize = this.currentFontSize;
    }

    fillRect(x: number, y: number, width: number, height: number): void {
      //  context.beginPath();
        this.context.fillRect(x, y, width, height);
      //  context.closePath();
    }

    drawRect(x: number, y: number, width: number, height: number): void {
      //  context.beginPath();
        this.context.strokeRect(x, y, width, height);
      //  context.closePath();
    }

    fillOval(x: number, y: number, width: number, height: number): void {
        this.context.beginPath();
        this.context.arc(x + width/2, y + width/2, width/2, 0, 2.0*3.14159);
        this.context.closePath();
        this.context.fill();
    }

    drawString(s: string, x: number, y: number): void {
        this.context.fillText(s, x, y);
    }

    measureWidth(s: string): number {
        return this.context.measureText(s).width;
    }

    setLineWidth(width: number): void {
        this.context.lineWidth = width;
    }

    drawLine(x1: number | Point, y1: number | Point, x2?: number, y2?: number): void {
        if (x1 instanceof Point && y1 instanceof Point) {
            this.context.beginPath();
            this.context.moveTo(x1.x, x1.y);
            this.context.lineTo(y1.x, y1.y);
            this.context.stroke();
        } else {
            this.context.beginPath();
            this.context.moveTo(x1 as number, y1 as number);
            this.context.lineTo(x2!, y2!);
            this.context.stroke();
        //    context.closePath();
        }
    }

    drawPolyline(xpoints: number[], ypoints: number[], n: number): void {
        this.context.beginPath();
        for (let i = 0; i < n; i++) {
            if (i === 0)
                this.context.moveTo(xpoints[i], ypoints[i]);
            else
                this.context.lineTo(xpoints[i], ypoints[i]);
        }
        this.context.closePath();
        this.context.stroke();
    }

    fillPolygon(p: Polygon): void {
        this.context.beginPath();
        for (let i = 0; i < p.npoints; i++) {
            if (i === 0)
                this.context.moveTo(p.xpoints[i], p.ypoints[i]);
            else
                this.context.lineTo(p.xpoints[i], p.ypoints[i]);
        }
        this.context.closePath();
        this.context.fill();
    }

    setFont(f: Font | null): void {
        if (f != null) {
            this.context.font = f.fontname;
            this.currentFontSize = f.size;
        }
    }

//  getFont(): Font {
//      // this may return wrong font if g.save/restore() is used.  just use that instead
//      return currentFont;
//  }

    drawLock(x: number, y: number): void {
        this.context.save();
        this.setColor(new Color(209, 75, 75));
        this.context.lineWidth = 3;
        this.fillRect(x, y, 30, 20);
        this.context.beginPath();
        this.context.moveTo(x+15-10, y);
        this.context.lineTo(x+15-10, y-4);
        this.context.arc(x+15, y-4, 10, -3.1415, 0);
        this.context.lineTo(x+15+10, y);
        this.context.stroke();
        this.context.restore();
    }

    static distanceSq(x1: number, y1: number, x2: number, y2: number): number {
        x2 -= x1;
        y2 -= y1;
        return x2*x2 + y2*y2;
    }

    setLineDash(a: number, b: number): void {
        if (typeof this.context.setLineDash !== "function")
            return;
        if (a === 0)
            this.context.setLineDash([]);
        else
            this.context.setLineDash([a, b]);
    }

    static viewFullScreen(): void {
        Graphics.requestFullScreen();
        Graphics.isFullScreen = true;
    }

    private static requestFullScreen(): void {
        const element = document.documentElement as any;
        if (element.requestFullscreen) {
            element.requestFullscreen();
        } else if (element.mozRequestFullScreen) {
            element.mozRequestFullScreen();
        } else if (element.webkitRequestFullscreen) {
            element.webkitRequestFullscreen();
        } else if (element.msRequestFullscreen) {
            element.msRequestFullscreen();
        }
    }

    static exitFullScreen(): void {
        Graphics.requestExitFullScreen();
        Graphics.isFullScreen = false;
    }

    private static requestExitFullScreen(): void {
        const d = document as any;
        if (d.exitFullscreen) {
            d.exitFullscreen();
        } else if (d.mozExitFullScreen) {
            d.mozExitFullScreen();
        } else if (d.webkitExitFullscreen) {
            d.webkitExitFullscreen();
        } else if (d.msExitFullscreen) {
            d.msExitFullscreen();
        }
    }
}
