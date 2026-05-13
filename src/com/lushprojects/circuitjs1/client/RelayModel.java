package com.lushprojects.circuitjs1.client;

import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.Vector;

import com.lushprojects.circuitjs1.client.util.Locale;
import com.google.gwt.xml.client.Document;
import com.google.gwt.xml.client.Element;

public class RelayModel implements Editable, Comparable<RelayModel> {

    static HashMap<String, RelayModel> modelMap;

    int flags;
    String name, description;
    double inductance, r_on, r_off, onCurrent, offCurrent, coilR, switchingTime;
    int coilStyle;   // 0=both sides, 1=side1, 2=side2
    boolean showBox;
    boolean pulldown;

    boolean dumped;
    boolean readOnly;
    boolean builtIn;
    boolean oldStyle;

    RelayModel() {
	inductance = .2;
	r_on = .05;
	r_off = 1e6;
	onCurrent = .02;
	offCurrent = .015;
	coilR = 20;
	switchingTime = 5e-3;
	coilStyle = 0;
	showBox = true;
	pulldown = true;
    }

    RelayModel(RelayModel copy) {
	flags = copy.flags;
	inductance = copy.inductance;
	r_on = copy.r_on;
	r_off = copy.r_off;
	onCurrent = copy.onCurrent;
	offCurrent = copy.offCurrent;
	coilR = copy.coilR;
	switchingTime = copy.switchingTime;
	coilStyle = copy.coilStyle;
	showBox = copy.showBox;
	pulldown = copy.pulldown;
    }

    static RelayModel getModelWithName(String name) {
	createModelMap();
	RelayModel lm = modelMap.get(name);
	if (lm != null)
	    return lm;
	lm = new RelayModel();
	lm.name = name;
	modelMap.put(name, lm);
	return lm;
    }

    static RelayModel getModelWithNameOrCopy(String name, RelayModel oldmodel) {
	createModelMap();
	RelayModel lm = modelMap.get(name);
	if (lm != null)
	    return lm;
	if (oldmodel == null) {
	    CirSim.console("relay model not found: " + name);
	    return getDefaultModel();
	}
	lm = new RelayModel(oldmodel);
	lm.name = name;
	modelMap.put(name, lm);
	return lm;
    }

    static void createModelMap() {
	if (modelMap != null)
	    return;
	modelMap = new HashMap<String, RelayModel>();
	addDefaultModel("default", new RelayModel());
    }

    static void addDefaultModel(String name, RelayModel rm) {
	modelMap.put(name, rm);
	rm.readOnly = rm.builtIn = true;
	rm.name = name;
    }

    static RelayModel getDefaultModel() {
	return getModelWithName("default");
    }

    // Create (or find) a model from old-style per-element parameters for backward compatibility.
    static RelayModel getModelWithParameters(double inductance, double r_on, double r_off,
	    double onCurrent, double offCurrent, double coilR, double switchingTime,
	    int coilStyle, boolean showBox, boolean pulldown) {
	createModelMap();
	Iterator it = modelMap.entrySet().iterator();
	while (it.hasNext()) {
	    Map.Entry<String, RelayModel> pair = (Map.Entry) it.next();
	    RelayModel rm = pair.getValue();
	    if (Math.abs(rm.inductance - inductance) < 1e-15 &&
		Math.abs(rm.r_on - r_on) < 1e-15 &&
		Math.abs(rm.r_off - r_off) < 1e-15 &&
		Math.abs(rm.onCurrent - onCurrent) < 1e-15 &&
		Math.abs(rm.offCurrent - offCurrent) < 1e-15 &&
		Math.abs(rm.coilR - coilR) < 1e-15 &&
		Math.abs(rm.switchingTime - switchingTime) < 1e-15 &&
		rm.coilStyle == coilStyle &&
		rm.showBox == showBox &&
		rm.pulldown == pulldown)
		return rm;
	}
	String baseName = "old-relay";
	String name = baseName;
	if (modelMap.get(name) != null) {
	    int num = 2;
	    for (; ; num++) {
		String n = baseName + "-" + num;
		if (modelMap.get(n) == null) {
		    name = n;
		    break;
		}
	    }
	}
	RelayModel rm = getModelWithName(name);
	rm.inductance = inductance;
	rm.r_on = r_on;
	rm.r_off = r_off;
	rm.onCurrent = onCurrent;
	rm.offCurrent = offCurrent;
	rm.coilR = coilR;
	rm.switchingTime = switchingTime;
	rm.coilStyle = coilStyle;
	rm.showBox = showBox;
	rm.pulldown = pulldown;
	rm.oldStyle = true;
	return rm;
    }

    static void clearDumpedFlags() {
	if (modelMap == null)
	    return;
	Iterator it = modelMap.entrySet().iterator();
	while (it.hasNext()) {
	    Map.Entry<String, RelayModel> pair = (Map.Entry) it.next();
	    pair.getValue().dumped = false;
	}
    }

    static Vector<RelayModel> getModelList() {
	Vector<RelayModel> vector = new Vector<RelayModel>();
	Iterator it = modelMap.entrySet().iterator();
	while (it.hasNext()) {
	    Map.Entry<String, RelayModel> pair = (Map.Entry) it.next();
	    RelayModel rm = pair.getValue();
	    if (!vector.contains(rm))
		vector.add(rm);
	}
	Collections.sort(vector);
	return vector;
    }

    public int compareTo(RelayModel rm) {
	return name.compareTo(rm.name);
    }

    String getDescription() {
	if (description == null)
	    return name;
	return name + " (" + Locale.LS(description) + ")";
    }

    void pickName() {
	name = "relaymodel";
	if (modelMap.get(name) != null) {
	    int num = 2;
	    for (; ; num++) {
		String n = name + "-" + num;
		if (modelMap.get(n) == null) {
		    name = n;
		    break;
		}
	    }
	}
	modelMap.put(name, this);
    }

    void dumpXml(Document doc) {
	dumped = true;
	Element elem = doc.createElement("rlm");
	XMLSerializer.dumpAttr(elem, "nm", name);
	XMLSerializer.dumpAttr(elem, "f", flags);
	XMLSerializer.dumpAttr(elem, "in", inductance);
	XMLSerializer.dumpAttr(elem, "ron", r_on);
	XMLSerializer.dumpAttr(elem, "rof", r_off);
	XMLSerializer.dumpAttr(elem, "on", onCurrent);
	XMLSerializer.dumpAttr(elem, "of", offCurrent);
	XMLSerializer.dumpAttr(elem, "coR", coilR);
	XMLSerializer.dumpAttr(elem, "sw", switchingTime);
	XMLSerializer.dumpAttr(elem, "cs", coilStyle);
	if (showBox)
	    XMLSerializer.dumpAttr(elem, "sb", 1);
	if (pulldown)
	    XMLSerializer.dumpAttr(elem, "pd", 1);
	doc.getDocumentElement().appendChild(elem);
    }

    static RelayModel undumpModelXml(XMLDeserializer xml) {
	String name = xml.parseStringAttr("nm", null);
	RelayModel rm = RelayModel.getModelWithName(name);
	rm.undumpXml(xml);
	return rm;
    }

    void undumpXml(XMLDeserializer xml) {
	flags = xml.parseIntAttr("f", flags);
	inductance = xml.parseDoubleAttr("in", inductance);
	r_on = xml.parseDoubleAttr("ron", r_on);
	r_off = xml.parseDoubleAttr("rof", r_off);
	onCurrent = xml.parseDoubleAttr("on", onCurrent);
	offCurrent = xml.parseDoubleAttr("of", offCurrent);
	coilR = xml.parseDoubleAttr("coR", coilR);
	switchingTime = xml.parseDoubleAttr("sw", switchingTime);
	coilStyle = xml.parseIntAttr("cs", coilStyle);
	showBox = xml.parseIntAttr("sb", showBox ? 1 : 0) != 0;
	pulldown = xml.parseIntAttr("pd", pulldown ? 1 : 0) != 0;
    }

    public EditInfo getEditInfo(int n) {
	if (n == 0) {
	    EditInfo ei = new EditInfo("Model Name", 0);
	    ei.text = name == null ? "" : name;
	    return ei;
	}
	if (n == 1)
	    return new EditInfo("Inductance (H)", inductance, 0, 0).setPositive();
	if (n == 2)
	    return new EditInfo("On Resistance (ohms)", r_on, 0, 0).setPositive();
	if (n == 3)
	    return new EditInfo("Off Resistance (ohms)", r_off, 0, 0).setPositive();
	if (n == 4)
	    return new EditInfo("On Current (A)", onCurrent, 0, 0).setPositive();
	if (n == 5)
	    return new EditInfo("Off Current (A)", offCurrent, 0, 0).setPositive();
	if (n == 6)
	    return new EditInfo("Coil Resistance (ohms)", coilR, 0, 0).setPositive();
	if (n == 7)
	    return new EditInfo("Switching Time (s)", switchingTime, 0, 0).setPositive();
	if (n == 8) {
	    EditInfo ei = new EditInfo("Coil Style", coilStyle, -1, -1);
	    ei.choice = new Choice();
	    ei.choice.add("Both Sides");
	    ei.choice.add("Side 1");
	    ei.choice.add("Side 2");
	    ei.choice.select(coilStyle);
	    return ei;
	}
	if (n == 9)
	    return EditInfo.createCheckbox("Show Box", showBox);
	if (n == 10)
	    return EditInfo.createCheckbox("Pulldown Resistor", pulldown);
	return null;
    }

    public void setEditValue(int n, EditInfo ei) {
	if (n == 0) {
	    name = ei.textf.getText();
	    if (name.length() > 0)
		modelMap.put(name, this);
	}
	if (n == 1 && ei.value > 0) inductance = ei.value;
	if (n == 2 && ei.value > 0) r_on = ei.value;
	if (n == 3 && ei.value > 0) r_off = ei.value;
	if (n == 4 && ei.value > 0) onCurrent = ei.value;
	if (n == 5 && ei.value > 0) offCurrent = ei.value;
	if (n == 6 && ei.value > 0) coilR = ei.value;
	if (n == 7 && ei.value > 0) switchingTime = ei.value;
	if (n == 8) coilStyle = ei.choice.getSelectedIndex();
	if (n == 9) showBox = ei.checkbox.getState();
	if (n == 10) pulldown = ei.checkbox.getState();
	CirSim.theApp.updateModels();
    }
}
