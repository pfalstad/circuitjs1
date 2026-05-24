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

import { CircuitElm } from "./CircuitElm";
import { Diode } from "./Diode";
import { DiodeModel } from "./DiodeModel";
import { CustomLogicModel } from "./CustomLogicModel";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { Polygon } from "./Polygon";
import { StringTokenizer } from "./StringTokenizer";
import { Locale } from "./Locale";
import { EditInfo } from "./EditInfo";
import { WireRouter } from "./WireRouter";
import { XMLSerializer } from "./XMLSerializer";
import { XMLDeserializer } from "./XMLDeserializer";

export class DiodeElm extends CircuitElm {
    diode: Diode;
    static readonly FLAG_FWDROP = 1;
    static readonly FLAG_MODEL = 2;
    modelName: string;
    model: DiodeModel;
    static lastModelName: string = "default";
    hasResistance: boolean;
    diodeEndNode: number;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.modelName = DiodeElm.lastModelName;
            this.diode = new Diode(CircuitElm.sim);
            this.setup();
        } else {
            super(xa, ya, xb, yb!, f!);
            const defaultdrop = .805904783;
            this.diode = new Diode(CircuitElm.sim);
            let fwdrop = defaultdrop;
            const zvoltage = 0;
            if ((f! & DiodeElm.FLAG_MODEL) !== 0) {
                this.modelName = CustomLogicModel.unescape(st!.nextToken());
            } else {
                if ((f! & DiodeElm.FLAG_FWDROP) > 0) {
                    try {
                        fwdrop = parseFloat(st!.nextToken());
                    } catch (e) {}
                }
                this.model = DiodeModel.getModelWithParameters(fwdrop, zvoltage);
                this.modelName = this.model.name;
//	    CirSim.console("model name wparams = " + modelName);
            }
            this.setup();
        }
    }

    nonLinear(): boolean { return true; }

    setup(): void {
//	CirSim.console("setting up for model " + modelName + " " + model);
        this.model = DiodeModel.getModelWithNameOrCopy(this.modelName, this.model ?? null);
        this.modelName = this.model.name;   // in case we couldn't find that model
        this.diode.setup(this.model);
        this.hasResistance = (this.model.seriesResistance > 0);
        this.diodeEndNode = this.hasResistance ? 2 : 1;
        this.allocNodes();
    }

    getInternalNodeCount(): number { return this.hasResistance ? 1 : 0; }

    updateModels(): void {
        this.setup();
    }

    getDumpType(): number { return 'd'.charCodeAt(0); }

    dump(): string {
        this.flags |= DiodeElm.FLAG_MODEL;
        return super.dump() + " " + CustomLogicModel.escape(this.modelName);
    }

    dumpModel(): string | null {
        if (this.model.builtIn || this.model.dumped)
            return null;
        return this.model.dump();
    }

    dumpXmlModel(doc: Document): void {
        if (!(this.model.builtIn || this.model.dumped))
            this.model.dumpXml(doc);
    }

    dumpXml(doc: Document, elem: Element): void {
        if (!(this.model.builtIn || this.model.dumped))
            this.model.dumpXml(doc);
        super.dumpXml(doc, elem);
        XMLSerializer.dumpAttr(elem, "mo", this.modelName);
    }

    undumpXml(xml: XMLDeserializer): void {
        super.undumpXml(xml);
        this.modelName = xml.parseStringAttr("mo", this.modelName);
        this.setup();
    }

    readonly hs = 8;
    poly: Polygon;
    cathode: Point[];

    setPoints(): void {
        super.setPoints();
        this.calcLeads(16);
        this.cathode = this.newPointArray(2);
        const pa = this.newPointArray(2);
        this.interpPoint2(this.lead1!, this.lead2!, pa[0], pa[1], 0, this.hs);
        this.interpPoint2(this.lead1!, this.lead2!, this.cathode[0], this.cathode[1], 1, this.hs);
        this.poly = this.createPolygon(pa[0], pa[1], this.lead2!);
    }

    addRoutingObstacle(router: WireRouter): void { this.addRoutingObstacleWithLeads(router, this.hs); }

    draw(g: Graphics): void {
        this.drawDiode(g);
        this.doDots(g);
        this.drawPosts(g);
    }

    reset(): void {
        this.diode.reset();
        this.volts[0] = this.volts[1] = this.curcount = 0;
        if (this.hasResistance)
            this.volts[2] = 0;
    }

    drawDiode(g: Graphics): void {
        this.setBbox(this.point1, this.point2, this.hs);

        const v1 = this.volts[0];
        const v2 = this.volts[1];

        this.draw2Leads(g);

        // draw arrow thingy
        this.setVoltageColor(g, v1);
        this.setPowerColor(g, true);
        g.fillPolygon(this.poly);

        // draw thing arrow is pointing to
        this.setVoltageColor(g, v2);
        this.setPowerColor(g, true);
        CircuitElm.drawThickLine(g, this.cathode[0], this.cathode[1]);
    }

    stamp(): void {
        if (this.hasResistance) {
            // create diode from node 0 to internal node
            this.diode.stamp(this.nodes[0], this.nodes[2]);
            // create resistor from internal node to node 1
            CircuitElm.sim.stampResistor(this.nodes[1], this.nodes[2], this.model.seriesResistance);
        } else
            // don't need any internal nodes if no series resistance
            this.diode.stamp(this.nodes[0], this.nodes[1]);
    }

    doStep(): void {
        this.diode.doStep(this.volts[0] - this.volts[this.diodeEndNode]);
    }

    calculateCurrent(): void {
        this.current = this.diode.calculateCurrent(this.volts[0] - this.volts[this.diodeEndNode]);
    }

    getElmType(): string { return "diode"; }

    getInfo(arr: string[]): void {
        if (this.model.oldStyle)
            arr[0] = "diode";
        else
            arr[0] = Locale.LS("diode") + " (" + this.modelName + ")";
        arr[1] = "I = " + CircuitElm.getCurrentText(this.getCurrent());
        arr[2] = "Vd = " + CircuitElm.getVoltageText(this.getVoltageDiff());
        arr[3] = "P = " + CircuitElm.getUnitText(this.getPower(), "W");
        if (this.model.oldStyle)
            arr[4] = "Vf = " + CircuitElm.getVoltageText(this.model.fwdrop);
    }

    models: DiodeModel[];

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("Model", 0, -1, -1);
            this.models = DiodeModel.getModelList(this instanceof ZenerElm);
            ei.choice = { items: [] as string[], selectedIndex: 0, add: (s: string) => ei.choice.items.push(s), select: (i: number) => { ei.choice.selectedIndex = i; }, getSelectedIndex: () => ei.choice.selectedIndex };
            for (let i = 0; i !== this.models.length; i++) {
                const dm = this.models[i];
                ei.choice.add(dm.getDescription());
                if (dm === this.model)
                    ei.choice.select(i);
            }
            return ei;
        }
        if (n === 1) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.button = { label: Locale.LS("Create New Simple Model") };
            return ei;
        }
        if (n === 2) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.button = { label: Locale.LS("Create New Advanced Model") };
            return ei;
        }
        if (n === 3) {
            if (this.model.readOnly)
                return null;
            const ei = new EditInfo("", 0, -1, -1);
            ei.button = { label: Locale.LS("Edit Model") };
            return ei;
        }
        return null;
    }

    newModelCreated(dm: DiodeModel): void {
        this.model = dm;
        this.modelName = this.model.name;
        this.setup();
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.model = this.models[ei.choice.getSelectedIndex()];
            this.modelName = this.model.name;
            this.setup();
            ei.newDialog = true;
            return;
        }
        if (n === 1 || n === 2) {
            const newModel = new DiodeModel(this.model);
            newModel.setSimple(n === 1);
            if (newModel.isSimple())
                newModel.setForwardVoltage();
            // EditDiodeModelDialog not yet implemented
            return;
        }
        if (n === 3) {
            if (this.model.readOnly) {
                // probably never reached
                window.alert(Locale.LS("This model cannot be modified.  Change the model name to allow customization."));
                return;
            }
            if (this.model.isSimple())
                this.model.setForwardVoltage();
            // EditDiodeModelDialog not yet implemented
            return;
        }
    }

    getShortcut(): number { return 'd'.charCodeAt(0); }

    setLastModelName(n: string): void {
        DiodeElm.lastModelName = n;
    }

    stepFinished(): void {
        // stop for huge currents that make simulator act weird
        if (Math.abs(this.current) > 1e12)
            CircuitElm.sim.stop("max current exceeded", this);
    }
}

// Forward declaration to allow instanceof check in getEditInfo
// ZenerElm extends DiodeElm and will be defined in ZenerElm.ts
declare class ZenerElm extends DiodeElm {}
