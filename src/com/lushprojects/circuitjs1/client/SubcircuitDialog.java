package com.lushprojects.circuitjs1.client;

import com.google.gwt.core.client.GWT;
import com.google.gwt.event.dom.client.ClickEvent;
import com.google.gwt.event.dom.client.ClickHandler;
import com.google.gwt.user.client.Window;
import com.google.gwt.user.client.ui.*;
import com.google.gwt.user.client.ui.DialogBox;

import java.util.ArrayList;
import java.util.List;
import java.util.Vector;

public class SubcircuitDialog extends Dialog {

    private VerticalPanel mainPanel;
    private ListBox subcircuitListBox;
    private Button deleteButton;
    private Button doneButton;

    private Vector<CustomCompositeModel> subcircuits;

    public SubcircuitDialog(CirSim sim) {
        setText("Subcircuit Manager");
        //setAnimationEnabled(true);
        setGlassEnabled(true);

        mainPanel = new VerticalPanel();
        mainPanel.setSpacing(10);
	mainPanel.setWidth("400px");
	//mainPanel.setHeight("400px");

        //Label selectLabel = new Label("Select a subcircuit to delete:");
        //mainPanel.add(selectLabel);

        subcircuitListBox = new ListBox();
        subcircuitListBox.setVisibleItemCount(5);
        subcircuitListBox.setWidth("100%");

	subcircuits = CustomCompositeModel.getModelList();
	subcircuits.removeIf(CustomCompositeModel::isBuiltin);
	int i;
	for (i = 0; i != subcircuits.size(); i++) {
	    String name = subcircuits.get(i).name;
	    subcircuitListBox.addItem(name);
	}

        mainPanel.add(subcircuitListBox);

        deleteButton = new Button("Delete");
        deleteButton.addClickHandler(new ClickHandler() {
            @Override
            public void onClick(ClickEvent event) {
                handleDelete();
            }
        });
        mainPanel.add(deleteButton);

        doneButton = new Button("Done");
        doneButton.addClickHandler(new ClickHandler() {
            @Override
            public void onClick(ClickEvent event) {
                hide();
            }
        });
        mainPanel.add(doneButton);

        setWidget(mainPanel);
	this.center();
    }

    private void handleDelete() {
        int selectedIndex = subcircuitListBox.getSelectedIndex();
        if (selectedIndex == -1) {
            Window.alert("Please select a subcircuit to delete.");
            return;
        }

        String selectedSubcircuit = subcircuitListBox.getItemText(selectedIndex);
        boolean confirm = Window.confirm("Are you sure you want to delete " + selectedSubcircuit + "?");

        if (confirm) {
	    CustomCompositeModel model = subcircuits.get(selectedIndex);
            subcircuits.remove(model);
	    model.remove();
            subcircuitListBox.removeItem(selectedIndex);
        }
    }
}

