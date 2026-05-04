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

    static String escapeXml(String s) {
	return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

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
                sb.append(" ").append(attr.getNodeName()).append("=\"").append(escapeXml(attr.getNodeValue())).append("\"");
            }
        }

        NodeList children = node.getChildNodes();
        if (children.getLength() == 0) {
            // Self-closing tag if no children
            sb.append("/>\n");
        } else {
            sb.append(">");

            // Recursively process children
            boolean hasElementChildren = false;
            for (int i = 0; i < children.getLength(); i++) {
                Node child = children.item(i);
                if (child.getNodeType() == Node.ELEMENT_NODE) {
		    if (!hasElementChildren)
			sb.append("\n");
		    hasElementChildren = true;
                    sb.append(prettyPrint(child, indent + 1));
                } else if (child.getNodeType() == Node.TEXT_NODE) {
                    String text = child.getNodeValue().trim();
                    if (!text.isEmpty())
                        sb.append(escapeXml(text));
                }
            }

            // Closing tag - indent if we had element children
            if (hasElementChildren)
		sb.append(indentStr);
            sb.append("</").append(node.getNodeName()).append(">\n");
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
        f |= app.autoDCOnReset ? 128 : 0;
	XMLSerializer.dumpAttr(root, "f", f);
	XMLSerializer.dumpAttr(root, "ts", sim.maxTimeStep);
	XMLSerializer.dumpAttr(root, "ic", app.getIterCount());
	UIManager ui = app.ui;
	XMLSerializer.dumpAttr(root, "cb", ui.currentBar.getValue());
	XMLSerializer.dumpAttr(root, "pb", ui.powerBar.getValue());
	XMLSerializer.dumpAttr(root, "vr", CircuitElm.voltageRange);
	XMLSerializer.dumpAttr(root, "mts", sim.minTimeStep);
	if (sim.solverType != 0)
	    XMLSerializer.dumpAttr(root, "st", sim.solverType);

	for (CircuitElm ce: app.elmList) {
	    Element elem = doc.createElement(ce.getXmlDumpType());
	    ce.dumpXml(doc, elem);
	    ce.dumpXmlState(doc, elem);
	    root.appendChild(elem);
	}
	for (int i = 0; i != app.scopeManager.scopeCount; i++)
	    app.scopeManager.scopes[i].dumpXml(doc, root);
	for (int i = 0; i != app.adjustables.size(); i++)
	    app.adjustables.get(i).dumpXml(doc, root, app);
	if (app.hintType != -1) {
	    Element h = doc.createElement("h");
	    dumpAttr(h, "t", app.hintType);
	    dumpAttr(h, "i1", app.hintItem1);
	    dumpAttr(h, "i2", app.hintItem2);
	    root.appendChild(h);
	}
	return prettyPrint(doc);
    }

    static void checkAttr(Element elem, String name) {
	if (elem.getAttribute(name) != null)
	    throw new RuntimeException("naming conflict: " + name);
    }

    static void dumpAttr(Element elem, String name, String value) {
	checkAttr(elem, name);
	value = value.replace("&", "&amp;")
                .replace("\"", "&quot;")
                .replace("'", "&apos;")
                .replace("<", "&lt;");  // `>` doesn't need escaping
	elem.setAttribute(name, value);
    }

    static void dumpAttr(Element elem, String name, int value) { checkAttr(elem, name); elem.setAttribute(name, String.valueOf(value)); }

    static void dumpAttr(Element elem, String name, boolean value) { checkAttr(elem, name); elem.setAttribute(name, String.valueOf(value)); }

    static void dumpAttr(Element elem, String name, double value) { checkAttr(elem, name); elem.setAttribute(name, String.valueOf(value)); }
}

