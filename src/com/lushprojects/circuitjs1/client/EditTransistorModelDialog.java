package com.lushprojects.circuitjs1.client;

public class EditTransistorModelDialog extends EditDialog {

    TransistorModel model;
    TransistorElm transistorElm;
    
    public EditTransistorModelDialog(TransistorModel dm, CirSim f, TransistorElm te) {
	super(dm, f);
	model = dm;
        transistorElm = te;
	applyButton.removeFromParent();
    }

    boolean apply() {
	super.apply();
//	if (model.name == null || model.name.length() == 0)
//	    model.pickName();
	if (transistorElm != null)
	    transistorElm.newModelCreated(model);
	return true;
    }
    
    public void closeDialog() {
	super.closeDialog();
	EditDialog edlg = CirSim.editDialog;
	CirSim.console("resetting dialog " + edlg);
	if (edlg != null)
	    edlg.resetDialog();	
	CirSim.diodeModelEditDialog = null;
    }
}
