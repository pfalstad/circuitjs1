package com.lushprojects.circuitjs1.client;

import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.Vector;

import com.google.gwt.xml.client.Document;
import com.google.gwt.xml.client.Element;
import com.lushprojects.circuitjs1.client.util.Locale;

public class TransistorModel implements Editable, Comparable<TransistorModel> {

    static HashMap<String, TransistorModel> modelMap;

    int flags;
    String name, description;
    double satCur, invRollOffF, BEleakCur, leakBEemissionCoeff, invRollOffR, BCleakCur, leakBCemissionCoeff;
    double emissionCoeffF, emissionCoeffR, invEarlyVoltF, invEarlyVoltR, betaR;

    // Junction capacitance parameters (SPICE Gummel-Poon charge storage)
    // These model the physical depletion-layer capacitance of each PN junction.
    // A real transistor junction is a thin insulating depletion region sandwiched
    // between two conducting regions -- physically identical to a parallel-plate
    // capacitor whose plate spacing (and therefore capacitance) varies with the
    // applied voltage.  Reverse bias widens the depletion layer (less capacitance);
    // forward bias narrows it (more capacitance).
    //
    // Without these, the BJT is a pure DC device -- it responds instantly to any
    // signal, no matter how fast.  With them, the transistor has a finite
    // transition frequency (ft) and exhibits the propagation delay and phase
    // shift that real transistors produce.
    //
    // SPICE formula:  C(V) = Cj0 / (1 - V/Vj)^Mj   for V < 0.5*Vj
    //                 (linear extrapolation above 0.5*Vj to avoid singularity)
    //
    // Typical values (from SPICE .model cards):
    //   2N2222A (general-purpose NPN):  CJE=22.01pF VJE=0.7  MJE=0.377
    //                                   CJC=7.306pF VJC=0.75 MJC=0.3416
    //   2N3904  (small-signal NPN):     CJE=4.493pF VJE=0.65 MJE=0.2593
    //                                   CJC=3.638pF VJC=0.75 MJC=0.3085
    //   2N3906  (small-signal PNP):     CJE=4.49pF  VJE=0.632 MJE=0.267
    //                                   CJC=4.43pF  VJC=0.632 MJC=0.33
    double junctionCapBE;                   // CJE: zero-bias BE depletion capacitance (F), 0=disabled
    double junctionCapBC;                   // CJC: zero-bias BC depletion capacitance (F), 0=disabled
    double junctionPotBE = 0.75;            // VJE: BE built-in potential (V)
    double junctionPotBC = 0.75;            // VJC: BC built-in potential (V)
    double junctionExpBE = 0.33;            // MJE: BE junction grading coefficient
    double junctionExpBC = 0.33;            // MJC: BC junction grading coefficient

    // Transit time parameters (SPICE Gummel-Poon diffusion charge storage)
    // These model the minority carrier charge stored in the base region during
    // active operation.  The diffusion capacitance Cd = TT * gm adds to the
    // depletion capacitance above, and is the dominant contributor at high
    // forward bias (where gm is large).
    //
    // Typical values (from SPICE .model cards):
    //   2N2222A:  TF=0.411ns  TR=46.91ns
    //   2N3904:   TF=0.301ns  TR=239ns
    //   2N3906:   TF=0.579ns  TR=94.36ns
    double transitTimeF;                    // TF: forward transit time (s), 0=disabled
    double transitTimeR;                    // TR: reverse transit time (s), 0=disabled

    boolean dumped;
    boolean readOnly;
    boolean builtIn;
    boolean internal;

    TransistorModel(String d, double sc) {
	description = d;
	satCur = sc;
	emissionCoeffF = emissionCoeffR = 1;
	leakBEemissionCoeff = 1.5;
	leakBCemissionCoeff = 2;
	betaR = 1;
	junctionCapBE = 0;
	junctionCapBC = 0;
	junctionPotBE = 0.75;
	junctionPotBC = 0.75;
	junctionExpBE = 0.33;
	junctionExpBC = 0.33;
	transitTimeF = 0;
	transitTimeR = 0;
	updateModel();
    }

    static TransistorModel getModelWithName(String name) {
	createModelMap();
	TransistorModel lm = modelMap.get(name);
	if (lm != null)
	    return lm;
	lm = new TransistorModel();
	lm.name = name;
	modelMap.put(name, lm);
	return lm;
    }

    static TransistorModel getModelWithNameOrCopy(String name, TransistorModel oldmodel) {
	createModelMap();
	TransistorModel lm = modelMap.get(name);
	if (lm != null)
	    return lm;
	if (oldmodel == null) {
	    CirSim.console("model not found: " + name);
	    return getDefaultModel();
	}
	lm = new TransistorModel(oldmodel);
	lm.name = name;
	modelMap.put(name, lm);
	return lm;
    }

    static void createModelMap() {
	if (modelMap != null)
	    return;
	modelMap = new HashMap<String,TransistorModel>();
	addDefaultModel("default",      new TransistorModel("default",        1e-13));
	addDefaultModel("spice-default", new TransistorModel("spice-default", 1e-16));

	// for LM324v2 OpAmpRealElm
	loadInternalModel("xlm324v2-qpi 0 1.01e-16 333.3333333333333 0 1.5 0 0 2 1 1 0.0034482758620689655 0 1");
	loadInternalModel("xlm324v2-qpi 0 1.01e-16 333.3333333333333 0 1.5 0 0 2 1 1 0.0034482758620689655 0 1");
	loadInternalModel("xlm324v2-qpa 0 1.01e-16 333.3333333333333 0 1.5 0 0 2 1 1 0.004081632653061225 0 1");
	loadInternalModel("xlm324v2-qnq 0 1e-16 200 0 1.5 0 0 2 1 1 0 0 1");
	loadInternalModel("xlm324v2-qpq 0 1e-16 333.3333333333333 0 1.5 0 0 2 1 1 0 0 1");

	// for TL431
	loadInternalModel("~tl431ed-qn_ed 0 1e-16 0 0 1.5 0 0 2 1 1 0.0125 0.02 1");
	loadInternalModel("~tl431ed-qn_ed-A1.2 0 1.2e-16 0 0 1.5 0 0 2 1 1 0.0125 0.02 1");
	loadInternalModel("~tl431ed-qn_ed-A2.2 0 2.2000000000000002e-16 0 0 1.5 0 0 2 1 1 0.0125 0.02 1");
	loadInternalModel("~tl431ed-qn_ed-A0.5 0 5e-17 0 0 1.5 0 0 2 1 1 0.0125 0.02 1");
	loadInternalModel("~tl431ed-qp_ed 0 1e-16 0 0 1.5 0 0 2 1 1 0.014285714285714285 0.025 1");
	loadInternalModel("~tl431ed-qn_ed-A5 0 5e-16 0 0 1.5 0 0 2 1 1 0.0125 0.02 1");

	// for LM317
	loadInternalModel("~lm317-qpl-A0.1 0 1e-17 0 0 1.5 0 0 2 1 1 0.02 0 1");
	loadInternalModel("~lm317-qnl-A0.2 0 2e-17 0 0 1.5 0 0 2 1 1 0.01 0 1");
	loadInternalModel("~lm317-qpl-A0.2 0 2e-17 0 0 1.5 0 0 2 1 1 0.02 0 1");
	loadInternalModel("~lm317-qnl-A2 0 2e-16 0 0 1.5 0 0 2 1 1 0.01 0 1");
	loadInternalModel("~lm317-qpl-A2 0 2e-16 0 0 1.5 0 0 2 1 1 0.02 0 1");
	loadInternalModel("~lm317-qnl-A5 0 5e-16 0 0 1.5 0 0 2 1 1 0.01 0 1");
	loadInternalModel("~lm317-qnl-A50 0 5e-15 0 0 1.5 0 0 2 1 1 0.01 0 1");

    }

    static void addDefaultModel(String name, TransistorModel dm) {
	modelMap.put(name, dm);
	dm.readOnly = dm.builtIn = true;
	dm.name = name;
    }

    static TransistorModel getDefaultModel() {
	return getModelWithName("default");
    }

    static void clearDumpedFlags() {
	if (modelMap == null)
	    return;
	Iterator it = modelMap.entrySet().iterator();
	while (it.hasNext()) {
	    Map.Entry<String,TransistorModel> pair = (Map.Entry)it.next();
	    pair.getValue().dumped = false;
	}
    }

    static Vector<TransistorModel> getModelList() {
	Vector<TransistorModel> vector = new Vector<TransistorModel>();
	Iterator it = modelMap.entrySet().iterator();
	while (it.hasNext()) {
	    Map.Entry<String,TransistorModel> pair = (Map.Entry)it.next();
	    TransistorModel tm = pair.getValue();
	    if (tm.internal)
		continue;
	    if (!vector.contains(tm))
		vector.add(tm);
	}
	Collections.sort(vector);
	return vector;
    }

    public int compareTo(TransistorModel dm) {
	return name.compareTo(dm.name);
    }

    String getDescription() {
	if (description == null || description.equals(name))
	    return name;
	return name + " (" + Locale.LS(description) + ")";
    }

    TransistorModel() {
	updateModel();
    }

    TransistorModel(TransistorModel copy) {
	flags = copy.flags;
	satCur = copy.satCur;
	invRollOffF = copy.invRollOffF;
	BEleakCur = copy.BEleakCur;
	leakBEemissionCoeff = copy.leakBEemissionCoeff;
	invRollOffR = copy.invRollOffR;
	BCleakCur = copy.BCleakCur;
	leakBCemissionCoeff = copy.leakBCemissionCoeff;
	emissionCoeffF = copy.emissionCoeffF;
	emissionCoeffR = copy.emissionCoeffR;
	invEarlyVoltF = copy.invEarlyVoltF;
	invEarlyVoltR = copy.invEarlyVoltR;
	betaR = copy.betaR;
	junctionCapBE = copy.junctionCapBE;
	junctionPotBE = copy.junctionPotBE;
	junctionExpBE = copy.junctionExpBE;
	junctionCapBC = copy.junctionCapBC;
	junctionPotBC = copy.junctionPotBC;
	junctionExpBC = copy.junctionExpBC;
	transitTimeF = copy.transitTimeF;
	transitTimeR = copy.transitTimeR;
	updateModel();
    }

    static void loadInternalModel(String s) {
	StringTokenizer st = new StringTokenizer(s);
	TransistorModel tm = undumpModel(st);
	tm.builtIn = tm.internal = true;
    }

    static TransistorModel undumpModel(StringTokenizer st) {
	String name = CustomLogicModel.unescape(st.nextToken());
	TransistorModel dm = TransistorModel.getModelWithName(name);
	dm.undump(st);
	return dm;
    }

    void undump(StringTokenizer st) {
	flags = new Integer(st.nextToken()).intValue();

	satCur = Double.parseDouble(st.nextToken());
	invRollOffF = Double.parseDouble(st.nextToken());
	BEleakCur = Double.parseDouble(st.nextToken());
	leakBEemissionCoeff = Double.parseDouble(st.nextToken());
	invRollOffR = Double.parseDouble(st.nextToken());
	BCleakCur = Double.parseDouble(st.nextToken());
	leakBCemissionCoeff = Double.parseDouble(st.nextToken());
	emissionCoeffF = Double.parseDouble(st.nextToken());
	emissionCoeffR = Double.parseDouble(st.nextToken());
	invEarlyVoltF = Double.parseDouble(st.nextToken());
	invEarlyVoltR = Double.parseDouble(st.nextToken());
	betaR = Double.parseDouble(st.nextToken());

	// Junction capacitance params (optional, for backward compatibility)
	try {
	    junctionCapBE = Double.parseDouble(st.nextToken());
	    junctionPotBE = Double.parseDouble(st.nextToken());
	    junctionExpBE = Double.parseDouble(st.nextToken());
	    junctionCapBC = Double.parseDouble(st.nextToken());
	    junctionPotBC = Double.parseDouble(st.nextToken());
	    junctionExpBC = Double.parseDouble(st.nextToken());
	} catch (Exception e) {
	}
	try {
	    transitTimeF = Double.parseDouble(st.nextToken());
	    transitTimeR = Double.parseDouble(st.nextToken());
	} catch (Exception e) {
	}

	updateModel();
    }

    public EditInfo getEditInfo(int n) {
	if (n == 0) {
	    EditInfo ei = new EditInfo("Model Name", 0);
	    ei.text = name == null ? "" : name;
	    return ei;
	}
	if (n == 1) return new EditInfo("Transport Saturation Current (IS)", satCur);
	if (n == 2) return new EditInfo("Reverse Beta (BR)", betaR);
	if (n == 3) return new EditInfo("Forward Early Voltage (VAF)", 1/invEarlyVoltF);
	if (n == 4) return new EditInfo("Reverse Early Voltage (VAR)", 1/invEarlyVoltR);
	if (n == 5) return new EditInfo("Corner For Forward Beta High Current Roll-Off (IKF)", 1/invRollOffF);
	if (n == 6) return new EditInfo("Corner For Reverse Beta High Current Roll-Off (IKR)", 1/invRollOffR);
	if (n == 7) return new EditInfo("Forward Current Emission Coefficient (NF)", emissionCoeffF);
	if (n == 8) return new EditInfo("Reverse Current Emission Coefficient (NR)", emissionCoeffR);
	if (n == 9) return new EditInfo("B-E Leakage Saturation Current (ISE)", BEleakCur);
	if (n == 10) return new EditInfo("B-E Leakage Emission Coefficient (NE)", leakBEemissionCoeff);
	if (n == 11) return new EditInfo("B-C Leakage Saturation Current (ISC)", BCleakCur);
	if (n == 12) return new EditInfo("B-C Leakage Emission Coefficient (NC)", leakBCemissionCoeff);
	if (n == 13) return new EditInfo("B-E Zero-Bias Junction Capacitance (CJE)", junctionCapBE);
	if (n == 14) return new EditInfo("B-E Junction Potential (VJE)", junctionPotBE).setPositive();
	if (n == 15) return new EditInfo("B-E Junction Grading Coefficient (MJE)", junctionExpBE).setPositive();
	if (n == 16) return new EditInfo("B-C Zero-Bias Junction Capacitance (CJC)", junctionCapBC);
	if (n == 17) return new EditInfo("B-C Junction Potential (VJC)", junctionPotBC).setPositive();
	if (n == 18) return new EditInfo("B-C Junction Grading Coefficient (MJC)", junctionExpBC).setPositive();
	if (n == 19) return new EditInfo("Forward Transit Time TF (s)", transitTimeF);
	if (n == 20) return new EditInfo("Reverse Transit Time TR (s)", transitTimeR);
	return null;
    }

    public void setEditValue(int n, EditInfo ei) {
	if (n == 0) {
	    name = ei.textf.getText();
	    if (name.length() > 0)
		modelMap.put(name, this);
	}
	if (n == 1) satCur = ei.value;
	if (n == 2) betaR = ei.value;
	if (n == 3) invEarlyVoltF = 1/ei.value;
	if (n == 4) invEarlyVoltR = 1/ei.value;
	if (n == 5) invRollOffF = 1/ei.value;
	if (n == 6) invRollOffR = 1/ei.value;
	if (n == 7) emissionCoeffF = ei.value;
	if (n == 8) emissionCoeffR = ei.value;
	if (n == 9) BEleakCur = ei.value;
	if (n == 10) leakBEemissionCoeff = ei.value;
	if (n == 11) BCleakCur = ei.value;
	if (n == 12) leakBCemissionCoeff = ei.value;
	if (n == 13) junctionCapBE = ei.value;
	if (n == 14) junctionPotBE = ei.value;
	if (n == 15) junctionExpBE = ei.value;
	if (n == 16) junctionCapBC = ei.value;
	if (n == 17) junctionPotBC = ei.value;
	if (n == 18) junctionExpBC = ei.value;
	if (n == 19) {
	    if (ei.value >= 0) transitTimeF = ei.value;
	    else ei.setError("must be >= 0");
	}
	if (n == 20) {
	    if (ei.value >= 0) transitTimeR = ei.value;
	    else ei.setError("must be >= 0");
	}
	updateModel();
	CirSim.theApp.updateModels();
    }

    void updateModel() {
    }

    void pickName() {
	name = "transistormodel";
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
	Element elem = doc.createElement("tm");
	XMLSerializer.dumpAttr(elem, "nm", name);
	XMLSerializer.dumpAttr(elem, "f", flags);
	XMLSerializer.dumpAttr(elem, "is", satCur);
	XMLSerializer.dumpAttr(elem, "ikf", invRollOffF);
	XMLSerializer.dumpAttr(elem, "ise", BEleakCur);
	XMLSerializer.dumpAttr(elem, "ne", leakBEemissionCoeff);
	XMLSerializer.dumpAttr(elem, "ikr", invRollOffR);
	XMLSerializer.dumpAttr(elem, "isc", BCleakCur);
	XMLSerializer.dumpAttr(elem, "nc", leakBCemissionCoeff);
	XMLSerializer.dumpAttr(elem, "nf", emissionCoeffF);
	XMLSerializer.dumpAttr(elem, "nr", emissionCoeffR);
	XMLSerializer.dumpAttr(elem, "vaf", invEarlyVoltF);
	XMLSerializer.dumpAttr(elem, "var", invEarlyVoltR);
	XMLSerializer.dumpAttr(elem, "br", betaR);
	if (junctionCapBE != 0) {
	    XMLSerializer.dumpAttr(elem, "cje", junctionCapBE);
	    XMLSerializer.dumpAttr(elem, "vje", junctionPotBE);
	    XMLSerializer.dumpAttr(elem, "mje", junctionExpBE);
	}
	if (junctionCapBC != 0) {
	    XMLSerializer.dumpAttr(elem, "cjc", junctionCapBC);
	    XMLSerializer.dumpAttr(elem, "vjc", junctionPotBC);
	    XMLSerializer.dumpAttr(elem, "mjc", junctionExpBC);
	}
	if (transitTimeF != 0)
	    XMLSerializer.dumpAttr(elem, "tf", transitTimeF);
	if (transitTimeR != 0)
	    XMLSerializer.dumpAttr(elem, "tr", transitTimeR);
	doc.getDocumentElement().appendChild(elem);
    }

    static TransistorModel undumpModelXml(XMLDeserializer xml) {
	String name = xml.parseStringAttr("nm", null);
	TransistorModel tm = TransistorModel.getModelWithName(name);
	tm.undumpXml(xml);
	return tm;
    }

    void undumpXml(XMLDeserializer xml) {
	flags = xml.parseIntAttr("f", flags);
	satCur = xml.parseDoubleAttr("is", satCur);
	invRollOffF = xml.parseDoubleAttr("ikf", invRollOffF);
	BEleakCur = xml.parseDoubleAttr("ise", BEleakCur);
	leakBEemissionCoeff = xml.parseDoubleAttr("ne", leakBEemissionCoeff);
	invRollOffR = xml.parseDoubleAttr("ikr", invRollOffR);
	BCleakCur = xml.parseDoubleAttr("isc", BCleakCur);
	leakBCemissionCoeff = xml.parseDoubleAttr("nc", leakBCemissionCoeff);
	emissionCoeffF = xml.parseDoubleAttr("nf", emissionCoeffF);
	emissionCoeffR = xml.parseDoubleAttr("nr", emissionCoeffR);
	invEarlyVoltF = xml.parseDoubleAttr("vaf", invEarlyVoltF);
	invEarlyVoltR = xml.parseDoubleAttr("var", invEarlyVoltR);
	betaR = xml.parseDoubleAttr("br", betaR);
	junctionCapBE = xml.parseDoubleAttr("cje", junctionCapBE);
	junctionPotBE = xml.parseDoubleAttr("vje", junctionPotBE);
	junctionExpBE = xml.parseDoubleAttr("mje", junctionExpBE);
	junctionCapBC = xml.parseDoubleAttr("cjc", junctionCapBC);
	junctionPotBC = xml.parseDoubleAttr("vjc", junctionPotBC);
	junctionExpBC = xml.parseDoubleAttr("mjc", junctionExpBC);
	transitTimeF = xml.parseDoubleAttr("tf", transitTimeF);
	transitTimeR = xml.parseDoubleAttr("tr", transitTimeR);
	updateModel();
    }
}
