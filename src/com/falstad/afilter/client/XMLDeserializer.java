package com.falstad.afilter.client;

import java.util.List;
import java.util.ArrayList;

import com.google.gwt.xml.client.XMLParser;
import com.google.gwt.xml.client.Document;
import com.google.gwt.xml.client.Element;
import com.google.gwt.xml.client.Node;
import com.google.gwt.xml.client.NodeList;

class XMLDeserializer {

    CirSim app;
    Element currentXmlElement;

    XMLDeserializer(CirSim app_) { app = app_; }

    void readCircuit(String text, boolean retain) {
        Document doc = XMLParser.parse(text);
        Element root = doc.getDocumentElement();
	currentXmlElement = root;

	if (!retain) {
	    int flags = parseIntAttr("f", 0);
	    app.dotsCheckItem.setState((flags & 1) != 0);
	    app.smallGridCheckItem.setState((flags & 2) != 0);
	    app.powerCheckItem.setState((flags & 8) != 0);
	    app.showValuesCheckItem.setState((flags & 16) == 0);
	    app.timeStep = parseDoubleAttr("ts", app.timeStep);
	    app.currentBar.setValue(parseIntAttr("cb", app.currentBar.getValue()));
	    app.powerBar.setValue(parseIntAttr("pb", app.powerBar.getValue()));
	    CircuitElm.voltageRange = parseDoubleAttr("vr", CircuitElm.voltageRange);
	    int ff = parseIntAttr("ff", 0);
	    app.linearCheckItem.setState((ff & 1) != 0);
	    app.phaseCheckItem.setState((ff & 4) != 0);
	    double mf = parseDoubleAttr("mf", app.maxFrequency);
	    app.maxFrequency = mf;
	    double log1 = Math.log(1000 / app.minFrequency);
	    double log2 = Math.log(2e10 / app.minFrequency);
	    int mfi = (int) ((Math.log(mf / app.minFrequency) - log1) * 100 / (log2 - log1));
	    app.zoomBar.setValue(mfi);
	    app.setGrid();
	}

	readElements(root);
    }

    void readElements(Element root) {
	NodeList children = root.getChildNodes();
	for (int i = 0; i < children.getLength(); i++) {
	    Node node = children.item(i);
	    if (node.getNodeType() != Node.ELEMENT_NODE)
		continue;

	    Element elem = (Element) node;
	    String tagName = elem.getTagName();

	    if (tagName.equals("h")) {
		currentXmlElement = elem;
		app.hintType  = parseIntAttr("t", -1);
		app.hintItem1 = parseIntAttr("i1", 0);
		app.hintItem2 = parseIntAttr("i2", 0);
		continue;
	    }

	    if (tagName.equals("adj")) {
		currentXmlElement = elem;
		Adjustable.undumpXml(this, app);
		continue;
	    }

	    currentXmlElement = elem;
	    Customizer cust = CirSim.createCustomizer(tagName, parseIntAttr("f", 0), null);
	    if (cust != null) {
		cust.undumpXml(this);
		app.releaseCustomizer();
		app.customizer = cust;
		continue;
	    }

	    String x = elem.getAttribute("x");
	    if (x == null)
		continue;
	    String className = CirSim.xmlDumpTypeMap.get(tagName);
	    if (className == null) {
		app.console("unrecognized xml element: " + tagName);
		continue;
	    }
	    CircuitElm elm = app.constructElement(className, 0, 0);
	    if (elm == null) {
		app.console("could not construct: " + className);
		continue;
	    }
	    currentXmlElement = elem;
	    elm.undumpXml(this);
	    elm.setPositionFromXml(elem);
	    app.elmList.addElement(elm);
	}
    }

    public double parseDoubleAttr(String attr, double def) {
	String v = currentXmlElement.getAttribute(attr);
	if (v == null || v.isEmpty())
	    return def;
	return Double.parseDouble(v);
    }

    public int parseIntAttr(String attr, int def) {
	String v = currentXmlElement.getAttribute(attr);
	if (v == null || v.isEmpty())
	    return def;
	return Integer.parseInt(v);
    }

    public boolean parseBooleanAttr(String attr, boolean def) {
	String v = currentXmlElement.getAttribute(attr);
	if (v == null || v.isEmpty())
	    return def;
	return Boolean.parseBoolean(v);
    }

    public String parseStringAttr(String attr, String def) {
	String s = currentXmlElement.getAttribute(attr);
	if (s == null || s.isEmpty())
	    return def;
    	s = s.replace("&quot;", "\"")
             .replace("&apos;", "'")
             .replace("&lt;", "<")
             .replace("&gt;", ">")
             .replace("&amp;", "&");
	return s;
    }

    public List<Element> getChildElements() {
        List<Element> elements = new ArrayList<Element>();
        NodeList children = currentXmlElement.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            Node node = children.item(i);
            if (node.getNodeType() == Node.ELEMENT_NODE)
                elements.add((Element) node);
        }
        return elements;
    }

    public void parseChildElement(Element e) { currentXmlElement = e; }
}
