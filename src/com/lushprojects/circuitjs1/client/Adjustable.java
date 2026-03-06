package com.lushprojects.circuitjs1.client;

import java.util.Vector;

import com.google.gwt.user.client.Command;
import com.google.gwt.user.client.ui.Label;
import com.lushprojects.circuitjs1.client.util.Locale;

// values with sliders
public class Adjustable implements Command {
    CircuitElm elm;
    double minValue, maxValue;
    double sliderStep; // step increment; 0 = continuous (no stepping)
    int flags;
    String sliderText;
    
    // null if this Adjustable has its own slider, non-null if it's sharing another one.
    Adjustable sharedSlider;
    
    final int FLAG_SHARED = 1;
    
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
        if (ei != null && ei.maxVal > 0) {
            minValue = ei.minVal;
            maxValue = ei.maxVal;
        }
    }

    // undump
    Adjustable(StringTokenizer st, CirSim sim) {
	int e = Integer.parseInt(st.nextToken());
	if (e == -1)
	    return;
	try {
	    String ei = st.nextToken();

	    // forgot to dump a "flags" field in the initial code, so we have to do this to support backward compatibility
	    if (ei.startsWith("F")) {
		flags = Integer.parseInt(ei.substring(1));
		ei = st.nextToken();
	    }
	    
	    editItem = Integer.parseInt(ei);
	    minValue = Double.parseDouble(st.nextToken());
	    maxValue = Double.parseDouble(st.nextToken());
	    if ((flags & FLAG_SHARED) != 0) {
		int ano = Integer.parseInt(st.nextToken());
		sharedSlider = ano == -1 ? null : sim.adjustables.get(ano);
	    }
	    sliderText = CustomLogicModel.unescape(st.nextToken());
	} catch (Exception ex) {}
	try {
	    sliderStep = Double.parseDouble(st.nextToken());
	} catch (Exception ex) {}
	try {
	    elm = sim.getElm(e);
	} catch (Exception ex) {}
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
        sim.addWidgetToVerticalPanel(label = new Label(Locale.LS(sliderText)));
        label.addStyleName("topSpace");
        int intValue = (int) ((value-minValue)*100/(maxValue-minValue));
        sim.addWidgetToVerticalPanel(slider = new Scrollbar(Scrollbar.HORIZONTAL, intValue, 1, 0, 101, this, elm));
        slider.setStepSize(sliderStep * 100 / (maxValue - minValue));
    }

    void setSliderValue(double value) {
	if (sharedSlider != null) {
	    sharedSlider.setSliderValue(value);
	    return;
	}
        int intValue = (int) ((value-minValue)*100/(maxValue-minValue));
        settingValue = true; // don't recursively set value again in execute()
        slider.setValue(intValue);
        settingValue = false;
    }
    
    public void execute() {
	if (settingValue)
	    return;
	int i;
	CirSim sim = CirSim.theApp;
	for (i = 0; i != sim.adjustables.size(); i++) {
	    Adjustable adj = sim.adjustables.get(i);
	    if (adj == this || adj.sharedSlider == this)
		adj.executeSlider();
	}
    }
    
    void executeSlider() {
	CirSim.theApp.analyzeFlag = true;
	EditInfo ei = elm.getEditInfo(editItem);
	ei.value = getSliderValue();
	elm.setEditValue(editItem, ei);
	CirSim.theApp.repaint();
    }
    
    double getSliderValue() {
	double val = sharedSlider == null ? slider.getValue() : sharedSlider.slider.getValue();
	double result = minValue + (maxValue-minValue)*val/100;
	double step = sharedSlider != null ? sharedSlider.sliderStep : sliderStep;
	if (step > 0)
	    result = Math.round(result / step) * step;
	return result;
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
	for (i = 0; i != CirSim.theApp.adjustables.size(); i++) {
	    Adjustable adj = CirSim.theApp.adjustables.get(i);
	    if (adj.sharedSlider == this)
		return true;
	}
	return false;
    }
    
    String dump() {
	int ano = -1;
	if (sharedSlider != null)
	    ano = CirSim.theApp.adjustables.indexOf(sharedSlider);
	
	return CirSim.theApp.locateElm(elm) + " F1 " + editItem + " " + minValue + " " + maxValue + " " + ano + " " +
			CustomLogicModel.escape(sliderText) + " " + sliderStep;
    }
    
    // reorder adjustables so that items with sliders come first in the list, followed by items that reference them.
    // this simplifies the UI code, and also makes it much easier to dump/undump the adjustables list, since we will
    // always be undumping the adjustables with sliders first, then the adjustables that reference them.
    static void reorderAdjustables() {
	Vector<Adjustable> newList = new Vector<Adjustable>();
	Vector<Adjustable> oldList = CirSim.theApp.adjustables;
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
	CirSim.theApp.adjustables = newList;
    }
}
