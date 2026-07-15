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

package com.lushprojects.circuitjs1.client;

import com.google.gwt.user.client.ui.FlexTable;
import com.google.gwt.user.client.ui.HasHorizontalAlignment;
import com.google.gwt.user.client.ui.HorizontalPanel;
import com.google.gwt.user.client.ui.TextArea;
import com.google.gwt.user.client.ui.TextBox;
import com.google.gwt.user.client.ui.Button;
import com.google.gwt.user.client.ui.VerticalPanel;
import com.lushprojects.circuitjs1.client.util.Locale;
import com.google.gwt.event.dom.client.ClickHandler;
import com.google.gwt.event.dom.client.KeyDownHandler;
import com.google.gwt.event.dom.client.KeyDownEvent;
import com.google.gwt.event.dom.client.KeyPressHandler;
import com.google.gwt.event.dom.client.KeyPressEvent;
import com.google.gwt.event.dom.client.KeyCodes;

import java.util.HashMap;
import java.util.Vector;

import com.google.gwt.event.dom.client.ClickEvent;
import com.google.gwt.user.client.ui.ScrollPanel;

public class ShortcutsDialog extends Dialog {

	VerticalPanel vp;
	CirSim sim;
	TextArea textArea;
	Vector<TextBox> textBoxes;
	Vector<String> shortcuts;
	Button okButton;
	UIManager ui;

	public ShortcutsDialog(CirSim asim) {
		super();
		sim = asim;
		ui = sim.ui;
		Button cancelButton;
		vp=new VerticalPanel();
		setWidget(vp);
		ScrollPanel sp = new ScrollPanel();
		vp.add(sp);
		sp.setHeight("400px");
		sp.setAlwaysShowScrollBars(true);
		setText(Locale.LS("Edit Shortcuts"));
		textBoxes = new Vector<TextBox>();
		shortcuts = new Vector<String>();

		FlexTable table = new FlexTable();
		sp.add(table);
		int i;
		for (i = 0; i != asim.ui.mainMenuItems.size(); i++) {
		    CheckboxMenuItem item = ui.mainMenuItems.get(i);
		    if (item.getShortcut().length() > 1)
			break;
		    table.setText(i, 0, item.getName());
		    final int row = i;
		    final TextBox text = new TextBox();
		    text.setReadOnly(true);
		    text.setText(KeyNames.displayText(item.getShortcut()));
		    shortcuts.add(item.getShortcut());
		    text.addKeyDownHandler(new KeyDownHandler() {
			public void onKeyDown(KeyDownEvent ev) {
			    int keyCode = ev.getNativeKeyCode();
			    int placeholder = KeyNames.keyCodeToPlaceholder(keyCode, ev.isShiftKeyDown(),
				    ev.isControlKeyDown(), ev.isAltKeyDown(), ev.isMetaKeyDown());
			    if (placeholder >= 0) {
				ev.preventDefault();
				setRowShortcut(row, text, String.valueOf((char) placeholder));
			    } else if (keyCode == KeyCodes.KEY_BACKSPACE || keyCode == KeyCodes.KEY_DELETE) {
				ev.preventDefault();
				setRowShortcut(row, text, "");
			    }
			}
		    });
		    text.addKeyPressHandler(new KeyPressHandler() {
			public void onKeyPress(KeyPressEvent ev) {
			    ev.preventDefault();
			    char cc = ev.getCharCode();
			    if (cc > 32 && cc < 127)
				setRowShortcut(row, text, String.valueOf(cc));
			}
		    });
		    table.setWidget(i, 1, text);
		    textBoxes.add(text);
		    Button clearButton = new Button(Locale.LS("Clear"));
		    clearButton.addClickHandler(new ClickHandler() {
			public void onClick(ClickEvent ev) {
			    setRowShortcut(row, text, "");
			}
		    });
		    table.setWidget(i, 2, clearButton);
		}

		HorizontalPanel hp = new HorizontalPanel();
		hp.setWidth("100%");
		hp.setHorizontalAlignment(HasHorizontalAlignment.ALIGN_LEFT);
		hp.setStyleName("topSpace");
		vp.add(hp);
		hp.add(okButton = new Button(Locale.LS("OK")));
		hp.setHorizontalAlignment(HasHorizontalAlignment.ALIGN_RIGHT);
		hp.add(cancelButton = new Button(Locale.LS("Cancel")));
		okButton.addClickHandler(new ClickHandler() {
			public void onClick(ClickEvent event) {
			    enterPressed();
			}
		});
		cancelButton.addClickHandler(new ClickHandler() {
			public void onClick(ClickEvent event) {
				closeDialog();
			}
		});
		this.center();
	}

	void setRowShortcut(int row, TextBox text, String shortcut) {
	    shortcuts.set(row, shortcut);
	    text.setText(KeyNames.displayText(shortcut));
	    checkForDuplicates();
	}

	public void enterPressed() {
	    int i;
	    if (checkForDuplicates())
		return;
	    // clear existing shortcuts
	    sim.shortcuts.clear();
	    // load new ones
	    for (i = 0; i != shortcuts.size(); i++) {
		String str = shortcuts.get(i);
		CheckboxMenuItem item = ui.mainMenuItems.get(i);
		item.setShortcut(str);
		if (str.length() > 0)
		    sim.shortcuts.put((int) str.charAt(0), ui.mainMenuItemNames.get(i));
	    }
	    // save to local storage
	    sim.saveShortcuts();
	    closeDialog();
	}

	boolean checkForDuplicates() {
	    HashMap<Character,TextBox> boxForShortcut = new HashMap<Character,TextBox>();
	    boolean result = false;
	    int i;
	    for (i = 0; i != textBoxes.size(); i++) {
		TextBox box = textBoxes.get(i);
		String str = shortcuts.get(i);
		if (str.length() == 0) {
		    box.getElement().getStyle().setColor("black");
		    continue;
		}
		Character c = str.charAt(0);

		// check for duplicates and mark them
		TextBox other = boxForShortcut.get(c);
		if (other != null) {
		    box.getElement().getStyle().setColor("red");
		    other.getElement().getStyle().setColor("red");
		    result = true;
		} else
		    box.getElement().getStyle().setColor("black");

		boxForShortcut.put(c, box);
	    }
	    okButton.setEnabled(!result);
	    return result;
	}
}
