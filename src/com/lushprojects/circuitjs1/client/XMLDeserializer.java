/*    
    Copyright (C) Paul Falstad
    
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

import java.util.Vector;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import java.util.Random;
import java.lang.Math;

import com.google.gwt.xml.client.XMLParser;
import com.google.gwt.xml.client.Document;
import com.google.gwt.xml.client.Element;
import com.google.gwt.xml.client.NamedNodeMap;
import com.google.gwt.xml.client.Node;
import com.google.gwt.xml.client.NodeList;

class XMLDeserializer {

    CirSim app;

    XMLDeserializer(CirSim app_) { app = app_; }

    Element currentXmlElement;
    CircuitElm currentElm;

    void readCircuit(String text, int readFlags) {
        // Parse the XML
        Document doc = XMLParser.parse(text);
        
        // Get the root element
        Element root = doc.getDocumentElement();
        
	// Get all child elements of root
        NodeList children = root.getChildNodes();

	app.clearCircuit();
	currentXmlElement = root;

        int flags = parseIntAttr("f", 0);
	app.loader.readCircuitFlags(flags);
	SimulationManager sim = app.sim;
        sim.maxTimeStep = sim.timeStep = parseDoubleAttr("ts", sim.maxTimeStep);
        double sp = parseDoubleAttr("ic", app.getIterCount());
        int sp2 = (int) (Math.log(10*sp)*24+61.5);
        app.speedBar.setValue(sp2);
        app.currentBar.setValue(parseIntAttr("cb", app.currentBar.getValue()));
        CircuitElm.voltageRange = parseDoubleAttr("vr", CircuitElm.voltageRange);
	app.powerBar.setValue(parseIntAttr("pb", app.powerBar.getValue()));
        sim.minTimeStep = parseDoubleAttr("mts", sim.minTimeStep);
        app.setGrid();
        
        for (int i = 0; i < children.getLength(); i++) {
            Node node = children.item(i);
            if (node.getNodeType() != Node.ELEMENT_NODE)
		continue;

	    Element elem = (Element) node;
	    String tagName = elem.getTagName();
	    
	    if (tagName.equals("o")) {
		Scope sc = new Scope(app, app.sim);
		currentXmlElement = elem;
		sc.undumpXml(this);
		app.scopeManager.addScope(sc);
		continue;
	    }
	    if (tagName.equals("dm")) {
		currentXmlElement = elem;
		DiodeModel.undumpModelXml(this);
		continue;
	    }
	    if (tagName.equals("tm")) {
		currentXmlElement = elem;
		TransistorModel.undumpModelXml(this);
		continue;
	    }
	    if (tagName.equals("clm")) {
		currentXmlElement = elem;
		CustomLogicModel.undumpModelXml(this);
		continue;
	    }
	    if (tagName.equals("ccm")) {
		currentXmlElement = elem;
		CustomCompositeModel.undumpModelXml(this);
		continue;
	    }
	    
	    String x = elem.getAttribute("x");
	    String xs[] = x.split(" ");
	    int x1 = Integer.parseInt(xs[0]);
	    int y1 = Integer.parseInt(xs[1]);
	    int x2 = Integer.parseInt(xs[2]);
	    int y2 = Integer.parseInt(xs[3]);
	    String className = CirSim.xmlDumpTypeMap.get(tagName);
	    if (className == null) {
		app.console("unrecognized xml element: " + tagName);
		continue;
	    }
	    CircuitElm elm = app.constructElement(className, 0, 0);
	    currentXmlElement = elem;
	    currentElm = elm;
	    elm.undumpXml(this);
	    elm.setPosition(x1, y1, x2, y2);
	    app.elmList.add(elm);
	}
        app.needAnalyze();
    }

    public double parseDoubleAttr(String attr, double def) {
	String v = currentXmlElement.getAttribute(attr);
	if (v == null)
	    return def;
	return Double.parseDouble(v);
    }

    public int parseIntAttr(String attr, int def) {
	String v = currentXmlElement.getAttribute(attr);
	if (v == null)
	    return def;
	return Integer.parseInt(v);
    }
    
    public boolean parseBooleanAttr(String attr, boolean def) {
	String v = currentXmlElement.getAttribute(attr);
	if (v == null)
	    return def;
	return Boolean.parseBoolean(v);
    }
    
    public String parseStringAttr(String attr, String def) {
	String s = currentXmlElement.getAttribute(attr);
	if (s == null)
	    return def;
    	s = s.replace("&quot;", "\"")
             .replace("&apos;", "'")
             .replace("&lt;", "<")
             .replace("&gt;", ">")
             .replace("&amp;", "&");
	return s;
    }

    public String parseContents() {
	return currentXmlElement.getFirstChild().getNodeValue();
    }

    public List<Element> getChildElements() {
        List<Element> elements = new ArrayList<>();
        NodeList children = currentXmlElement.getChildNodes();
        
        for (int i = 0; i < children.getLength(); i++) {
            Node node = children.item(i);
            if (node.getNodeType() == Node.ELEMENT_NODE) {
                elements.add((Element) node);
            }
        }
        return elements;
    }

    public void parseChildElement(Element e) { currentXmlElement = e; }
}

