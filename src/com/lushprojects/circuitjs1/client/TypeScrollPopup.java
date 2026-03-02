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

import com.google.gwt.user.client.ui.HasHorizontalAlignment;
import com.google.gwt.dom.client.NativeEvent;
import com.google.gwt.event.dom.client.MouseDownEvent;
import com.google.gwt.event.dom.client.MouseDownHandler;
import com.google.gwt.user.client.ui.PopupPanel;
import com.google.gwt.user.client.ui.VerticalPanel;
import com.google.gwt.user.client.ui.Label;
import com.google.gwt.event.dom.client.MouseOutEvent;
import com.google.gwt.event.dom.client.MouseOutHandler;
import com.google.gwt.event.dom.client.MouseWheelEvent;
import com.google.gwt.event.dom.client.MouseWheelHandler;

import com.lushprojects.circuitjs1.client.util.Locale;

// Popup for toggling MOSFET/Transistor type on scroll wheel,
// similar to ScrollValuePopup for R/C/L values.
public class TypeScrollPopup extends PopupPanel implements MouseOutHandler, MouseWheelHandler,
	MouseDownHandler {

	CircuitElm myElm;
	CirSim sim;
	int originalPnp;
	int currentPnp;
	Label typeLabel;
	VerticalPanel vp;
	double deltaY;

	TypeScrollPopup(final int x, final int y, int dy, CircuitElm e, CirSim s) {
		super();
		myElm = e;
		sim = s;
		deltaY = 0;
		sim.undoManager.pushUndo();

		if (e instanceof MosfetElm)
			originalPnp = ((MosfetElm) e).pnp;
		else if (e instanceof TransistorElm)
			originalPnp = ((TransistorElm) e).pnp;
		currentPnp = originalPnp;

		vp = new VerticalPanel();
		setWidget(vp);
		Label header = new Label(getHeaderText());
		header.addStyleDependentName("2off");
		vp.add(header);
		typeLabel = new Label();
		typeLabel.setHorizontalAlignment(HasHorizontalAlignment.ALIGN_CENTER);
		typeLabel.addStyleDependentName("selected");
		vp.add(typeLabel);
		updateLabel();

		doDeltaY(dy);

		this.addDomHandler(this, MouseOutEvent.getType());
		this.addDomHandler(this, MouseWheelEvent.getType());
		this.addDomHandler(this, MouseDownEvent.getType());
		setPopupPositionAndShow(new PopupPanel.PositionCallback() {
			public void setPosition(int offsetWidth, int offsetHeight) {
				int left = Math.max(0, (x - offsetWidth / 4));
				int top = Math.max(0, y - offsetHeight / 2);
				setPopupPosition(left, top);
			}
		});
	}

	String getHeaderText() {
		if (myElm instanceof MosfetElm) {
			if (myElm instanceof JfetElm)
				return Locale.LS("JFET Type");
			return Locale.LS("MOSFET Type");
		}
		return Locale.LS("Transistor Type");
	}

	public void doDeltaY(int dy) {
		deltaY += dy;
		// toggle on every 30px of scroll (similar to ScrollValuePopup sensitivity)
		while (deltaY >= 30) {
			deltaY -= 30;
			toggle();
		}
		while (deltaY <= -30) {
			deltaY += 30;
			toggle();
		}
	}

	void toggle() {
		if (myElm instanceof MosfetElm) {
			MosfetElm m = (MosfetElm) myElm;
			m.pnp = -m.pnp;
			m.flags ^= m.FLAG_PNP;
			m.setPoints();
			currentPnp = m.pnp;
		} else if (myElm instanceof TransistorElm) {
			TransistorElm t = (TransistorElm) myElm;
			t.pnp = -t.pnp;
			t.setPoints();
			currentPnp = t.pnp;
		}
		sim.needAnalyze();
		updateLabel();
	}

	void updateLabel() {
		String text;
		if (myElm instanceof MosfetElm) {
			if (myElm instanceof JfetElm)
				text = (currentPnp == -1) ? Locale.LS("P-Channel JFET") : Locale.LS("N-Channel JFET");
			else
				text = (currentPnp == -1) ? Locale.LS("P-Channel") : Locale.LS("N-Channel");
		} else {
			text = (currentPnp == -1) ? "PNP" : "NPN";
		}
		typeLabel.setText(text);
	}

	public void close(boolean keepChanges) {
		if (!keepChanges) {
			// revert to original state
			while (currentPnp != originalPnp)
				toggle();
		}
		this.hide();
		CirSim.typeScrollPopup = null;
	}

	public void onMouseOut(MouseOutEvent e) {
		close(true);
	}

	public void onMouseWheel(MouseWheelEvent e) {
		e.preventDefault();
		doDeltaY(e.getDeltaY());
	}

	public void onMouseDown(MouseDownEvent e) {
		if (e.getNativeButton() == NativeEvent.BUTTON_LEFT || e.getNativeButton() == NativeEvent.BUTTON_MIDDLE)
			close(true);
		else
			close(false);
	}
}
