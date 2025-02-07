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
import java.util.function.Consumer;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
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

    void readCircuit(String text, int flags) {
        // Parse the XML
        Document doc = XMLParser.parse(text);
        
        // Get the root element
        Element root = doc.getDocumentElement();
        
	// Get all child elements of root
        NodeList children = root.getChildNodes();

        app.elmList.clear();
        
        for (int i = 0; i < children.getLength(); i++) {
            Node node = children.item(i);
            if (node.getNodeType() != Node.ELEMENT_NODE)
		continue;

	    Element elem = (Element) node;
	    String tagName = elem.getTagName();
	    app.console("tag " + tagName);
	    if (tagName.equals("o"))
		continue;
	    
	    String x = elem.getAttribute("x");
	    app.console("x: " + x);
	    app.console("f: " + elem.getAttribute("f"));
	    String xs[] = x.split(" ");
	    int x1 = Integer.parseInt(xs[0]);
	    int y1 = Integer.parseInt(xs[1]);
	    int x2 = Integer.parseInt(xs[2]);
	    int y2 = Integer.parseInt(xs[3]);
	    int tint = (int) tagName.charAt(0);
	    String className;
	    if (tagName.length() > 1)
		className = tagName + "Elm";
	    else
		className = CirSim.dumpTypeMap.get(tint);
	    CircuitElm elm = app.constructElement(className, 0, 0);
	    currentXmlElement = elem;
	    currentElm = elm;
	    elm.undumpXml(this);
	    app.console("des " + elm + " " + className);
	    elm.setPosition(x1, y1, x2, y2);
	    app.elmList.add(elm);
	}
        app.needAnalyze();
    }

    public void parseDoubleAttr(String attr, Consumer<Double> setter) {
	String v = currentXmlElement.getAttribute(attr);
	if (v == null)
	    return;
	setter.accept(Double.parseDouble(v));
    }

    public void parseIntAttr(String attr, Consumer<Integer> setter) {
	String v = currentXmlElement.getAttribute(attr);
	if (v == null)
	    return;
	setter.accept(Integer.parseInt(v));
    }
    
    public void parseBooleanAttr(String attr, Consumer<Boolean> setter) {
	String v = currentXmlElement.getAttribute(attr);
	if (v == null)
	    return;
	setter.accept(Boolean.parseBoolean(v));
    }
    
    public void parseStringAttr(String attr, Consumer<String> setter) {
	String s = currentXmlElement.getAttribute(attr);
	if (s == null)
	    return;
	setter.accept(s);
    }

}

