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
import { RelayModel } from "./RelayModel";
import type { RelayElm } from "./RelayElm";

export class EditRelayModelDialog extends EditDialog {
    model: RelayModel;
    relayElm: RelayElm | null;

    constructor(rm: RelayModel, f: CirSim, re: RelayElm | null) {
        super(rm, f);
        this.model = rm;
        this.relayElm = re;
        this.applyButton.remove();
    }

    apply(): boolean {
        if (!super.apply())
            return false;
        if (this.model.name === null || this.model.name.length === 0)
            this.model.pickName();
        if (this.relayElm !== null)
            this.relayElm.newModelCreated(this.model);
        return true;
    }

    closeDialog(): void {
        super.closeDialog();
        const edlg = CirSim.editDialog;
        if (edlg !== null)
            edlg.resetDialog();
        CirSim.relayModelEditDialog = null;
    }
}
