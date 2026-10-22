import { DarlingtonElm } from "./DarlingtonElm";

export class PDarlingtonElm extends DarlingtonElm {
    constructor(xx: number, yy: number) { super(xx, yy, true); }
    getDumpClass(): Function { return DarlingtonElm; }
}
