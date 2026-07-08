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

    // these describe how parts using this model are drawn/simulated; they were formerly
    // per-element (or, worse, circuit-wide) flags, but they really describe the physical
    // part, e.g. whether it exposes a 4th body terminal or has a body diode, so they belong
    // on the model.  Not used for JFETs (isJfet() true), which never show the bulk/body.
    boolean showBulk;
    boolean digitalSymbol;          // draw as a simple digital-logic symbol (only if !showBulk)
    boolean bodyDiode;              // simulate the parasitic body diode (only if showBulk)
    boolean bodyTerminal;           // expose the body as a 4th terminal (only if bodyDiode)
    boolean showBodyDiodeSymbol;    // draw the body diode symbol (only if bodyDiode)

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
	showBulk = true;
	bodyDiode = true;
    }

    MosfetModel() {
	threshold = 1.5;
	beta = .02;
	showBulk = true;
	bodyDiode = true;
    }

    MosfetModel(MosfetModel copy) {
	flags = copy.flags;
	threshold = copy.threshold;
	beta = copy.beta;
	lambda = copy.lambda;
	capGS = copy.capGS;
	capGD = copy.capGD;
	showBulk = copy.showBulk;
	digitalSymbol = copy.digitalSymbol;
	bodyDiode = copy.bodyDiode;
	bodyTerminal = copy.bodyTerminal;
	showBodyDiodeSymbol = copy.showBodyDiodeSymbol;
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

	MosfetModel noDiodeDefault = new MosfetModel("default-nodiode", 1.5, .02);
	noDiodeDefault.bodyDiode = false;
	addDefaultModel("default-nodiode", noDiodeDefault);

	MosfetModel bodyTerminalDefault = new MosfetModel("default-body", 1.5, .02);
	bodyTerminalDefault.bodyTerminal = true;
	addDefaultModel("default-body", bodyTerminalDefault);

	MosfetModel digitalDefault = new MosfetModel("default-digital", 1.5, .02);
	digitalDefault.showBulk = false;
	digitalDefault.digitalSymbol = true;
	digitalDefault.bodyDiode = false;
	addDefaultModel("default-digital", digitalDefault);

	// values taken from Hayes+Horowitz p155.  JFETs never show a bulk/body terminal.
	MosfetModel jfetDefault = new MosfetModel("default-jfet", -4, .00125).setJfet();
	jfetDefault.showBulk = jfetDefault.bodyDiode = false;
	addDefaultModel("default-jfet", jfetDefault);
    }

    static void addDefaultModel(String name, MosfetModel dm) {
	modelMap.put(name, dm);
	dm.readOnly = dm.builtIn = true;
	dm.name = name;
    }

    static MosfetModel getDefaultModel(boolean jfet) {
	return getModelWithName(jfet ? "default-jfet" : "default");
    }

    // Find (or create) a model matching the given legacy per-element vt/beta and drawing/behavior
    // flags, for backward compatibility with old circuit files that stored these inline per
    // element instead of by model name.
    static MosfetModel getModelWithParameters(double vt, double beta, boolean jfet,
	    boolean showBulk, boolean bodyDiode, boolean bodyTerminal, boolean digitalSymbol,
	    boolean showBodyDiodeSymbol) {
	createModelMap();
	Iterator it = modelMap.entrySet().iterator();
	while (it.hasNext()) {
	    Map.Entry<String,MosfetModel> pair = (Map.Entry)it.next();
	    MosfetModel mm = pair.getValue();
	    if (mm.isJfet() == jfet && Math.abs(mm.threshold-vt) < 1e-15 && Math.abs(mm.beta-beta) < 1e-15 &&
		mm.lambda == 0 && mm.capGS == 0 && mm.capGD == 0 &&
		mm.showBulk == showBulk && mm.bodyDiode == bodyDiode && mm.bodyTerminal == bodyTerminal &&
		mm.digitalSymbol == digitalSymbol && mm.showBodyDiodeSymbol == showBodyDiodeSymbol)
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
	mm.showBulk = showBulk;
	mm.bodyDiode = bodyDiode;
	mm.bodyTerminal = bodyTerminal;
	mm.digitalSymbol = digitalSymbol;
	mm.showBodyDiodeSymbol = showBodyDiodeSymbol;
	if (jfet)
	    mm.setJfet();
	// unlike DiodeModel's oldStyle models (whose auto-generated name embeds the value, e.g.
	// "fwdrop=0.7", so editing the value in place would make the name misleading), this
	// name ("old-mosfet-2" etc.) doesn't encode the values, so there's no harm in letting the
	// user edit it directly - matches RelayModel's oldStyle models, which are also editable.
	mm.oldStyle = true;
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
	try {
	    showBulk = Integer.parseInt(st.nextToken()) != 0;
	    digitalSymbol = Integer.parseInt(st.nextToken()) != 0;
	    bodyDiode = Integer.parseInt(st.nextToken()) != 0;
	    bodyTerminal = Integer.parseInt(st.nextToken()) != 0;
	    showBodyDiodeSymbol = Integer.parseInt(st.nextToken()) != 0;
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
	// dumped unconditionally (not just when true) since these default to true for MOSFETs;
	// an omitted attribute would otherwise be misread as true again on reload
	XMLSerializer.dumpAttr(elem, "sb", showBulk ? 1 : 0);
	XMLSerializer.dumpAttr(elem, "dsy", digitalSymbol ? 1 : 0);
	XMLSerializer.dumpAttr(elem, "bd", bodyDiode ? 1 : 0);
	XMLSerializer.dumpAttr(elem, "bt", bodyTerminal ? 1 : 0);
	XMLSerializer.dumpAttr(elem, "sbd", showBodyDiodeSymbol ? 1 : 0);
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
	showBulk = xml.parseIntAttr("sb", showBulk ? 1 : 0) != 0;
	digitalSymbol = xml.parseIntAttr("dsy", digitalSymbol ? 1 : 0) != 0;
	bodyDiode = xml.parseIntAttr("bd", bodyDiode ? 1 : 0) != 0;
	bodyTerminal = xml.parseIntAttr("bt", bodyTerminal ? 1 : 0) != 0;
	showBodyDiodeSymbol = xml.parseIntAttr("sbd", showBodyDiodeSymbol ? 1 : 0) != 0;
    }

    public String getDialogTitle() { return "Edit " + (isJfet() ? "JFET" : "MOSFET") + " Model"; }

    public EditInfo getEditInfo(int n) {
	if (n == 0) {
	    EditInfo ei = new EditInfo("Model Name", 0);
	    ei.text = name == null ? "" : name;
	    return ei;
	}
	if (n == 1) return new EditInfo("Threshold Voltage (Vt)", threshold);
	if (n == 2) return new EditInfo(EditInfo.makeLink("mosfet-beta.html", "Beta"), beta);
	int idx = 3;
	// JFETs never show the bulk/body, so these options don't apply to jfet models
	if (!isJfet()) {
	    if (n == idx++)
		return EditInfo.createCheckbox("Show Bulk", showBulk);
	    if (n == idx++) {
		if (!showBulk)
		    return EditInfo.createCheckbox("Digital Symbol", digitalSymbol);
		return EditInfo.createCheckbox("Simulate Body Diode", bodyDiode);
	    }
	    if (showBulk && bodyDiode) {
		if (n == idx++)
		    return EditInfo.createCheckbox("Body Terminal", bodyTerminal);
		if (n == idx++)
		    return EditInfo.createCheckbox("Show Body Diode", showBodyDiodeSymbol);
	    }
	}
	if (n == idx++) return new EditInfo("Lambda", lambda).setDimensionless();
	if (n == idx++) return new EditInfo("Gate-Source Capacitance (Cgs)", capGS);
	if (n == idx) return new EditInfo("Gate-Drain Capacitance (Cgd)", capGD);
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
	int idx = 3;
	if (!isJfet()) {
	    if (n == idx++) {
		showBulk = ei.checkbox.getState();
		ei.newDialog = true;
	    } else if (n == idx++) {
		if (!showBulk)
		    digitalSymbol = ei.checkbox.getState();
		else
		    bodyDiode = ei.checkbox.getState();
		ei.newDialog = true;
	    } else if (showBulk && bodyDiode && n == idx++) {
		bodyTerminal = ei.checkbox.getState();
	    } else if (showBulk && bodyDiode && n == idx++) {
		showBodyDiodeSymbol = ei.checkbox.getState();
	    }
	}
	if (n == idx) lambda = (ei.value >= 0) ? ei.value : lambda;
	else if (n == idx+1) capGS = (ei.value >= 0) ? ei.value : capGS;
	else if (n == idx+2) capGD = (ei.value >= 0) ? ei.value : capGD;
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
