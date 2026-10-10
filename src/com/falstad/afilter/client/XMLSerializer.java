package com.falstad.afilter.client;

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

        sb.append(indentStr).append("<").append(node.getNodeName());

        NamedNodeMap attributes = node.getAttributes();
        if (attributes != null) {
            for (int i = 0; i < attributes.getLength(); i++) {
                Node attr = attributes.item(i);
                sb.append(" ").append(attr.getNodeName()).append("=\"").append(escapeXml(attr.getNodeValue())).append("\"");
            }
        }

        NodeList children = node.getChildNodes();
        if (children.getLength() == 0) {
            sb.append("/>\n");
        } else {
            sb.append(">");
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

        int f = (app.dotsCheckItem.getState()) ? 1 : 0;
        f |= (app.smallGridCheckItem.getState()) ? 2 : 0;
        f |= (app.powerCheckItem.getState()) ? 8 : 0;
        f |= (app.showValuesCheckItem.getState()) ? 0 : 16;
	dumpAttr(root, "f", f);
	dumpAttr(root, "ts", app.timeStep);
	dumpAttr(root, "cb", app.currentBar.getValue());
	dumpAttr(root, "pb", app.powerBar.getValue());
	dumpAttr(root, "vr", CircuitElm.voltageRange);

        int ff = 0;
        ff |= (app.linearCheckItem.getState()) ? 1 : 0;
        ff |= (app.phaseCheckItem.getState()) ? 4 : 0;
	dumpAttr(root, "ff", ff);
	dumpAttr(root, "mf", app.maxFrequency);

	for (int i = 0; i != app.elmList.size(); i++) {
	    CircuitElm ce = app.getElm(i);
	    Element elem = doc.createElement(ce.getXmlDumpType());
	    ce.dumpXml(doc, elem);
	    ce.dumpXmlState(doc, elem);
	    root.appendChild(elem);
	}

	if (app.customizer != null) {
	    Element elem = doc.createElement(app.customizer.getClassName());
	    app.customizer.dumpXml(elem);
	    root.appendChild(elem);
	}

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
                .replace("<", "&lt;");
	elem.setAttribute(name, value);
    }

    static void dumpAttr(Element elem, String name, int value) { checkAttr(elem, name); elem.setAttribute(name, String.valueOf(value)); }
    static void dumpAttr(Element elem, String name, boolean value) { checkAttr(elem, name); elem.setAttribute(name, String.valueOf(value)); }
    static void dumpAttr(Element elem, String name, double value) { checkAttr(elem, name); elem.setAttribute(name, String.valueOf(value)); }
}
