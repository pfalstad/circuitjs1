/*
    Bill Collis - June 2015

    This file is part of CircuitJS1 (GNU GPL v2).
*/

import { CircuitElm } from "./CircuitElm";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { Locale } from "./Locale";
import { CustomLogicModel } from "./CustomLogicModel";
import { StringTokenizer } from "./StringTokenizer";
import { Scrollbar } from "./UIManager";
import { parseFloatStrict } from "./NumberParse";

export class LDRElm extends CircuitElm {
    position: number;
    resistance: number = 0;
    minLux: number = 0.1;
    maxLux: number = 10000;
    lux: number = 0;
    slider: Scrollbar | null = null;
    labelEl: HTMLElement | null = null;
    sliderText: string;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f);
        if (st !== undefined) {
            this.position = parseFloatStrict(st.nextToken());
            this.sliderText = CustomLogicModel.unescape(st.nextToken());
        } else {
            this.position = 0.34;
            this.sliderText = Locale.LS("Light Brightness");
        }
        this.lux = this.luxFromSliderPos();
        this.resistance = this.calcResistance(this.lux);
        this.createSlider();
    }

    getPostCount(): number { return 2; }
    getDumpType(): number { return 374; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "ps", this.position);
        CircuitXMLSerializer.dumpAttr(elem, "st", this.sliderText);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.position = xml.parseDoubleAttr("ps", this.position);
        this.sliderText = xml.parseStringAttr("st", this.sliderText) ?? this.sliderText;
        this.lux = this.luxFromSliderPos();
        this.resistance = this.calcResistance(this.lux);
        if (this.slider) {
            this.slider.setValue(Math.trunc(this.position * 100));
            if (this.labelEl) this.labelEl.textContent = this.sliderText;
        } else {
            this.createSlider();
        }
    }

    createSlider(): void {
        const lbl = document.createElement("div");
        lbl.textContent = this.sliderText;
        lbl.className = "topSpace";
        this.labelEl = lbl;
        CircuitElm.app.addWidgetToVerticalPanel(lbl);
        this.slider = new Scrollbar(Scrollbar.HORIZONTAL, Math.trunc(this.position * 100), 1, 0, 101);
        this.slider.addChangeHandler(() => {
            CircuitElm.app.analyzeFlag = true;
            this.setPoints();
        });
        CircuitElm.app.addWidgetToVerticalPanel(this.slider.element);
    }

    delete(): void {
        if (this.labelEl) CircuitElm.app.removeWidgetFromVerticalPanel(this.labelEl);
        if (this.slider) CircuitElm.app.removeWidgetFromVerticalPanel(this.slider.element);
        super.delete();
    }

    setPoints(): void {
        super.setPoints();
        this.calcLeads(32);
        if (this.slider) {
            this.position = this.slider.getValue() * 0.0099 + 0.0001;
            this.lux = this.luxFromSliderPos();
            this.resistance = this.calcResistance(this.lux);
        }
    }

    draw(g: Graphics): void {
        const hs = 6;
        this.setBbox(this.point1, this.point2, hs);
        this.draw2Leads(g);
        this.setPowerColor(g, true);
        const len = CircuitElm.distance(this.lead1!, this.lead2!);
        const ctx = g.context;
        ctx.save();
        ctx.lineWidth = 3.0;
        ctx.transform(
            (this.lead2!.x - this.lead1!.x) / len, (this.lead2!.y - this.lead1!.y) / len,
            -(this.lead2!.y - this.lead1!.y) / len, (this.lead2!.x - this.lead1!.x) / len,
            this.lead1!.x, this.lead1!.y
        );
        const grad = ctx.createLinearGradient(0, 0, len, 0);
        grad.addColorStop(0, this.getVoltageColor(g, this.nodes[0].v).getHexValue());
        grad.addColorStop(1, this.getVoltageColor(g, this.nodes[1].v).getHexValue());
        ctx.strokeStyle = grad;
        if (!this.showEuroResistors()) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            for (let i = 0; i < 4; i++) {
                ctx.lineTo((1 + 4*i) * len / 16, hs);
                ctx.lineTo((3 + 4*i) * len / 16, -hs);
            }
            ctx.lineTo(len, 0);
            ctx.stroke();
        } else {
            ctx.strokeRect(0, -hs, len, 2.0 * hs);
        }
        // LDR arrows
        ctx.beginPath();
        ctx.moveTo(-8, 26); ctx.lineTo(8, 12);
        ctx.moveTo(2, 12);  ctx.lineTo(8, 12); ctx.lineTo(8, 18);
        ctx.moveTo(12, 26); ctx.lineTo(26, 12);
        ctx.moveTo(20, 12); ctx.lineTo(26, 12); ctx.lineTo(26, 18);
        ctx.stroke();
        ctx.restore();
        if (this.showValues()) {
            this.lux = this.luxFromSliderPos();
            this.resistance = this.calcResistance(this.lux);
            this.drawValues(g, CircuitElm.getShortUnitText(this.resistance, "") + "Ω", hs);
        }
        this.doDots(g);
        this.drawPosts(g);
    }

    calculateCurrent(): void {
        this.current = (this.nodes[0].v - this.nodes[1].v) / this.resistance;
    }

    stamp(): void {
        this.lux = this.luxFromSliderPos();
        this.resistance = this.calcResistance(this.lux);
        CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[1], this.resistance);
    }

    getInfo(arr: string[]): void {
        arr[0] = "photoresistor";
        arr[1] = "I = " + CircuitElm.getCurrentDText(this.current);
        arr[2] = "Vd = " + CircuitElm.getVoltageDText(this.getVoltageDiff());
        arr[3] = "R = " + CircuitElm.getUnitText(this.resistance, Locale.ohmString);
        arr[4] = "P = " + CircuitElm.getUnitText(this.getPower(), "W");
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("Slider Text", 0, -1, -1);
            ei.text = this.sliderText;
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.sliderText = ei.textf!.value;
            if (this.labelEl) this.labelEl.textContent = this.sliderText;
            CircuitElm.app.setiFrameHeight();
        }
        this.lux = this.luxFromSliderPos();
        this.resistance = this.calcResistance(this.lux);
    }

    calcResistance(lux: number): number {
        return Math.round((this.maxLux - lux + 1) * 10);
    }

    luxFromSliderPos(): number {
        return this.maxLux * this.position + this.minLux;
    }
}
