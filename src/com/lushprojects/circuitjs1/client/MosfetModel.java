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

    static final int FLAG_JFET = 1;

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
    // true if this model was synthesized from an old circuit file's inline per-element
    // vt/beta values rather than picked/created by the user; see DiodeModel.oldStyle
    boolean oldStyle;

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

    // is this a model meant for use by JfetElm (vs. MosfetElm)?  JFETs and MOSFETs share this
    // one model class since the only real difference between them is which default parameter
    // values make sense; this flag is just used to filter the model-picker dropdown per element type.
    boolean isJfet() { return (flags & FLAG_JFET) != 0; }

    MosfetModel setJfet() {
	flags |= FLAG_JFET;
	return this;
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

    static MosfetModel getModelWithNameOrCopy(String name, MosfetModel oldmodel, boolean jfet) {
	createModelMap();
	MosfetModel lm = modelMap.get(name);
	if (lm != null)
	    return lm;
	if (oldmodel == null) {
	    CirSim.console("model not found: " + name);
	    return getDefaultModel(jfet);
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
	addDefaultModel("default", new MosfetModel("default", 1.5, .02));
	// values taken from Hayes+Horowitz p155
	addDefaultModel("default-jfet", new MosfetModel("default-jfet", -4, .00125).setJfet());
    }

    static void addDefaultModel(String name, MosfetModel dm) {
	modelMap.put(name, dm);
	dm.readOnly = dm.builtIn = true;
	dm.name = name;
    }

    static MosfetModel getDefaultModel(boolean jfet) {
	return getModelWithName(jfet ? "default-jfet" : "default");
    }

    // Find (or create) a model matching the given legacy per-element vt/beta, for backward
    // compatibility with old circuit files that stored vt/beta inline instead of by model name.
    static MosfetModel getModelWithParameters(double vt, double beta, boolean jfet) {
	createModelMap();
	Iterator it = modelMap.entrySet().iterator();
	while (it.hasNext()) {
	    Map.Entry<String,MosfetModel> pair = (Map.Entry)it.next();
	    MosfetModel mm = pair.getValue();
	    if (mm.isJfet() == jfet && Math.abs(mm.threshold-vt) < 1e-15 && Math.abs(mm.beta-beta) < 1e-15 &&
		mm.lambda == 0 && mm.capGS == 0 && mm.capGD == 0)
		return mm;
	}
	String baseName = "old-" + (jfet ? "jfet" : "mosfet");
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
	MosfetModel mm = getModelWithName(name);
	mm.threshold = vt;
	mm.beta = beta;
	if (jfet)
	    mm.setJfet();
	mm.readOnly = mm.oldStyle = true;
	return mm;
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

    // jfet selects whether to return models meant for JfetElm or for MosfetElm
    static Vector<MosfetModel> getModelList(boolean jfet) {
	createModelMap();
	Vector<MosfetModel> vector = new Vector<MosfetModel>();
	Iterator it = modelMap.entrySet().iterator();
	while (it.hasNext()) {
	    Map.Entry<String,MosfetModel> pair = (Map.Entry)it.next();
	    MosfetModel mm = pair.getValue();
	    if (mm.internal || mm.isJfet() != jfet)
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
	name = isJfet() ? "jfetmodel" : "mosfetmodel";
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
