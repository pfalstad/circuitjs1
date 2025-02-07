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

// GWT conversion (c) 2015 by Iain Sharp

// For information about the theory behind this, see Electronic Circuit & System Simulation Methods by Pillage
// or https://github.com/sharpie7/circuitjs1/blob/master/INTERNALS.md

import java.util.Vector;
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

class XMLSerializer {

    CirSim app;

    XMLSerializer(CirSim app_) { app = app_; }

    public static String prettyPrint(Document doc) {
        return prettyPrint(doc.getDocumentElement(), 0);
    }

    private static String prettyPrint(Node node, int indent) {
        StringBuilder sb = new StringBuilder();
        String indentStr = "";
        for (int i = 0; i != indent; i++)
            indentStr += "  ";
        
        // Print opening tag
        sb.append(indentStr).append("<").append(node.getNodeName());

        // Add attributes
        NamedNodeMap attributes = node.getAttributes();
        if (attributes != null) {
            for (int i = 0; i < attributes.getLength(); i++) {
                Node attr = attributes.item(i);
                sb.append(" ").append(attr.getNodeName()).append("=\"").append(attr.getNodeValue()).append("\"");
            }
        }

        NodeList children = node.getChildNodes();
        if (children.getLength() == 0) {
            // Self-closing tag if no children
            sb.append("/>\n");
        } else {
            sb.append(">\n");

            // Recursively process children
            for (int i = 0; i < children.getLength(); i++) {
                Node child = children.item(i);
                if (child.getNodeType() == Node.ELEMENT_NODE) {
                    sb.append(prettyPrint(child, indent + 1));
                } else if (child.getNodeType() == Node.TEXT_NODE) {
                    String text = child.getNodeValue().trim();
                    if (!text.isEmpty()) {
                        sb.append(indentStr).append("  ").append(text).append("\n");
                    }
                }
            }

            // Closing tag
            sb.append(indentStr).append("</").append(node.getNodeName()).append(">\n");
        }

        return sb.toString();
    }

    String dumpCircuit() {
	Document doc = XMLParser.createDocument();
	Element root = doc.createElement("cir");
	doc.appendChild(root);

	Menus menus = app.menus;
        int f = (menus.dotsCheckItem.getState()) ? 1 : 0;
        f |= (menus.smallGridCheckItem.getState()) ? 2 : 0;
        f |= (menus.voltsCheckItem.getState()) ? 0 : 4;
        f |= (menus.powerCheckItem.getState()) ? 8 : 0;
        f |= (menus.showValuesCheckItem.getState()) ? 0 : 16;
        // 32 = linear scale in afilter
	SimulationManager sim = app.sim;
        f |= sim.adjustTimeStep ? 64 : 0;
	XMLSerializer.dumpAttrib(root, "f", f);
	XMLSerializer.dumpAttrib(root, "ts", sim.maxTimeStep);
	XMLSerializer.dumpAttrib(root, "ic", app.getIterCount());
	XMLSerializer.dumpAttrib(root, "cb", app.currentBar.getValue());
	XMLSerializer.dumpAttrib(root, "pb", app.powerBar.getValue());
	XMLSerializer.dumpAttrib(root, "vr", CircuitElm.voltageRange);
	XMLSerializer.dumpAttrib(root, "mts", sim.minTimeStep);

	for (CircuitElm ce: sim.elmList) {
	    int t = ce.getDumpType();
	    String n = (t < 127) ? Character.toString((char) t) : ce.getClassName().replace("Elm", "");
	    Element elem = doc.createElement(n);
	    ce.dumpXml(doc, elem);
	    ce.dumpXmlState(doc, elem);
	    root.appendChild(elem);
	}
	String dump = doc.toString();
	for (int i = 0; i != app.scopeCount; i++)
	    app.scopes[i].dumpXml(doc, root);
/*
	for (i = 0; i != adjustables.size(); i++) {
	    Adjustable adj = adjustables.get(i);
	    dump += "38 " + adj.dump() + "\n";
	}
	if (hintType != -1)
	    dump += "h " + hintType + " " + hintItem1 + " " +
		hintItem2 + "\n";
*/
	return prettyPrint(doc);
    }

    static void dumpAttrib(Element elem, String name, String value) { elem.setAttribute(name, value); }

    static void dumpAttrib(Element elem, String name, int value) { elem.setAttribute(name, String.valueOf(value)); }

    static void dumpAttrib(Element elem, String name, boolean value) { elem.setAttribute(name, String.valueOf(value)); }

    static void dumpAttrib(Element elem, String name, double value) { elem.setAttribute(name, String.valueOf(value)); }
}

