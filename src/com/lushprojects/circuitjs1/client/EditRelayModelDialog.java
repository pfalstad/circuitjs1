package com.lushprojects.circuitjs1.client;

public class EditRelayModelDialog extends EditDialog {

    RelayModel model;
    RelayElm relayElm;

    public EditRelayModelDialog(RelayModel rm, CirSim f, RelayElm re) {
	super(rm, f);
	model = rm;
	relayElm = re;
	applyButton.removeFromParent();
    }

    boolean apply() {
	if (!super.apply())
	    return false;
	if (model.name == null || model.name.length() == 0)
	    model.pickName();
	if (relayElm != null)
	    relayElm.newModelCreated(model);
	return true;
    }

    public void closeDialog() {
	super.closeDialog();
	EditDialog edlg = CirSim.editDialog;
	if (edlg != null)
	    edlg.resetDialog();
	CirSim.relayModelEditDialog = null;
    }
}
