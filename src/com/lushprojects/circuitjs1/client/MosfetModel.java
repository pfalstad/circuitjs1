package com.lushprojects.circuitjs1.client;

import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.Vector;

import com.google.gwt.xml.client.Document;
import com.google.gwt.xml.client.Element;
import com.lushprojects.circuitjs1.client.util.Locale;

public class MosfetModel implements Editable, Comparable<MosfetModel> {

    static HashMap<String, MosfetModel> modelMap;

    int flags;
    String name, description;
    double threshold;              // Vt: threshold voltage (V)
    double beta;                   // transconductance parameter (A/V^2)
    double lambda;                 // channel-length modulation (1/V), 0=ideal
    double capGS;                  // Cgs: gate-source capacitance (F), 0=disabled
    double capGD;                  // Cgd: gate-drain capacitance (F), 0=disabled

    boolean dumped;
    boolean readOnly;
    boolean builtIn;
    boolean internal;

    MosfetModel(String d, double vt, double b) {
	description = d;
	threshold = vt;
	beta = b;
    }

    MosfetModel() {
	threshold = 1.5;
	beta = .02;
    }

    MosfetModel(MosfetModel copy) {
	flags = copy.flags;
	threshold = copy.threshold;
	beta = copy.beta;
	lambda = copy.lambda;
	capGS = copy.capGS;
	capGD = copy.capGD;
    }

    static MosfetModel getModelWithName(String name) {
	createModelMap();
	MosfetModel lm = modelMap.get(name);
	if (lm != null)
	    return lm;
	lm = new MosfetModel();
	lm.name = name;
	modelMap.put(name, lm);
	return lm;
    }

    static MosfetModel getModelWithNameOrCopy(String name, MosfetModel oldmodel) {
	createModelMap();
	MosfetModel lm = modelMap.get(name);
	if (lm != null)
	    return lm;
	if (oldmodel == null) {
	    CirSim.console("model not found: " + name);
	    return getDefaultModel();
	}
	lm = new MosfetModel(oldmodel);
	lm.name = name;
	modelMap.put(name, lm);
	return lm;
    }

    static void createModelMap() {
	if (modelMap != null)
	    return;
	modelMap = new HashMap<String,MosfetModel>();
	addDefaultModel("default",      new MosfetModel("default",    1.5, .02));
	addDefaultModel("spice-default", new MosfetModel("spice-default", 1.5, .02));
    }

    static void addDefaultModel(String name, MosfetModel dm) {
	modelMap.put(name, dm);
	dm.readOnly = dm.builtIn = true;
	dm.name = name;
    }

    static MosfetModel getDefaultModel() {
	return getModelWithName("default");
    }

    static void clearDumpedFlags() {
	if (modelMap == null)
	    return;
	Iterator it = modelMap.entrySet().iterator();
	while (it.hasNext()) {
	    Map.Entry<String,MosfetModel> pair = (Map.Entry)it.next();
	    pair.getValue().dumped = false;
	}
    }

    static Vector<MosfetModel> getModelList() {
	Vector<MosfetModel> vector = new Vector<MosfetModel>();
	Iterator it = modelMap.entrySet().iterator();
	while (it.hasNext()) {
	    Map.Entry<String,MosfetModel> pair = (Map.Entry)it.next();
	    MosfetModel mm = pair.getValue();
	    if (mm.internal)
		continue;
	    if (!vector.contains(mm))
		vector.add(mm);
	}
	Collections.sort(vector);
	return vector;
    }

    public int compareTo(MosfetModel dm) {
	return name.compareTo(dm.name);
    }

    String getDescription() {
	if (description == null || description.equals(name))
	    return name;
	return name + " (" + Locale.LS(description) + ")";
    }

    static MosfetModel undumpModel(StringTokenizer st) {
	String name = CustomLogicModel.unescape(st.nextToken());
	MosfetModel dm = MosfetModel.getModelWithName(name);
	dm.undump(st);
	return dm;
    }

    void undump(StringTokenizer st) {
	flags = new Integer(st.nextToken()).intValue();
	threshold = Double.parseDouble(st.nextToken());
	beta = Double.parseDouble(st.nextToken());
	try {
	    lambda = Double.parseDouble(st.nextToken());
	} catch (Exception e) {}
	try {
	    capGS = Double.parseDouble(st.nextToken());
	    capGD = Double.parseDouble(st.nextToken());
	} catch (Exception e) {}
    }

    String dump() {
	dumped = true;
	String s = "36 " + CustomLogicModel.escape(name) + " " + flags + " " + threshold + " " + beta;
	if (lambda != 0 || capGS != 0 || capGD != 0)
	    s += " " + lambda;
	if (capGS != 0 || capGD != 0)
	    s += " " + capGS + " " + capGD;
	return s;
    }

    void dumpXml(Document doc) {
	dumped = true;
	Element elem = doc.createElement("mm");
	XMLSerializer.dumpAttr(elem, "nm", name);
	XMLSerializer.dumpAttr(elem, "f", flags);
	XMLSerializer.dumpAttr(elem, "vt", threshold);
	XMLSerializer.dumpAttr(elem, "be", beta);
	if (lambda != 0)
	    XMLSerializer.dumpAttr(elem, "la", lambda);
	if (capGS != 0)
	    XMLSerializer.dumpAttr(elem, "cgs", capGS);
	if (capGD != 0)
	    XMLSerializer.dumpAttr(elem, "cgd", capGD);
	doc.getDocumentElement().appendChild(elem);
    }

    static MosfetModel undumpModelXml(XMLDeserializer xml) {
	String name = xml.parseStringAttr("nm", null);
	MosfetModel dm = MosfetModel.getModelWithName(name);
	dm.undumpXml(xml);
	return dm;
    }

    void undumpXml(XMLDeserializer xml) {
	flags = xml.parseIntAttr("f", flags);
	threshold = xml.parseDoubleAttr("vt", threshold);
	beta = xml.parseDoubleAttr("be", beta);
	lambda = xml.parseDoubleAttr("la", lambda);
	capGS = xml.parseDoubleAttr("cgs", capGS);
	capGD = xml.parseDoubleAttr("cgd", capGD);
    }

    public EditInfo getEditInfo(int n) {
	if (n == 0) {
	    EditInfo ei = new EditInfo("Model Name", 0);
	    ei.text = name == null ? "" : name;
	    return ei;
	}
	if (n == 1) return new EditInfo("Threshold Voltage (Vt)", threshold);
	if (n == 2) return new EditInfo(EditInfo.makeLink("mosfet-beta.html", "Beta"), beta);
	if (n == 3) return new EditInfo("Lambda", lambda).setDimensionless();
	if (n == 4) return new EditInfo("Gate-Source Capacitance (Cgs)", capGS);
	if (n == 5) return new EditInfo("Gate-Drain Capacitance (Cgd)", capGD);
	return null;
    }

    public void setEditValue(int n, EditInfo ei) {
	if (n == 0) {
	    name = ei.textf.getText();
	    if (name.length() > 0)
		modelMap.put(name, this);
	}
	if (n == 1) threshold = ei.value;
	if (n == 2 && ei.value > 0) beta = ei.value;
	if (n == 3 && ei.value >= 0) lambda = ei.value;
	if (n == 4 && ei.value >= 0) capGS = ei.value;
	if (n == 5 && ei.value >= 0) capGD = ei.value;
	CirSim.theApp.updateModels();
    }

    void pickName() {
	name = "mosfetmodel";
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
    }
}
