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
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";
import { VoltageSource } from "./VoltageSource";
import { parseIntStrict } from "./NumberParse";

export class WattmeterElm extends CircuitElm {
    width: number = 0;
    voltSources: VoltageSource[];
    currents: number[];
    curcounts: number[];

    // Variables internas
    v: number = 0;   // tensión instantánea
    i: number = 0;   // corriente instantánea

    // Detección de cruce por cero
    private lastVoltage: number = 0;
    private firstZeroCross: boolean = true;

    // Acumuladores del periodo actual
    private currentPeriodEnergy: number = 0;
    private currentPeriodTime: number = 0;

    // Control de estado
    private periodsCompleted: number = 0;
    private detectedFrequency: number = 60;

    // Buffer circular de periodos
    private periodEnergies: number[] = [0, 0, 0, 0];
    private periodTimes: number[] = [0, 0, 0, 0];
    private bufferIndex: number = 0;
    private bufferFilled: boolean = false;

    averagePower: number = 0;

    posts: Point[];

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
        } else {
            super(xa, ya, xb, yb!, f!);
        }
        if (st !== undefined) {
            this.width = parseIntStrict(st.nextToken());
        }
        this.noDiagonal = false;
        this.setup();
    }

    setup(): void {
        this.voltSources = new Array(2);
        this.currents = [0, 0];
        this.curcounts = [0, 0];
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "w", this.width);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.width = xml.parseIntAttr("w", this.width);
        this.noDiagonal = false;
        this.setup();
    }

    getVoltageSourceCount(): number { return 1; }
    getDumpType(): number { return 420; }
    getPostCount(): number { return 4; }

    getPost(n: number): Point { return this.posts[n]; }

    stamp(): void {
        // Fuente de tensión 0V entre bornes de corriente (para medir I)
        CircuitElm.sim.stampVoltageSource(this.nodes[2], this.nodes[3], this.voltSource!, 0);

        // Resistencia alta entre bornes de tensión (para medir V)
        CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[1], 1e9);
    }

    setVoltageSource(n: number, vs: VoltageSource): void {
        this.voltSource = vs;
        this.voltSources[1] = vs;   // esta rama (nodos 2-3) corresponde a currents[1]
    }

    drag(xx: number, yy: number): void {
        xx = this.snapGrid(xx);
        yy = this.snapGrid(yy);

        // Mantener la posición original como referencia
        this.x2 = xx;
        this.y2 = yy;

        this.setPoints();
    }

    setPoints(): void {
        super.setPoints();

        if (this.posts === undefined || this.posts.length < 4)
            this.posts = new Array(4);

        const gs = CircuitElm.app.gridSize;
        const minSize = 4 * gs;

        // Calcular dimensiones del rectángulo
        let dx = this.point2.x - this.point1.x;
        let dy = this.point2.y - this.point1.y;

        // Aplicar tamaño mínimo manteniendo la dirección del arrastre
        if (Math.abs(dx) < minSize)
            dx = (dx >= 0) ? minSize : -minSize;
        if (Math.abs(dy) < minSize)
            dy = (dy >= 0) ? minSize : -minSize;

        // Actualizar point2 con las dimensiones mínimas aplicadas
        this.point2 = new Point(this.point1.x + dx, this.point1.y + dy);

        // Coordenadas del rectángulo normalizado
        const x1 = Math.min(this.point1.x, this.point2.x);
        const y1 = Math.min(this.point1.y, this.point2.y);
        let rx2 = Math.max(this.point1.x, this.point2.x);
        let ry2 = Math.max(this.point1.y, this.point2.y);

        // Dimensiones múltiplos de 2*gs para tener centro exacto
        let w = rx2 - x1;
        let h = ry2 - y1;

        if (w % (2 * gs) !== 0)
            rx2 = x1 + Math.trunc((w + gs - 1) / (2 * gs)) * (2 * gs);
        if (h % (2 * gs) !== 0)
            ry2 = y1 + Math.trunc((h + gs - 1) / (2 * gs)) * (2 * gs);

        w = rx2 - x1;
        h = ry2 - y1;

        // Centro del rectángulo (ajustado a rejilla)
        const cx = this.snapGrid(x1 + Math.trunc(w / 2));
        const cy = this.snapGrid(y1 + Math.trunc(h / 2));

        const right = dx >= 0;
        const down = dy >= 0;

        // Asignar posts según cuadrante
        if (right && down) {
            // Cuadrante I: derecha-abajo
            this.posts[0] = new Point(cx, y1);  // V+ arriba
            this.posts[1] = new Point(cx, ry2); // V- abajo
            this.posts[2] = new Point(x1, cy);  // I+ izquierda
            this.posts[3] = new Point(rx2, cy); // I- derecha
        } else if (right && !down) {
            // Cuadrante II: derecha-arriba
            this.posts[0] = new Point(x1, cy);  // V+ izquierda
            this.posts[1] = new Point(rx2, cy); // V- derecha
            this.posts[2] = new Point(cx, ry2); // I+ abajo
            this.posts[3] = new Point(cx, y1);  // I- arriba
        } else if (!right && down) {
            // Cuadrante III: izquierda-abajo
            this.posts[0] = new Point(rx2, cy); // V+ derecha
            this.posts[1] = new Point(x1, cy);  // V- izquierda
            this.posts[2] = new Point(cx, y1);  // I+ arriba
            this.posts[3] = new Point(cx, ry2); // I- abajo
        } else {
            // Cuadrante IV: izquierda-arriba
            this.posts[0] = new Point(cx, ry2); // V+ abajo
            this.posts[1] = new Point(cx, y1);  // V- arriba
            this.posts[2] = new Point(rx2, cy); // I+ derecha
            this.posts[3] = new Point(x1, cy);  // I- izquierda
        }

        const bx2 = x1 + (cx - x1) * 2 + 8;
        const by2 = y1 + (cy - y1) * 2 + 8;

        this.setBbox(x1, y1, bx2, by2);
    }

    draw(g: Graphics): void {
        const cx = Math.trunc((this.posts[0].x + this.posts[1].x) / 2);
        const cy = Math.trunc((this.posts[2].y + this.posts[3].y) / 2);
        const r = 12;

        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        CircuitElm.drawThickCircle(g, cx, cy, r);

        g.setColor(CircuitElm.whiteColor);
        this.drawCenteredText(g, "W", cx, cy, true);

        // Cuadrante según la posición de point2 respecto a point1
        const dx = this.point2.x - this.point1.x;
        const dy = this.point2.y - this.point1.y;

        let currentLabelX: number, currentLabelY: number;
        let voltageLabelX: number, voltageLabelY: number;

        if (dx >= 0 && dy >= 0) {
            // Cuadrante I: derecha-abajo - i+ izquierda, v+ arriba
            currentLabelX = cx - r - 8;
            currentLabelY = cy - 8;
            voltageLabelX = cx + 8;
            voltageLabelY = cy - r - 8;
        } else if (dx >= 0 && dy < 0) {
            // Cuadrante II: derecha-arriba - v+ izquierda, i+ abajo
            currentLabelX = cx - 8;
            currentLabelY = cy + r + 8;
            voltageLabelX = cx - r - 8;
            voltageLabelY = cy - 8;
        } else if (dx < 0 && dy >= 0) {
            // Cuadrante III: izquierda-abajo - v+ derecha, i+ arriba
            currentLabelX = cx + 8;
            currentLabelY = cy - r - 8;
            voltageLabelX = cx + r + 8;
            voltageLabelY = cy - 8;
        } else {
            // Cuadrante IV: izquierda-arriba - i+ derecha, v+ abajo
            currentLabelX = cx + r + 8;
            currentLabelY = cy - r + 4;
            voltageLabelX = cx - 8;
            voltageLabelY = cy + r + 8;
        }

        this.drawCenteredText(g, "i+", currentLabelX, currentLabelY, true);
        this.drawCenteredText(g, "v+", voltageLabelX, voltageLabelY, true);

        // Posición de la etiqueta de potencia
        let powerLabelY = cy + 12;
        if (dx < 0 && dy < 0)
            powerLabelY = cy + 16;
        this.drawCenteredText(g, CircuitElm.getUnitText(this.averagePower, "W"), cx + 10, powerLabelY, false);

        g.setColor(CircuitElm.lightGrayColor);

        // Líneas de conexión desde los posts hasta el círculo
        for (let k = 0; k < 4; k++) {
            const post = this.posts[k];
            let lineX = cx;
            let lineY = cy;

            if (post.x < cx) lineX = cx - r;
            else if (post.x > cx) lineX = cx + r;
            if (post.y < cy) lineY = cy - r;
            else if (post.y > cy) lineY = cy + r;

            CircuitElm.drawThickLine(g, post.x, post.y, lineX, lineY);
        }

        for (let k = 0; k < 4; k++)
            CircuitElm.drawPost(g, this.posts[k]);
    }

    reset(): void {
        super.reset();

        // Reiniciar variables de medición de energía
        this.currentPeriodEnergy = 0;
        this.currentPeriodTime = 0;

        // Reiniciar buffers de periodos
        this.periodEnergies = [0, 0, 0, 0];
        this.periodTimes = [0, 0, 0, 0];
        this.bufferIndex = 0;
        this.bufferFilled = false;

        // Reiniciar detección de cruce por cero
        this.lastVoltage = 0;
        this.firstZeroCross = true;

        // Reiniciar contadores y estado
        this.periodsCompleted = 0;
        this.detectedFrequency = 60;

        // Reiniciar potencia promedio
        this.averagePower = 0;

        // Reiniciar mediciones instantáneas
        this.v = 0;
        this.i = 0;
    }

    doStep(): void {
        const timeStep = CircuitElm.sim.timeStep;

        const voltage = this.getVoltageDiff();
        const current = this.getCurrent();
        const instantPower = voltage * current;

        // Acumular energía y tiempo del periodo actual
        this.currentPeriodEnergy += instantPower * timeStep;
        this.currentPeriodTime += timeStep;

        const sobrepasado = (this.currentPeriodTime > 0.05); // ojo al periodo

        // Detectar cruce por cero (de negativo a positivo)
        if ((this.lastVoltage <= 0 && voltage > 0) || sobrepasado) {

            if (!this.firstZeroCross || sobrepasado) {
                // Frecuencia del periodo completado
                const periodDuration = this.currentPeriodTime;
                this.detectedFrequency = 1.0 / periodDuration;

                // Validar frecuencia dentro de rangos razonables
                if ((this.detectedFrequency >= 10 && this.detectedFrequency <= 5000) || sobrepasado) {
                    // Almacenar el periodo actual en el buffer circular
                    this.periodEnergies[this.bufferIndex] = this.currentPeriodEnergy;
                    this.periodTimes[this.bufferIndex] = this.currentPeriodTime;

                    this.bufferIndex = (this.bufferIndex + 1) % 4;
                    if (this.bufferIndex === 0)
                        this.bufferFilled = true;

                    // Calcular promedio cada 2 periodos
                    if (this.periodsCompleted >= 1 && this.periodsCompleted % 2 === 1) {
                        let totalEnergy = 0;
                        let totalTime = 0;
                        const periodsToAverage = this.bufferFilled ? 4 : this.bufferIndex;

                        for (let k = 0; k < periodsToAverage; k++) {
                            totalEnergy += this.periodEnergies[k];
                            totalTime += this.periodTimes[k];
                        }

                        this.averagePower = totalEnergy / totalTime;
                    }

                    this.periodsCompleted++;
                }
            } else {
                // Primer cruce por cero - solo inicializar
                this.firstZeroCross = false;
            }

            // Reiniciar acumuladores para el nuevo periodo
            this.currentPeriodEnergy = 0;
            this.currentPeriodTime = 0;
        }
        this.lastVoltage = voltage;
    }

    getPower(): number { return this.getVoltageDiff() * this.getCurrentIntoNode(2); }

    setCurrent(vs: VoltageSource, c: number): void {
        // si es la fuente de la rama 2-3, guarda en currents[1]; si no, currents[0]
        this.currents[vs === this.voltSources[1] ? 1 : 0] = c;
    }

    getCurrentIntoNode(n: number): number {
        // pares (0,1)->currents[0]; (2,3)->currents[1]
        if (n % 2 === 0) return this.currents[Math.trunc(n / 2)];
        else return -this.currents[Math.trunc(n / 2)];
    }

    getConnection(n1: number, n2: number): boolean { return Math.trunc(n1 / 2) === Math.trunc(n2 / 2); }
    hasGroundConnection(n1: number): boolean { return false; }

    getInfo(arr: string[]): void {
        arr[0] = "Wattmeter";

        const v = this.getVoltageDiff();
        const i = this.getCurrent();
        const pinst = v * i;

        arr[1] = "V = " + CircuitElm.getVoltageText(v);
        arr[2] = "I = " + CircuitElm.getCurrentText(i);
        arr[3] = "Pinst = " + CircuitElm.getUnitText(pinst, "W");
        arr[4] = "Pavg = " + CircuitElm.getUnitText(this.averagePower, "W");
    }

    canViewInScope(): boolean { return true; }
    getCurrent(): number { return this.currents[1]; }
    getVoltageDiff(): number { return this.nodes[0].v - this.nodes[1].v; }

    canFlipX(): boolean { return false; }
    canFlipY(): boolean { return false; }
}