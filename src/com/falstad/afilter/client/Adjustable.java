package com.falstad.afilter.client;

import java.util.Vector;

import com.google.gwt.user.client.Command;
import com.google.gwt.user.client.ui.Label;
import com.google.gwt.xml.client.Document;
import com.google.gwt.xml.client.Element;

// values with sliders
public class Adjustable implements Command {
    CircuitElm elm;
    double minValue, maxValue;
    double sliderStep; // step increment; 0 = continuous (no stepping)
    int flags;
    String sliderText;
    boolean logarithmic;

    // null if this Adjustable has its own slider, non-null if it's sharing another one.
    Adjustable sharedSlider;

    final int FLAG_SHARED = 1;
    final int FLAG_LOG = 2;
    
    // index of value in getEditInfo() list that this slider controls
    int editItem;
    
    Label label;
    Scrollbar slider;
    boolean settingValue;
    
    Adjustable(CircuitElm ce, int item) {
	minValue = 1;
	maxValue = 1000;
	flags = 0;
	elm = ce;
	editItem = item;
        EditInfo ei = ce.getEditInfo(editItem);
        if (ei != null && ei.maxval > 0) {
            minValue = ei.minval;
            maxValue = ei.maxval;
        }
    }

    boolean createSlider(CirSim sim) {
	if (elm == null)
	    return false;
	EditInfo ei = elm.getEditInfo(editItem);
	if (ei == null)
	    return false;
	if (sharedSlider != null)
	    return true;
	if (sliderText.length() == 0)
	    return false;
	double value = ei.value;
	createSlider(sim, value);
	return true;
    }

    void createSlider(CirSim sim, double value) {
        sim.addWidgetToVerticalPanel(label = new Label(sliderText));
        label.addStyleName("topSpace");
        int intValue = valueToSliderPosition(value);
        sim.addWidgetToVerticalPanel(slider = new Scrollbar(Scrollbar.HORIZONTAL, intValue, 1, 0, 101, this, elm));
        slider.setStepSize(sliderStep * 100 / (maxValue - minValue));
    }

    void setSliderValue(double value) {
	if (sharedSlider != null) {
	    sharedSlider.setSliderValue(value);
	    return;
	}
        int intValue = valueToSliderPosition(value);
        settingValue = true; // don't recursively set value again in execute()
        slider.setValue(intValue);
        settingValue = false;
    }
    
    public void execute() {
	if (settingValue)
	    return;
	int i;
	CirSim sim = CircuitElm.sim;
	for (i = 0; i != sim.adjustables.size(); i++) {
	    Adjustable adj = sim.adjustables.get(i);
	    if (adj == this || adj.sharedSlider == this)
		adj.executeSlider();
	}
    }
    
    void executeSlider() {
	EditInfo ei = elm.getEditInfo(editItem);
	ei.value = getSliderValue();
	elm.setEditValue(editItem, ei);
	CircuitElm.sim.editPerformed(elm);
    }
    
    double getSliderValue() {
	double val = sharedSlider == null ? slider.getValue() : sharedSlider.slider.getValue();
	double result = sliderPositionToValue(val);
	double step = sharedSlider != null ? sharedSlider.sliderStep : sliderStep;
	if (step > 0)
	    result = minValue + Math.round((result - minValue) / step) * step;
	return result;
    }

    // convert a value to a slider position (0-100)
    int valueToSliderPosition(double value) {
	if (logarithmic && minValue > 0) {
	    double logMin = Math.log(minValue);
	    double logMax = Math.log(maxValue);
	    return (int) ((Math.log(value) - logMin) / (logMax - logMin) * 100);
	}
	return (int) ((value - minValue) * 100 / (maxValue - minValue));
    }

    // convert a slider position (0-100) to a value
    double sliderPositionToValue(double pos) {
	if (logarithmic && minValue > 0) {
	    double logMin = Math.log(minValue);
	    double logMax = Math.log(maxValue);
	    return Math.exp(logMin + (logMax - logMin) * pos / 100);
	}
	return minValue + (maxValue - minValue) * pos / 100;
    }
    
    void deleteSlider(CirSim sim) {
	try {
	    sim.removeWidgetFromVerticalPanel(label);
	    sim.removeWidgetFromVerticalPanel(slider);
	} catch (Exception e) {}
    }
    
    void setMouseElm(CircuitElm e) {
	if (slider != null)
	    slider.draw();
    }
    
    boolean sliderBeingShared() {
	int i;
	for (i = 0; i != CircuitElm.sim.adjustables.size(); i++) {
	    Adjustable adj = CircuitElm.sim.adjustables.get(i);
	    if (adj.sharedSlider == this)
		return true;
	}
	return false;
    }
    
    // get the unlocalized name of the edit item this adjustable controls
    String getEditItemName() {
	EditInfo ei = elm.getEditInfo(editItem);
	return ei != null ? ei.name : "";
    }

    // find the edit item index by name, falling back to the given index
    static int findEditItemByName(CircuitElm elm, String name, int fallbackIndex) {
	if (name != null && name.length() > 0) {
	    for (int i = 0; ; i++) {
		EditInfo ei = elm.getEditInfo(i);
		if (ei == null)
		    break;
		if (name.equals(ei.name))
		    return i;
	    }
	}
	return fallbackIndex;
    }

    void dumpXml(Document doc, Element root, CirSim app) {
	Element ae = doc.createElement("adj");
	XMLSerializer.dumpAttr(ae, "e", app.locateElm(elm));
	XMLSerializer.dumpAttr(ae, "ei", editItem);
	XMLSerializer.dumpAttr(ae, "en", getEditItemName());
	XMLSerializer.dumpAttr(ae, "mn", minValue);
	XMLSerializer.dumpAttr(ae, "mx", maxValue);
	XMLSerializer.dumpAttr(ae, "st", sliderText);
	if (sliderStep > 0)
	    XMLSerializer.dumpAttr(ae, "stp", sliderStep);
	if (sharedSlider != null)
	    XMLSerializer.dumpAttr(ae, "ss", app.adjustables.indexOf(sharedSlider));
	if (logarithmic)
	    XMLSerializer.dumpAttr(ae, "log", 1);
	root.appendChild(ae);
    }

    static void undumpXml(XMLDeserializer xml, CirSim app) {
	int e = xml.parseIntAttr("e", -1);
	if (e == -1)
	    return;
	int ei = xml.parseIntAttr("ei", 0);
	String en = xml.parseStringAttr("en", null);
	CircuitElm elm = app.getElm(e);
	int item = findEditItemByName(elm, en, ei);
	Adjustable adj = new Adjustable(elm, item);
	adj.minValue = xml.parseDoubleAttr("mn", 1);
	adj.maxValue = xml.parseDoubleAttr("mx", 1000);
	adj.sliderText = xml.parseStringAttr("st", "");
	adj.sliderStep = xml.parseDoubleAttr("stp", 0);
	int ss = xml.parseIntAttr("ss", -1);
	if (ss != -1)
	    adj.sharedSlider = app.adjustables.get(ss);
	adj.logarithmic = xml.parseIntAttr("log", 0) != 0;
	app.adjustables.add(adj);
    }

    // reorder adjustables so that items with sliders come first in the list, followed by items that reference them.
    // this simplifies the UI code, and also makes it much easier to dump/undump the adjustables list, since we will
    // always be undumping the adjustables with sliders first, then the adjustables that reference them.
    static void reorderAdjustables() {
	Vector<Adjustable> newList = new Vector<Adjustable>();
	Vector<Adjustable> oldList = CircuitElm.sim.adjustables;
	int i;
	for (i = 0; i != oldList.size(); i++) {
	    Adjustable adj = oldList.get(i);
	    if (adj.sharedSlider == null)
		newList.add(adj);
	}
	for (i = 0; i != oldList.size(); i++) {
	    Adjustable adj = oldList.get(i);
	    if (adj.sharedSlider != null)
		newList.add(adj);
	}
	CircuitElm.sim.adjustables = newList;
    }
}
