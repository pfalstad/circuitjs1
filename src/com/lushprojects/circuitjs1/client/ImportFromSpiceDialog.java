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

import com.google.gwt.user.client.ui.DialogBox;
import com.google.gwt.user.client.ui.TextArea;
import com.google.gwt.user.client.ui.Button;
import com.google.gwt.user.client.ui.VerticalPanel;
import com.google.gwt.user.client.ui.HorizontalPanel;
import com.google.gwt.event.dom.client.ClickHandler;

import java.util.HashMap;
import java.util.Vector;

import com.google.gwt.event.dom.client.ClickEvent;
import com.google.gwt.user.client.ui.Label;
import com.lushprojects.circuitjs1.client.util.Locale;

public class ImportFromSpiceDialog extends DialogBox {

VerticalPanel vp;
HorizontalPanel hp;
TextArea textArea;
TextArea outputArea;

	public ImportFromSpiceDialog() {
		super();
		Button okButton, cancelButton;
		vp=new VerticalPanel();
		setWidget(vp);
		setText(Locale.LS("Import Subcircuit from Spice"));
		vp.add(new Label(Locale.LS("Paste the text file for your subcircuit here...")));
		vp.add(textArea = new TextArea());
		textArea.getElement().setAttribute("spellcheck", "false");
		textArea.setWidth("300px");
		textArea.setHeight("200px");
		vp.add(outputArea = new TextArea());
		outputArea.setWidth("300px");
		outputArea.setHeight("100px");
		hp = new HorizontalPanel();
		vp.add(hp);
		hp.add(okButton = new Button(Locale.LS("OK")));
		okButton.addClickHandler(new ClickHandler() {
			public void onClick(ClickEvent event) {
			    parseCircuit();
			}
		});
		hp.add(cancelButton = new Button(Locale.LS("Cancel")));
		cancelButton.addClickHandler(new ClickHandler() {
			public void onClick(ClickEvent event) {
				closeDialog();
			}
		});
		this.center();
		show();
	}

	protected void closeDialog()
	{
		this.hide();
	}

	Vector<String> nodes;

	class TransistorModelImport {
	    int pnp;
	    double beta;
	    String name;
	    double cjc, cje;
	    double rc, re, rb;
	    Vector<String> areaModelNames;
	    TransistorModelImport() {
		beta = 100;
		areaModelNames = new Vector<String>();
	    }
	}

	class FetModelImport {
	    int pnp;
	    double beta, vto;
	    FetModelImport() {
		pnp = 1;
		beta = 1e-3;
		vto = -2;
	    }
	}

	class VoltageSource {
	    String node1, node2;
	}

	String elmDump, ldump;

	void skipToken(BetterStringTokenizer st, String tok) throws Exception {
	    if (!st.nextToken().equals(tok))
		throw new Exception();
	}

	Vector<String> getLines(String text) {
	    Vector<String> vec = new Vector<String>();

	    StringTokenizer lineSt = new StringTokenizer(text, "\n\r");
	    while (lineSt.hasMoreTokens()) {
		String s = lineSt.nextToken();
		if (s.startsWith("+") && vec.size() > 0)
		    vec.set(vec.size()-1, vec.lastElement() + s.substring(1));
		else
		    vec.add(s);
	    }
	    return vec;
	}

	HashMap<String,VoltageSource> voltageSources;

	void parseCircuit() {
	    String text = textArea.getText();
	    Vector<String> lines = getLines(text);
	    Vector<String> elements = new Vector<String>();
	    HashMap<String,TransistorModelImport> transistorModels = new HashMap<String,TransistorModelImport>();
	    HashMap<String,FetModelImport> fetModels = new HashMap<String,FetModelImport>();
	    voltageSources = new HashMap<String,VoltageSource>();
	    nodes = new Vector<String>();
	    Vector<ExtListEntry> extList = new Vector<ExtListEntry>();
	    String subcircuitName = null;
	    outputArea.setText("");

	    // first pass, get a list of models and nodes
	    int ln;
	    for (ln = 0; ln != lines.size(); ln++) {
		String line = lines.get(ln);
		output("got line " + line);
		BetterStringTokenizer st = new BetterStringTokenizer(line, " \t\f()");
		if (!st.hasMoreTokens())
		    continue;
		String first = st.nextToken();
		if (first.startsWith("*"))
		    continue;
		try {
		    if (first.startsWith(".subckt")) {
			if (subcircuitName != null) {
			    output("multiple subcircuits!");
			    return;
			}
			subcircuitName = st.nextToken();
			while (st.hasMoreTokens()) {
			    String n = st.nextToken();
			    nodes.add(n);
			    extList.add(new ExtListEntry(n, nodes.size()));
			}
			continue;
		    }
		    if (first.equals(".ends"))
			continue;
		    if (first.startsWith(".model")) {
			String name = st.nextToken();
			String type = st.nextToken();
			if (type.equalsIgnoreCase("pnp") || type.equalsIgnoreCase("npn")) {
			    TransistorModelImport tmi = new TransistorModelImport();
			    tmi.pnp = (type.equalsIgnoreCase("pnp")) ? -1 : 1;
			    tmi.name = subcircuitName + "-" + name;
			    TransistorModel tm = TransistorModel.getModelWithName(tmi.name);
			    tm.satCur = 1e-16;
			    while (st.hasMoreTokens()) {
				String s = st.nextToken();
				if (s.startsWith("bf=")) {
				    double bf = parseNumber(s.substring(3));
				    tmi.beta = bf;
				}
				if (s.startsWith("is=")) { tm.satCur = parseNumber(s.substring(3)); }
				if (s.startsWith("br=")) { tm.betaR = parseNumber(s.substring(3)); }
				if (s.startsWith("ne=")) { tm.leakBEemissionCoeff = parseNumber(s.substring(3)); }
				if (s.startsWith("nc=")) { tm.leakBCemissionCoeff = parseNumber(s.substring(3)); }
				if (s.startsWith("nf=")) { tm.emissionCoeffF = parseNumber(s.substring(3)); }
				if (s.startsWith("nr=")) { tm.emissionCoeffR = parseNumber(s.substring(3)); }
				if (s.startsWith("vaf=")) { tm.invEarlyVoltF = 1/parseNumber(s.substring(4)); }
				if (s.startsWith("var=")) { tm.invEarlyVoltR = 1/parseNumber(s.substring(4)); }
				if (s.startsWith("ikf=")) { tm.invRollOffF = 1/parseNumber(s.substring(4)); }
				if (s.startsWith("ikr=")) { tm.invRollOffR = 1/parseNumber(s.substring(4)); }
				if (s.startsWith("ise=")) { tm.BEleakCur = parseNumber(s.substring(4)); }
				if (s.startsWith("isc=")) { tm.BCleakCur = parseNumber(s.substring(4)); }
				if (s.startsWith("cje="))
				    tmi.cje = parseCapacitance(s.substring(4));
				if (s.startsWith("cjc="))
				    tmi.cjc = parseCapacitance(s.substring(4));
				if (s.startsWith("rc="))
				    tmi.rc = parseCapacitance(s.substring(3));
				if (s.startsWith("re="))
				    tmi.re = parseCapacitance(s.substring(3));
				if (s.startsWith("rb="))
				    tmi.rb = parseCapacitance(s.substring(3));
			    }
			    output("found transistor model " + name);
			    transistorModels.put(name, tmi);
			}
			if (type.equalsIgnoreCase("d")) {
			    DiodeModel dm = DiodeModel.getModelWithName(subcircuitName + "-" + name);
			    while (st.hasMoreTokens()) {
				String s = st.nextToken();
				if (s.startsWith("is="))
				    dm.saturationCurrent = parseNumber(s.substring(3));
				else if (s.startsWith("rs="))
				    dm.seriesResistance = parseNumber(s.substring(3));
				else if (s.startsWith("n="))
				    dm.emissionCoefficient = parseNumber(s.substring(2));
				else if (s.startsWith("bv="))
				    dm.breakdownVoltage = parseNumber(s.substring(3));
			    }
			}
			if (type.equalsIgnoreCase("njf") || type.equalsIgnoreCase("pjf")) {
			    FetModelImport fm = new FetModelImport();
			    if (type.equalsIgnoreCase("pjf"))
				fm.pnp = -1;
			    while (st.hasMoreTokens()) {
				String s = st.nextToken();
				if (s.startsWith("vto="))
				    fm.vto = parseNumber(s.substring(4));
				else if (s.startsWith("beta="))
				    fm.beta = parseNumber(s.substring(5));
			    }
			    fetModels.put(name, fm);
			}
			continue;
		    }
		    if (first.startsWith(".rename")) {
			int i = 0;
			while (st.hasMoreTokens()) {
			    String toStr = st.nextTokenPreserveCase();
			    extList.get(i++).setName(toStr);
			}
			continue;
		    }

		    elements.add(first);
		    int nodeCount = 0;
		    char c = first.charAt(0);
		    if ("bcdfhilrv".indexOf(c) >= 0)
			nodeCount = 2;
		    else if ("qjm".indexOf(c) >= 0)
			nodeCount = 3;
		    else if (c == 'e' || c == 'g')
			nodeCount = 2;     // might be POLY, just look at first two nodes
		    else if (c == 'x') {
			output("nested subcircuits not supported");
			return;
		    } else {
			output("can't understand line: " + line);
			return;
		    }
		    int i;
		    if (nodeCount == 0)
			output("no nodes in " + first);

		    // need to keep track of voltage sources and their nodes to implement f and h
		    if (c == 'v') {
			String n1 = st.nextToken();
			String n2 = st.nextToken();
			if (!nodes.contains(n1) && !n1.equals("0"))
			    nodes.add(n1);
			if (!nodes.contains(n2) && !n2.equals("0"))
			    nodes.add(n2);
			VoltageSource vs = new VoltageSource();
			vs.node1 = n1;
			vs.node2 = n2;
			voltageSources.put(first, vs);
			continue;
		    }

		    for (i = 0; i != nodeCount; i++) {
			String n = st.nextToken();
			if (!nodes.contains(n) && !n.equals("0"))
			    nodes.add(n);
		    }
		} catch (Exception e) {
		    output("exception when parsing line: " + line);
		}
	    }

	    output("nodes: " + nodes);

	    // second pass
	    elmDump = "";
	    String dump = "";
	    int extraNode = nodes.size()+1;
	    for (ln = 0; ln != lines.size(); ln++) {
		String line = lines.get(ln);
		BetterStringTokenizer st = new BetterStringTokenizer(line, " \t\f");
		if (!st.hasMoreTokens())
		    continue;
		String first = st.nextToken();
		if (first.startsWith("*"))
		    continue;
		try {
		    if (first.equals(".subckt")) {
			while (st.hasMoreTokens())
			    nodes.add(st.nextToken());
			continue;
		    }
		    if (first.equals(".ends") || first.equals(".model"))
			continue;
		    char c = first.charAt(0);
		    if (c == 'c') {
			String n1 = st.nextToken();
			String n2 = st.nextToken();
			double cap = parseCapacitance(st.nextToken());
			elmDump += "CapacitorElm " + findNode(n1) + " "+ findNode(n2) + "\r";
			// add FLAG_BACK_EULER because that is probably the most appropriate setting for spice models
			ldump = "2 " + cap + " 0 0";
		    } else if (c == 'r') {
			String n1 = st.nextToken();
			String n2 = st.nextToken();
			String restxt = st.nextToken();
			// skip model if present
			char cd = restxt.charAt(0);
			if (!(cd >= '0' && cd <= '9') && cd != '.')
			    restxt = st.nextToken();
			double res = parseNumber(restxt);
			elmDump += "ResistorElm " + findNode(n1) + " "+ findNode(n2) + "\r";
			ldump = "0 " + res;
		    } else if (c == 'd') {
			String n1 = st.nextToken();
			String n2 = st.nextToken();
			String mod = st.nextToken();
			elmDump += "DiodeElm " + findNode(n1) + " "+ findNode(n2) + "\r";
			// 2 = FLAG_MODEL
			ldump = "2 " + CustomLogicModel.escape(subcircuitName + "-" + mod);
		    } else if (c == 'i') {
			String n1 = st.nextToken();
			String n2 = st.nextToken();
			String x = st.nextToken();
			if (x.equalsIgnoreCase("dc"))
			    x = st.nextToken();
			double cur = parseNumber(x);
			elmDump += "CurrentElm " + findNode(n1) + " "+ findNode(n2) + "\r";
			ldump = "0 " + cur;
		    } else if (c == 'q') {
			String n1 = st.nextToken();
			String n2 = st.nextToken();
			String n3 = st.nextToken();
			String mod = st.nextToken();
			double area = 1;
			if (st.hasMoreTokens()) {
			    String as = st.nextToken();
			    if (as.startsWith("area="))
				area = Double.parseDouble(as.substring(5));
			    else
				area = Double.parseDouble(as);
			}
			TransistorModelImport tm = transistorModels.get(mod);
			int collector = findNode(n1);
			int base = findNode(n2);
			int emitter = findNode(n3);
			if (tm.rc > 0) {
			    // add resistor at collector
			    int n = extraNode++;
			    elmDump += "ResistorElm " + collector + " " + n + "\r";
			    if (dump.length() > 0)
				dump += " ";
			    dump += CustomLogicModel.escape("0 " + tm.rc/area);
			    collector = n;
			}
			if (tm.rb > 0) {
			    // add resistor at base
			    int n = extraNode++;
			    elmDump += "ResistorElm " + base + " " + n + "\r";
			    if (dump.length() > 0)
				dump += " ";
			    dump += CustomLogicModel.escape("0 " + tm.rb/area);
			    base = n;
			}
			if (tm.re > 0) {
			    // add resistor at emitter
			    int n = extraNode++;
			    elmDump += "ResistorElm " + emitter + " " + n + "\r";
			    if (dump.length() > 0)
				dump += " ";
			    dump += CustomLogicModel.escape("0 " + tm.re/area);
			    emitter = n;
			}
			if (tm.cje > 0) {
			    // add capacitor for base-emitter junction (with FLAG_BACK_EULER)
			    elmDump += "CapacitorElm " + base + " " + emitter + "\r";
			    if (dump.length() > 0)
				dump += " ";
			    dump += CustomLogicModel.escape("2 " + tm.cje*area + " 0 0");
			}
			if (tm.cjc > 0) {
			    // add capacitor for base-collector junction
			    elmDump += "CapacitorElm " + base + " " + collector + "\r";
			    if (dump.length() > 0)
				dump += " ";
			    dump += CustomLogicModel.escape("2 " + tm.cjc*area + " 0 0");
			}
			elmDump += "TransistorElm " + base + " " + collector + " " + emitter + " " + "\r";
			ldump = "0 " + tm.pnp + " 0 0 " + tm.beta + " " + getTransistorModelWithArea(tm, area);
		    } else if (c == 'j') {
			String n1 = st.nextToken();
			String n2 = st.nextToken();
			String n3 = st.nextToken();
			String mod = st.nextToken();
			FetModelImport fm = fetModels.get(mod);
			int drain = findNode(n1);
			int gate = findNode(n2);
			int source = findNode(n3);
			elmDump += "JfetElm " + gate + " " + source + " " + drain + " " + "\r";
			ldump = ((fm.pnp == -1) ? "1" : "0") + " " + fm.vto + " " + fm.beta;
		    } else if (c == 'l') {
			String n1 = st.nextToken();
			String n2 = st.nextToken();
			double ind = parseNumber(st.nextToken());
			elmDump += "InductorElm " + findNode(n1) + " "+ findNode(n2) + "\r";
			// add FLAG_BACK_EULER because that is probably the most appropriate setting for spice models
			ldump = "2 " + ind + " 0";
		    } else if (c == 'v') {
			String n1 = st.nextToken();
			String n2 = st.nextToken();
			String x = st.nextToken();
			if (x.equalsIgnoreCase("dc"))
			    x = st.nextToken();
			double v = parseNumber(x);
			// higher voltage node comes first for spice, last for us.
			// rather than swap nodes, swap the sign of the voltage because
			// it simplifies things for controlled sources
			elmDump += "VoltageElm " + findNode(n1) + " "+ findNode(n2) + "\r";
			ldump = "0 0 0 " + (-v);
		    } else if (c == 'e') {
			parseControlledSource("VCVSElm", st, false);
		    } else if (c == 'g') {
			parseControlledSource("VCCSElm", st, false);
		    } else if (c == 'b') {
			parseBSource(st);
		    } else if (c == 'h') {
			parseControlledSource("CCVSElm", st, true);
		    } else if (c == 'f') {
			parseControlledSource("CCCSElm", st, true);
		    } else {
			output("skipping " + first);
			continue;
		    }
		    if (dump.length() > 0)
			dump += " ";
		    dump += CustomLogicModel.escape(ldump);
		} catch (Exception e) {
		    output("exception when parsing line: " + line);
		    return;
		}
	    }
	    if (subcircuitName == null) {
		output("No model!");
		return;
	    }
	    output("elmDump\n" + elmDump);
	    output("\ndump\n" + dump);

	    CustomCompositeModel ccm = new CustomCompositeModel();
	    ccm.extList = extList;
	    ccm.convertOldFormatToXml(elmDump, dump);

	    EditCompositeModelDialog dlg = new EditCompositeModelDialog();
	    dlg.defaultName = subcircuitName;
	    if (!dlg.loadModel(ccm))
	        return;
	    closeDialog();
	    dlg.createDialog();
	    CirSim.dialogShowing = dlg;
	    dlg.show();
	}

	// get/create variant of transistor model with a particular area
	String getTransistorModelWithArea(TransistorModelImport tmi, double area) {
	    if (area == 1)
		return tmi.name;
	    String n = tmi.name + "-A" + area;
	    if (tmi.areaModelNames.contains(n))
		return n;

	    // create new model from old
	    TransistorModel tm1 = TransistorModel.getModelWithName(tmi.name);
	    TransistorModel tm = TransistorModel.getModelWithNameOrCopy(n, tm1);

	    // adjust parameters as necessary for area
	    tm.satCur = tm1.satCur*area;
	    tm.invRollOffF = tm1.invRollOffF/area;
	    tm.BEleakCur = tm1.BEleakCur*area;
	    tm.invRollOffR = tm1.invRollOffR/area;
	    tm.BCleakCur = tm1.BCleakCur*area;
	    tmi.areaModelNames.add(n);
	    return n;
	}

	void parseBSource(BetterStringTokenizer st) throws Exception {
	    String outn1 = st.nextToken();
	    String outn2 = st.nextToken();
	    st.setDelimiters("*+=/(,) ");
	    skipToken(st, "i");
	    parseControlledSourceExpr(st, "VCCSElm", outn2, outn1);
	}

	void parseControlledSourceExpr(BetterStringTokenizer st, String cls, String outn1, String outn2) throws Exception {
	    Vector<String> inputs = new Vector<String>();
	    String expr = "";
	    skipToken(st, "=");
	    while (st.hasMoreTokens()) {
		String s = st.nextToken();
		if (s.equals("{"))
		    continue;
		if (s.equals("}"))
		    break;
		if (s.equals("v")) {
		    skipToken(st, "(");
		    String n1 = st.nextToken();
		    int inct = inputs.size();
		    inputs.add(n1);
		    String n2 = null;
		    String s2 = st.nextToken();
		    if (s2.equals(",")) {
			n2 = st.nextToken();
			s2 = st.nextToken();
			inputs.add(n2);
			expr += "(" + getLetter(inct) + "-" + getLetter(inct+1) + ")";
		    } else
			expr += getLetter(inct);
		    if (!s2.equals(")"))
			throw new Exception();
		    output("nodes " + n1 + " and " + n2);
		} else
		    expr += s;
	    }
	    elmDump += cls;
	    int i;
	    for (i = 0; i != inputs.size(); i++)
		elmDump += " " + findNode(inputs.get(i));
	    elmDump += " " + findNode(outn1) + " " + findNode(outn2) + "\r";
	    ldump = "0 " + inputs.size() + " " + expr;
	}

	String getLetter(int ch) {
	    return Character.toString((char)('a'+ch));
	}

	void parseControlledSource(String cls, BetterStringTokenizer st, boolean cc) throws Exception {
	    // get output nodes
	    String n1 = st.nextToken();
	    String n2 = st.nextToken();
	    int flags = (cls.startsWith("CC")) ? 2 : 0;

	    // swap output nodes for current sources because current flows the opposite way
	    // (output nodes come first for spice, last for us)
	    if (cls.endsWith("CSElm")) {
		String x = n1;
		n1 = n2;
		n2 = x;
	    }

	    st.setDelimiters(" =");
	    String n3 = st.nextToken();
	    if (n3.equals("value")) {
		st.setDelimiters(" ={}()+-*/,");
		if (cc)
		    throw new Exception();
		parseControlledSourceExpr(st, cls, n1, n2);
		return;
	    }
	    if (!n3.startsWith("poly")) {
		// not a POLY, just simple linear controlled source with two control inputs
		String n4;
		if (cc) {
		    // current controlled source, convert voltage source to node pair
		    VoltageSource vs = voltageSources.get(n3);
		    n3 = vs.node1;
		    n4 = vs.node2;
		} else {
		    // get second node for voltage controlled source
		    n4 = st.nextToken();
		}
		double mult = parseNumber(st.nextToken());
		elmDump += cls + " " + findNode(n3) + " " + findNode(n4) + " " + findNode(n1) + " " + findNode(n2) + "\r";
		ldump = flags + " 2 " + mult + "*(a-b)";
		return;
	    }

	    // need to parse POLY, first get dimension
	    int dim = getPolyDim(n3);

	    // get inputs
	    String inputs[] = new String[dim*2];
	    String inputExprs[] = new String[dim];
	    int i;
	    elmDump += cls + " ";
	    int inputCount = 0;

	    // parse list of inputs of form (a,b)
	    for (i = 0; i != dim; i++) {
		StringTokenizer st2 = new StringTokenizer(st.nextToken(), "(),");
		String na = st2.nextToken();
		if (cc) {
		    // current-controlled source
		    VoltageSource vs = voltageSources.get(na);
		    inputExprs[i] = getLetter(inputCount/2);
		    inputs[inputCount++] = vs.node1;
		    inputs[inputCount++] = vs.node2;
		    continue;
		}
		inputs[inputCount] = na;
		inputExprs[i] = getLetter(inputCount++);
		if (st2.hasMoreTokens()) {
		    String nb = st2.nextToken();
		    if (!nb.equals("0")) {
			inputs[inputCount] = nb;
			inputExprs[i] = "(" + Character.toString((char)('a'+inputCount-1)) + "-" + Character.toString((char)('a'+inputCount)) + ")";
			inputCount++;
		    }
		}
	    }
	    for (i = 0; i != inputCount; i++)
		elmDump += findNode(inputs[i]) + " ";

	    elmDump += findNode(n1) + " " + findNode(n2) + "\r";

	    String expr = "";

	    // convert POLY to expression
	    for (i = 0; st.hasMoreTokens(); i++) {
		double x = Double.parseDouble(st.nextToken());
		if (x == 0)
		    continue;
		if (expr.length() > 0)
		    expr += "+";
		if (i == 0) {
		    expr = Double.toString(x);
		    continue;
		}
		// handle a few higher elements of POLY(2)
		if (dim == 2 && (i >= 3 && i <= 5)) {
		    expr += Double.toString(x) + "*" + inputExprs[i > 3 ? 1 : 0] + "*" + inputExprs[i > 4 ? 1 : 0];
		    continue;
		}
		// other than that, we only deal with the first n+1 terms of POLY(n).  need to improve this
		if (i > dim)
		    throw new Exception();
		expr += Double.toString(x) + "*" + inputExprs[i-1];
	    }
	    ldump = flags + " " + inputCount + " " + expr;
	}

	int getPolyDim(String s) {
	    int ix = s.indexOf('(');
	    return Integer.parseInt(s.substring(ix+1, s.length()-1));
	}

	double parseNumber(String str) throws Exception {
	    // NumberFormat.parse() can't handle lowercase e, so make it uppercase.
	    // spice M means milli, so make it lowercase.
	    str = str.replaceAll("e", "E").replaceAll("M", "m");
	    return EditDialog.parseUnits(str);
	}

	double parseCapacitance(String str) throws Exception {
	    // remove trailing f
	    return parseNumber(str.replaceAll("f$", ""));
	}

	int findNode(String node) {
	    return nodes.indexOf(node) + 1;
	}

	void output(String str) {
	    outputArea.setText(outputArea.getText() + str + "\n");
	}
}
