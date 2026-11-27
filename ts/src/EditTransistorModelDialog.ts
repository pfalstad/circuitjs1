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

import { EditDialog } from "./EditDialog";
import { CirSim } from "./CirSim";
import { TransistorModel } from "./TransistorModel";
import type { TransistorElm } from "./TransistorElm";

export class EditTransistorModelDialog extends EditDialog {
    model: TransistorModel;
    transistorElm: TransistorElm | null;

    constructor(dm: TransistorModel, f: CirSim, te: TransistorElm | null) {
        super(dm, f);
        this.model = dm;
        this.transistorElm = te;
        this.applyButton.remove();
    }

    apply(): boolean {
        if (!super.apply())
            return false;
        if (this.model.name === null || this.model.name.length === 0)
            this.model.pickName();
        if (this.transistorElm !== null)
            this.transistorElm.newModelCreated(this.model);
        return true;
    }

    closeDialog(): void {
        super.closeDialog();
        const edlg = CirSim.editDialog;
        CirSim.console("resetting dialog " + edlg);
        if (edlg !== null)
            edlg.resetDialog();
        // matches upstream Java, which also clears diodeModelEditDialog here rather than
        // transistorModelEditDialog (see EditTransistorModelDialog.java)
        CirSim.diodeModelEditDialog = null;
    }
}
