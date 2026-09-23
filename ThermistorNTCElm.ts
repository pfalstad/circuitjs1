/*
    Bill Collis - June 2015

    This file is part of CircuitJS1 (GNU GPL v2).
*/

import { CircuitElm } from "./CircuitElm";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { CustomLogicModel } from "./CustomLogicModel";
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { Locale } from "./Locale";
import { StringTokenizer } from "./StringTokenizer";
import { Scrollbar } from "./UIManager";
import { parseFloatStrict } from "./NumberParse";

export class ThermistorNTCElm extends CircuitElm {
    position: number;
    resistance: number = 0;
    minTempr: number = -40;
    maxTempr: number = 150;
    temperature: number = 0;
    r25: number = 10000;
    r50: number = 3605;
    rneg40: number = 0;
    b25100: number = 0;
    readonly t0 = 273.15;
    readonly t25 = 273.15 + 25;
    slider: Scrollbar | null = null;
    labelEl: HTMLElement | null = null;
    sliderText: string;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f);
        if (st !== undefined) {
            this.r25 = parseFloatStrict(st.nextToken());
            this.r50 = parseFloatStrict(st.nextToken());
            this.minTempr = parseFloatStrict(st.nextToken());
            this.maxTempr = parseFloatStrict(st.nextToken());
            this.position = parseFloatStrict(st.nextToken());
            this.sliderText = CustomLogicModel.unescape(st.nextToken());
        } else {
            this.position = 0.34;
            this.sliderText = "Temperature";
        }
        this.rneg40 = this.calcResistance(this.minTempr);
        this.b25100 = this.calcB25100();
        this.temperature = this.temprFromSliderPos();
        this.resistance = this.calcResistance(this.temperature);
        this.createSlider();
    }

    getPostCount(): number { return 2; }
    getDumpType(): number { return 350; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "r25", this.r25);
        CircuitXMLSerializer.dumpAttr(elem, "r50", this.r50);
        CircuitXMLSerializer.dumpAttr(elem, "mnt", this.minTempr);
        CircuitXMLSerializer.dumpAttr(elem, "mxt", this.maxTempr);
        CircuitXMLSerializer.dumpAttr(elem, "ps", this.position);
        CircuitXMLSerializer.dumpAttr(elem, "st", this.sliderText);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.r25 = xml.parseDoubleAttr("r25", this.r25);
        this.r50 = xml.parseDoubleAttr("r50", this.r50);
        this.minTempr = xml.parseDoubleAttr("mnt", this.minTempr);
        this.maxTempr = xml.parseDoubleAttr("mxt", this.maxTempr);
        this.position = xml.parseDoubleAttr("ps", this.position);
        this.sliderText = xml.parseStringAttr("st", this.sliderText) ?? this.sliderText;
        this.rneg40 = this.calcResistance(this.minTempr);
        this.b25100 = this.calcB25100();
        this.temperature = this.temprFromSliderPos();
        this.resistance = this.calcResistance(this.temperature);
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
            this.position = this.slider.getValue() * 0.0099 + 0.005;
            this.temperature = this.temprFromSliderPos();
            this.resistance = this.calcResistance(this.temperature);
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
            ctx.beginPath(); ctx.moveTo(0, 0);
            for (let i = 0; i < 4; i++) {
                ctx.lineTo((1 + 4*i) * len / 16, hs);
                ctx.lineTo((3 + 4*i) * len / 16, -hs);
            }
            ctx.lineTo(len, 0); ctx.stroke();
        } else {
            ctx.strokeRect(0, -hs, len, 2.0 * hs);
        }
        // NTC symbol: diagonal line
        ctx.beginPath();
        ctx.moveTo(0 - hs, hs * 2);
        ctx.lineTo(hs, hs * 2);
        ctx.lineTo(len, -hs * 2);
        ctx.stroke();
        ctx.restore();
        if (this.showValues()) {
            this.temperature = this.temprFromSliderPos();
            this.resistance = this.calcResistance(this.temperature);
            this.drawValues(g, this.temperature + "°C=" + CircuitElm.getShortUnitText(this.resistance, "") + "Ω", hs);
        }
        this.doDots(g);
        this.drawPosts(g);
    }

    calculateCurrent(): void {
        this.current = (this.nodes[0].v - this.nodes[1].v) / this.resistance;
    }

    stamp(): void {
        this.temperature = this.temprFromSliderPos();
        this.resistance = this.calcResistance(this.temperature);
        CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[1], this.resistance);
    }

    getInfo(arr: string[]): void {
        arr[0] = "thermistor";
        arr[1] = "I = " + CircuitElm.getCurrentDText(this.current);
        arr[2] = "Vd = " + CircuitElm.getVoltageDText(this.getVoltageDiff());
        arr[3] = "R = " + CircuitElm.getUnitText(this.resistance, Locale.ohmString);
        arr[4] = "P = " + CircuitElm.getUnitText(this.getPower(), "W");
        arr[5] = "T = " + CircuitElm.getUnitText(this.temperature, "°C");
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) return new EditInfo("R at 25°C", this.r25, this.r50 + 100, 100000);
        if (n === 1) return new EditInfo("R at 50°C", this.r50, 100, this.r25 - 100);
        if (n === 2) return new EditInfo("Slider min temp (°C)", this.minTempr, -40, this.maxTempr);
        if (n === 3) return new EditInfo("Slider max temp (°C)", this.maxTempr, this.minTempr, 150);
        if (n === 4) {
            const ei = new EditInfo("Slider Text", 0, -1, -1);
            ei.text = this.sliderText;
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) this.r25 = ei.value;
        if (n === 1) this.r50 = ei.value;
        if (n === 2) this.minTempr = ei.value;
        if (n === 3) this.maxTempr = ei.value;
        if (n === 4) {
            this.sliderText = ei.textf!.value;
            if (this.labelEl) this.labelEl.textContent = this.sliderText;
            CircuitElm.app.setiFrameHeight();
        }
        this.rneg40 = this.calcResistance(this.minTempr);
        this.b25100 = this.calcB25100();
        this.temperature = this.temprFromSliderPos();
        this.resistance = this.calcResistance(this.temperature);
    }

    calcResistance(tempr: number): number {
        return Math.round(this.r25 * Math.exp(this.b25100 * ((1 / (tempr + this.t0)) - (1 / this.t25))));
    }

    temprFromSliderPos(): number {
        return Math.round(this.position * (this.maxTempr - this.minTempr) + this.minTempr);
    }

    calcB25100(): number {
        return (Math.log(this.r25) - Math.log(this.r50)) / ((1 / (this.t0 + 25)) - (1 / (this.t0 + 50)));
    }
}
