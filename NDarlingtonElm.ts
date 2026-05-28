import { DarlingtonElm } from "./DarlingtonElm";

export class NDarlingtonElm extends DarlingtonElm {
    constructor(xx: number, yy: number) { super(xx, yy, false); }
    getDumpClass(): Function { return DarlingtonElm; }
}
