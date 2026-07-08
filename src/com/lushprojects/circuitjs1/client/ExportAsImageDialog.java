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

import java.util.Date;
import com.google.gwt.user.client.ui.HasHorizontalAlignment;
import com.google.gwt.user.client.ui.HorizontalPanel;
import com.google.gwt.user.client.ui.Anchor;
import com.google.gwt.user.client.ui.Button;
import com.google.gwt.user.client.ui.VerticalPanel;
import com.lushprojects.circuitjs1.client.util.Locale;
import com.google.gwt.event.dom.client.ClickHandler;
import com.google.gwt.dom.client.Element;
import com.google.gwt.event.dom.client.ClickEvent;
import com.google.gwt.user.client.ui.Label;
import com.google.gwt.user.client.ui.TextBox;
import com.google.gwt.i18n.client.DateTimeFormat;

public class ExportAsImageDialog extends Dialog {

	VerticalPanel vp;
	TextBox textBox;
	String dataURL;
	String ext;

	private static native String b64encode(String a) /*-{
	  // string may have unicode text strings in it, so we don't just call btoa()
	  return window.btoa(unescape(encodeURIComponent(a)));
	}-*/;

	static native void click(Element elem) /*-{
	    elem.click();
	}-*/;

	public ExportAsImageDialog(int type) {
		super();
		Button okButton, cancelButton;
		vp=new VerticalPanel();
		setWidget(vp);
		setText(Locale.LS("Save as Image"));
		vp.add(new Label(Locale.LS("File name:")));
		textBox = new TextBox();
		textBox.setWidth("250px");
		vp.add(textBox);
		ext = ".png";
		if (type == ImageExporter.CAC_IMAGE) {
		    dataURL = CirSim.theApp.imageExporter.getCircuitAsCanvas(type).toDataUrl();
		} else {
		    String data = CirSim.theApp.imageExporter.getCircuitAsSVG();
		    dataURL = "data:text/plain;base64," + b64encode(data);
		    ext = ".svg";
		}
		textBox.setText(ImageExporter.defaultFileName(ext));

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
			    apply();
			    closeDialog();
			}
		});
		cancelButton.addClickHandler(new ClickHandler() {
			public void onClick(ClickEvent event) {
				closeDialog();
			}
		});
		this.center();
	}

	boolean apply() {
	    String fname = textBox.getText();
	    if (!fname.contains("."))
		fname += ext;
	    Anchor a = new Anchor(fname, dataURL);
	    a.getElement().setAttribute("Download", fname);
	    vp.add(a);
	    click(a.getElement());
	    return true;
	}
}
