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

/*

model:

  <ccm nm="nortonamp" f="0" sx="2" sy="2" bcs="1">
    <ext nm="in+" nd="3" ps="1" sd="2"/>
    <ext nm="in-" nd="1" ps="0" sd="2"/>
    <ext nm="out" nd="4" ps="0" sd="3"/>
    <d nn="1 0" f="2" mo="default"/>
    <d nn="2 0" f="2" mo="default"/>
    <CCCS nn="3 2 1 0" f="0" ic="2" ex="-a"/>
    <a nn="1 0 4" f="8" ma="12" mi="0" ga="100000"/>
  </ccm>

*/

package com.lushprojects.circuitjs1.client;

import java.util.Vector;
import com.google.gwt.xml.client.Document;
import com.google.gwt.xml.client.Element;
import com.google.gwt.xml.client.Node;
import com.google.gwt.xml.client.NodeList;
import com.google.gwt.xml.client.XMLParser;

class NortonAmpElm extends CompositeElm {
    int opsize, opheight, opwidth;
    final int FLAG_SWAP = 1;
    final int FLAG_SMALL = 2;

    // External nodes in model order: in+ (nd=3), in- (nd=1), out (nd=4)
    static final int[] modelExternalNodes = { 3, 1, 4 };

    // Child elements with node assignments ("nn" attribute)
    static final String modelXmlStr =
	"<elms>" +
	"<d nn=\"1 0\" f=\"2\" mo=\"default\"/>" +
	"<d nn=\"2 0\" f=\"2\" mo=\"default\"/>" +
	"<CCCS nn=\"3 2 1 0\" f=\"0\" ic=\"2\" ex=\"-a\"/>" +
	"<a nn=\"1 0 4\" f=\"8\" ma=\"12\" mi=\"0\" ga=\"100000\"/>" +
	"</elms>";

    static Document modelDoc;
    static Vector<Element> modelElements;

    static void initModel() {
	modelDoc = XMLParser.parse(modelXmlStr);
	modelElements = new Vector<Element>();
	NodeList children = modelDoc.getDocumentElement().getChildNodes();
	for (int i = 0; i < children.getLength(); i++) {
	    Node node = children.item(i);
	    if (node.getNodeType() == Node.ELEMENT_NODE)
		modelElements.add((Element) node);
	}
    }

    public NortonAmpElm(int xx, int yy) {
	super(xx, yy);
	if (modelElements == null)
	    initModel();
	loadCompositeXml(modelElements, modelExternalNodes);
	buildCompNodeList();
	allocNodes();
	noDiagonal = true;
	setSize(useSmallGrid() ? 1 : 2);
    }

    String getXmlDumpType() { return "nor"; }

    void dumpXml(Document doc, Element elem) {
	super.dumpXml(doc, elem);
    }

    void undumpXml(XMLDeserializer xml) {
	super.undumpXml(xml);
	setSize((flags & FLAG_SMALL) != 0 ? 1 : 2);
    }

    void draw(Graphics g) {
	setBbox(point1, point2, opheight*2);
	setVoltageColor(g, volts[0]);   // post 0 = in+
	drawThickLine(g, in1p[0], in1p[1]);
	setVoltageColor(g, volts[1]);   // post 1 = in-
	drawThickLine(g, in2p[0], in2p[1]);
	setVoltageColor(g, volts[2]);   // post 2 = out
	drawThickLine(g, lead2, point2);
	g.setColor(needsHighlight() ? selectColor : lightGrayColor);
	setPowerColor(g, true);
	drawThickPolygon(g, triangle);
	g.setFont(plusFont);
	drawCenteredText(g, "+", textp[0].x, textp[0].y-2, true);
	drawCenteredText(g, "-", textp[1].x, textp[1].y  , true);
	drawThickCircle(g, nortonCenter.x, nortonCenter.y, nortonRadius);
	g.setColor(needsHighlight() ? selectColor : lightGrayColor);
	g.fillPolygon(nortonTriangle);
	curcount0 = updateDotCount(-getCurrentIntoNode(0), curcount0);
	drawDots(g, in1p[0], in1p[1], curcount0);
	curcount1 = updateDotCount(-getCurrentIntoNode(1), curcount1);
	drawDots(g, in2p[0], in2p[1], curcount1);
	curcount = updateDotCount(-getCurrentIntoNode(2), curcount);
	drawDots(g, point2, lead2, curcount);
	drawPosts(g);
    }

    Point in1p[], in2p[], textp[];
    Polygon triangle;
    Point nortonCenter;
    int nortonRadius;
    Polygon nortonTriangle;
    Font plusFont;
    double curcount0, curcount1;

    void setSize(int s) {
	opsize = s;
	opheight = 8*s;
	opwidth = 13*s;
	flags = (flags & ~FLAG_SMALL) | ((s == 1) ? FLAG_SMALL : 0);
    }

    void setPoints() {
	super.setPoints();
	if (dn > 150 && isCreating())
	    setSize(2);
	int ww = opwidth;
	if (ww > dn/2)
	    ww = (int) (dn/2);
	calcLeads(ww*2);
	int hs = opheight*dsign;
	if ((flags & FLAG_SWAP) != 0)
	    hs = -hs;
	in1p = newPointArray(2);
	in2p = newPointArray(2);
	textp = newPointArray(2);
	interpPoint2(point1, point2, in1p[0], in2p[0], 0, hs);
	interpPoint2(lead1,  lead2,  in1p[1], in2p[1], 0, hs);
	interpPoint2(lead1,  lead2,  textp[0], textp[1], .2, hs);
	Point tris[] = newPointArray(2);
	interpPoint2(lead1, lead2, tris[0], tris[1], 0, hs*2);
	triangle = createPolygon(tris[0], tris[1], lead2);
	plusFont = new Font("SansSerif", 0, opsize == 2 ? 14 : 10);

	nortonCenter = new Point(lead1.x, lead1.y);
	nortonRadius = (int) (opheight * .5);

	Point innerTip = new Point();
	Point innerBase[] = newPointArray(2);
	interpPoint(in1p[1], in2p[1], innerTip, 1.2/3);
	interpPoint2(in1p[1], in2p[1], innerBase[0], innerBase[1], 1.8/3, opheight * 0.3);
	nortonTriangle = createPolygon(innerTip, innerBase[0], innerBase[1]);

	setPost(0, in1p[0]);  // in+
	setPost(1, in2p[0]);  // in-
	setPost(2, point2);   // out
    }

    public void reset() {
	super.reset();
	curcount0 = curcount1 = 0;
    }

    void getInfo(String arr[]) {
	arr[0] = "norton amp";
	arr[1] = "V+ = " + getVoltageText(volts[0]);
	arr[2] = "V- = " + getVoltageText(volts[1]);
	arr[3] = "Vout = " + getVoltageText(volts[2]);
	arr[4] = "Iout = " + getCurrentText(-getCurrentIntoNode(2));
    }

    void flipX(int c2, int count) {
	if (dx == 0)
	    flags ^= FLAG_SWAP;
	super.flipX(c2, count);
    }

    void flipY(int c2, int count) {
	if (dy == 0)
	    flags ^= FLAG_SWAP;
	super.flipY(c2, count);
    }

    void flipXY(int xmy, int count) {
	flags ^= FLAG_SWAP;
	super.flipXY(xmy, count);
    }

    void addRoutingObstacle(WireRouter router) { addRoutingObstacleWithLeads(router, opwidth); }
}
