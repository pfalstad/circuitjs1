package com.lushprojects.circuitjs1.client;

import java.util.Vector;
import java.util.HashMap;
import java.util.Map.Entry;

import com.google.gwt.xml.client.Element;
import com.google.gwt.xml.client.Document;
import com.google.gwt.xml.client.NamedNodeMap;

// Circuit element made up of a composition of other circuit elements
// Using this will be (relatively) inefficient in terms of simulation performance because
// all the internal workings of the element are simulated from the individual components.
// However, it may allow some types of components to be more quickly programed in to the simulator
// than writing each component from scratch.
//
// It also provides a path to allow user created circuits to be 
// re-imported in to the simuation as new circuit elements.

// Instatiations should:
// - Set the variable "diagonal" in the constructors
// - Override constructors to set up the elements posts/leads etc. and configure the contents of the CompositeElm
// - Override getDumpType, dump, draw, getInfo, setPoints, canViewInScope

public abstract class CompositeElm extends CircuitElm {

    // need to use escape() instead of converting spaces to _'s so composite elements can be nested
    final int FLAG_ESCAPE = 1;

    // list of elements contained in this subcircuit
    Vector<CircuitElm> compElmList;

    // list of nodes, mapping each one to a list of elements that reference that node
    protected Vector<CircuitNode> compNodeList;

    protected int numPosts = 0;
    protected int numNodes = 0;
    protected Point posts[];

    // node info strings for each element (space-separated node numbers), stored for deferred node list building
    String[] compNodeInfo;

    // external node IDs, stored for deferred node list building
    int[] extNodeIds;

    CompositeElm(int xx, int yy) {
	super(xx, yy);
    }

    public CompositeElm(int xa, int ya, int xb, int yb, int f) {
	super(xa, ya, xb, yb, f);
    }

    CompositeElm(int xx, int yy, String s, int externalNodes[]) {
	super(xx, yy);
	loadComposite(null, s, externalNodes);
	buildCompNodeList();
	allocNodes();
    }

    public CompositeElm(int xa, int ya, int xb, int yb, int f, StringTokenizer st, String s, int externalNodes[]) {
	super(xa, ya, xb, yb, f);
	loadComposite(st, s, externalNodes);
	buildCompNodeList();
	allocNodes();
    }

    Vector<CircuitElm> getChildElmList() { return compElmList; }

    boolean useEscape() { return (flags & FLAG_ESCAPE) != 0; }

    public void loadComposite(StringTokenizer stIn, String model, int externalNodes[]) {
	StringTokenizer modelLinet = new StringTokenizer(model, "\r");

	compElmList = new Vector<CircuitElm>();
	Vector<String> nodeInfoList = new Vector<String>();

	// Build compElmList from input string, storing node info for later

	while (modelLinet.hasMoreTokens()) {
	    String line = modelLinet.nextToken();
	    int sp = line.indexOf(' ');
	    String ceType = line.substring(0, sp);
	    String nodeStr = line.substring(sp + 1);
	    CircuitElm newce = CirSim.constructElement(ceType, 0, 0);
	    if (stIn!=null) {
		int tint = newce.getDumpType();
		String dumpedCe= stIn.nextToken();
		if (useEscape())
		    dumpedCe = CustomLogicModel.unescape(dumpedCe);
		StringTokenizer stCe = new StringTokenizer(dumpedCe, useEscape() ? " " : "_");
		int flags = new Integer(stCe.nextToken()).intValue();
		newce = CirSim.createCe(tint, 0, 0, 0, 0, flags, stCe);
	    }
	    if (newce == null) {
		sim.console("failed to create " + ceType + " in CompositeElm");
		continue;
	    }
	    if (newce instanceof GroundElm)
		((GroundElm) newce).setOldStyle();
	    compElmList.add(newce);
	    nodeInfoList.add(nodeStr);
	}

	compNodeInfo = nodeInfoList.toArray(new String[0]);
	extNodeIds = externalNodes;
	numPosts = numNodes = externalNodes.length;
	posts = new Point[numPosts];

	// dump new circuits with escape()
	flags |= FLAG_ESCAPE;
    }

    public void loadCompositeXml(Vector<Element> elmEntries, int externalNodes[]) {
	XMLDeserializer xml = new XMLDeserializer(CirSim.theApp);

	compElmList = new Vector<CircuitElm>();
	Vector<String> nodeInfoList = new Vector<String>();

	for (Element childElem : elmEntries) {
	    String tagName = childElem.getTagName();
	    String className = CirSim.xmlDumpTypeMap.get(tagName);
	    if (className == null)
		continue;
	    // skip non-essential elements that are only needed for display.
	    // GroundElm is only skipped if it has coordinates, meaning it came from a
	    // newer dump where it's purely visual.  Old-style dumps have no coordinates
	    // and need GroundElm for simulation.
	    if (className.equals("WireElm") || className.equals("RoutedWireElm") || className.equals("LabeledNodeElm") || className.equals("ScopeElm") ||
		    className.equals("GraphicElm") ||
		    (className.equals("GroundElm") && childElem.getAttribute("x") != null)) {
		sim.console("skipping " + className + " in loadCompositeXml");
		continue;
	    }
	    CircuitElm newce = CirSim.constructElement(className, 0, 0);
	    if (newce instanceof GroundElm)
		((GroundElm) newce).setOldStyle();
	    xml.parseChildElement(childElem);
	    newce.undumpXml(xml);
	    compElmList.add(newce);
	    String nn = childElem.getAttribute("nn");
	    nodeInfoList.add(nn != null ? nn : "");
	}

	compNodeInfo = nodeInfoList.toArray(new String[0]);
	extNodeIds = externalNodes;

	// we set numNodes here to allocNodes will work when creating.  but we will fill in the real node count later during prestamp
	numPosts = numNodes = externalNodes.length;
	posts = new Point[numPosts];
	flags |= FLAG_ESCAPE;
    }

    // build compNodeList from stored node info.  called from preStamp() so that sub-elements
    // have their final state (after undumpXml) when we query their internal node counts.
    void buildCompNodeList() {
	HashMap<Integer, CircuitNode> compNodeHash = new HashMap<Integer, CircuitNode>();
	CircuitNode cn;
	CircuitNodeLink cnLink;

	compNodeList = new Vector<CircuitNode>();

	for (int i = 0; i != compElmList.size(); i++) {
	    CircuitElm ce = compElmList.get(i);
	    StringTokenizer stNodes = new StringTokenizer(compNodeInfo[i], " +\t");
	    int thisPost = 0;
	    while (stNodes.hasMoreTokens()) {
		int nodeOfThisPost = Integer.parseInt(stNodes.nextToken());

		// node = 0 means ground
		if (nodeOfThisPost == 0) {
		    ce.setNode(thisPost, 0);
		    ce.setNodeVoltage(thisPost, 0);
		    thisPost++;
		    continue;
		}
		cnLink = new CircuitNodeLink();
		cnLink.num = thisPost;
		cnLink.elm = ce;
		if (!compNodeHash.containsKey(nodeOfThisPost)) {
		    cn = new CircuitNode();
		    cn.links.add(cnLink);
		    compNodeHash.put(nodeOfThisPost, cn);
		} else {
		    cn = compNodeHash.get(nodeOfThisPost);
		    cn.links.add(cnLink);
		}
		thisPost++;
	    }
	}

	// Flatten compNodeHash in to compNodeList
	try {
	    for (int i = 0; i < extNodeIds.length; i++) { // External Nodes First
		if (compNodeHash.containsKey(extNodeIds[i])) {
		    compNodeList.add(compNodeHash.get(extNodeIds[i]));
		    compNodeHash.remove(extNodeIds[i]);
		} else
		    throw new IllegalArgumentException();
	    }
	} catch (IllegalArgumentException e) {
	    compNodeList = null;
	    return;
	}
	for (Entry<Integer, CircuitNode> entry : compNodeHash.entrySet()) {
	    int key = entry.getKey();
	    compNodeList.add(compNodeHash.get(key));
	}

	// allocate more nodes for sub-elements' internal nodes
	for (int i = 0; i != compElmList.size(); i++) {
	    CircuitElm ce = compElmList.get(i);
	    int inodes = ce.getInternalNodeCount();
	    for (int j = 0; j != inodes; j++) {
		cnLink = new CircuitNodeLink();
		cnLink.num = j + ce.getPostCount();
		cnLink.elm = ce;
		cn = new CircuitNode();
		cn.links.add(cnLink);
		compNodeList.add(cn);
	    }
	}

	numNodes = compNodeList.size();
    }

    void preStamp() {
	for (CircuitElm ce: compElmList)
	    ce.preStamp();
	buildCompNodeList();
	allocNodes();
    }

/*
    public boolean nonLinear() {
	for (int i = 0; i < compElmList.size(); i++)
	    if (compElmList.get(i).nonLinear())
		return true;
	return false;
    }
*/

    public String dump() {
	String dumpStr=super.dump();
	dumpStr += dumpElements();
	return dumpStr;
    }

    public String dumpElements() {
	String dumpStr = "";
	for (int i = 0; i < compElmList.size(); i++) {
	    String tstring = compElmList.get(i).dump();
	    tstring = tstring.replaceFirst("[A-Za-z0-9]+ 0 0 0 0 ", ""); // remove unused tint x1 y1 x2 y2 coords for internal components
	    dumpStr += " "+ CustomLogicModel.escape(tstring);
	}
	return dumpStr;
    }

    // dump subset of elements (some of them may not have any state, and/or may be very long, so we avoid dumping them for brevity)
    public String dumpWithMask(int mask) {
	String dumpStr=super.dump();
	return dumpStr + dumpElements(mask);
    }

    public String dumpElements(int mask) {
	String dumpStr = "";
	for (int i = 0; i < compElmList.size(); i++) {
	    if ((mask & (1<<i)) == 0)
		continue;
	    String tstring = compElmList.get(i).dump();
	    tstring = tstring.replaceFirst("[A-Za-z0-9]+ 0 0 0 0 ", ""); // remove unused tint x1 y1 x2 y2 coords for internal components
	    dumpStr += " "+ CustomLogicModel.escape(tstring);
	}
	return dumpStr;
    }

    void dumpXmlState(Document doc, Element elem) {
	int i;
	for (i = 0; i != compElmList.size(); i++) {
	    CircuitElm ce = compElmList.get(i);
            Element child = doc.createElement(ce.getXmlDumpType());
            ce.dumpXmlState(doc, child);

	    // if no state dumped, skip it
	    NamedNodeMap attrs = child.getAttributes();
	    if ((attrs == null || attrs.getLength() == 0) && !child.hasChildNodes())
		continue;
	    XMLSerializer.dumpAttr(child, "ix", i);
            elem.appendChild(child);
	}
    }

    void undumpXml(XMLDeserializer xml) {
	super.undumpXml(xml);
	Element state = xml.currentXmlElement;

        for (Element elem: xml.getChildElements()) {
            xml.parseChildElement(elem);
	    int ix = xml.parseIntAttr("ix", -1);
		if (ix >= compElmList.size()) {
		    CirSim.console("ix " + ix);
		    for (CircuitElm ce: compElmList) CirSim.console("cel " + ce);
		}
	    CircuitElm ce = compElmList.get(ix);
	    if (!elem.getTagName().equals(ce.getXmlDumpType()))
		throw new RuntimeException("dump type mismatch for composite child: " + ix);
	    ce.undumpXml(xml);
	}

	// restore current XML element so superclasses can finish parsing
	xml.parseChildElement(state);
    }

    public boolean getConnection(int n1, int n2) {
	return false;
    }

    // is n1 connected to ground somehow?
    public boolean hasGroundConnection(int n1) {
	return false;
    }

    public void reset() {
	for (int i = 0; i < compElmList.size(); i++)
	    compElmList.get(i).reset();
    } 

    int getPostCount() {
	return numPosts;
    }

    int getInternalNodeCount() {
	return numNodes - numPosts;
    }

    Point getPost(int n) {
	return posts[n];
    }

    void setPost(int n, Point p) {
	posts[n] = p;
    }

    void setPost(int n, int x, int y) {
	posts[n].x = x;
	posts[n].y = y;
    }

    public double getPower() {
	double power;
	power = 0;
	for (int i = 0; i < compElmList.size(); i++)
	    power += compElmList.get(i).getPower();
	return power;
    }

    public void stamp() {
	for (int i = 0; i < compElmList.size(); i++) {
	    CircuitElm ce = compElmList.get(i);
	    ce.setParentList(compElmList);
	}
    }

    // called to set node p (local to this element) to equal n (global)
    public void setNode(int p, int n) {
	// nodes[p] = n
	Vector<CircuitNodeLink> cnLinks;
	super.setNode(p, n);
	cnLinks = compNodeList.get(p).links;

        // call setNode() for all elements that use that node
	for (int i = 0; i < cnLinks.size(); i++) {
	    cnLinks.get(i).elm.setNode(cnLinks.get(i).num, n);
	}

    }

    public boolean canViewInScope() {
	return false;
    }

    public void delete() {
	for (int i = 0; i < compElmList.size(); i++)
	    compElmList.get(i).delete();
        super.delete();
    }

    double getCurrentIntoNode(int n) {
	double c=0;
	if (compNodeList == null)
	    return 0;
	Vector<CircuitNodeLink> cnLinks;
	cnLinks = compNodeList.get(n).links;
	for (int i = 0; i < cnLinks.size(); i++) {
	    c+=cnLinks.get(i).elm.getCurrentIntoNode(cnLinks.get(i).num);
	}
	return c;
    }
}


class VoltageSourceRecord {
	int vsNumForElement;
	int vsNode;
	CircuitElm elm;
}
