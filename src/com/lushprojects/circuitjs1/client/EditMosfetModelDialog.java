package com.lushprojects.circuitjs1.client;

public class EditMosfetModelDialog extends EditDialog {

    MosfetModel model;
    MosfetElm mosfetElm;

    public EditMosfetModelDialog(MosfetModel mm, CirSim f, MosfetElm me) {
	super(mm, f);
	model = mm;
	mosfetElm = me;
	applyButton.removeFromParent();
    }

    void apply() {
	super.apply();
	if (model.name == null || model.name.length() == 0)
	    model.pickName();
	if (mosfetElm != null)
	    mosfetElm.newModelCreated(model);
    }

    public void closeDialog() {
	super.closeDialog();
	EditDialog edlg = CirSim.editDialog;
	CirSim.console("resetting dialog " + edlg);
	if (edlg != null)
	    edlg.resetDialog();
	CirSim.mosfetModelEditDialog = null;
    }
}
