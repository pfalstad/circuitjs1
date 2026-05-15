package com.lushprojects.circuitjs1.client;

import com.google.gwt.storage.client.Storage;
import com.google.gwt.xml.client.Document;
import com.google.gwt.xml.client.Element;

import java.util.Vector;

class ScopeSerializer {
    Scope scope;

    static final int FLAG_YELM             = 32;
    static final int FLAG_IVALUE           = 2048;
    static final int FLAG_PLOTS            = 4096;
    static final int FLAG_MAN_SCALE        = 16;
    static final int FLAG_PERPLOTFLAGS     = 1 << 18;
    static final int FLAG_PERPLOT_MAN_SCALE = 1 << 19;
    static final int FLAG_DIVISIONS        = 1 << 21;
    static final int FLAG_TRIGGER          = 1 << 24;

    ScopeSerializer(Scope scope) {
	this.scope = scope;
    }

    int getFlags() {
	int flags = (scope.showI ? 1 : 0) | (scope.showV ? 2 : 0) |
		(scope.showMax ? 0 : 4) |   // showMax used to be always on
		(scope.showFreq ? 8 : 0) |
		// In this version we always dump manual settings using the PERPLOT format
		(scope.isManualScale() ? (FLAG_MAN_SCALE | FLAG_PERPLOT_MAN_SCALE) : 0) |
		(scope.plot2d.enabled ? 64 : 0) |
		(scope.plot2d.plotXY ? 128 : 0) | (scope.showMin ? 256 : 0) | (scope.showScale ? 512 : 0) |
		(scope.fftPlot.enabled ? 1024 : 0) | (scope.maxScale ? 8192 : 0) | (scope.showRMS ? 16384 : 0) |
		(scope.showDutyCycle ? 32768 : 0) | (scope.fftPlot.logSpectrum ? 65536 : 0) |
		(scope.showAverage ? (1 << 17) : 0) | (scope.showElmInfo ? (1 << 20) : 0) |
		(scope.showP2P ? (1 << 22) : 0) | (scope.fftPlot.showPhaseAngle ? (1 << 23) : 0);
	flags |= FLAG_PLOTS; // 4096
	int allPlotFlags = 0;
	for (ScopePlot p : scope.plots)
	    allPlotFlags |= p.getPlotFlags();
	flags |= (allPlotFlags != 0) ? FLAG_PERPLOTFLAGS : 0;
	if (scope.isManualScale())
	    flags |= FLAG_DIVISIONS;
	if (scope.trigger.isActive())
	    flags |= FLAG_TRIGGER;
	return flags;
    }

    void setFlags(int flags) {
	scope.showI = (flags & 1) != 0;
	scope.showV = (flags & 2) != 0;
	scope.showMax = (flags & 4) == 0;
	scope.showFreq = (flags & 8) != 0;
	scope.manualScale = (flags & FLAG_MAN_SCALE) != 0;
	scope.plot2d.enabled = (flags & 64) != 0;
	scope.plot2d.plotXY = (flags & 128) != 0;
	scope.showMin = (flags & 256) != 0;
	scope.showScale = (flags & 512) != 0;
	scope.fftPlot.show((flags & 1024) != 0);
	scope.maxScale = (flags & 8192) != 0;
	scope.showRMS = (flags & 16384) != 0;
	scope.showDutyCycle = (flags & 32768) != 0;
	scope.fftPlot.logSpectrum = (flags & 65536) != 0;
	scope.showAverage = (flags & (1 << 17)) != 0;
	scope.showElmInfo = (flags & (1 << 20)) != 0;
	scope.showP2P = (flags & (1 << 22)) != 0;
	scope.fftPlot.showPhaseAngle = (flags & (1 << 23)) != 0;
    }

    void dumpXml(Document doc, Element root) {
	ScopePlot vPlot = scope.plots.get(0);
	CircuitElm elm = vPlot.elm;
	if (elm == null)
	    return;
	// sync scale[] from scaleX/scaleY for 2d plots so they get saved correctly
	if (scope.plot2d.enabled && scope.plots.size() >= 2) {
	    scope.scale[scope.plots.get(0).units] = scope.plot2d.scaleX;
	    scope.scale[scope.plots.get(1).units] = scope.plot2d.scaleY;
	}
	int flags = getFlags();
	int eno = scope.app.locateElm(elm);
	if (eno < 0)
	    return;
	Element xmlElm = doc.createElement("o");
	XMLSerializer.dumpAttr(xmlElm, "en", eno);
	XMLSerializer.dumpAttr(xmlElm, "sp", vPlot.scopePlotSpeed);
	// strip flags that belong to old text format or are superseded by explicit XML attributes
	int f = flags & ~(FLAG_PERPLOTFLAGS | FLAG_PERPLOT_MAN_SCALE | FLAG_PLOTS | FLAG_TRIGGER);
	XMLSerializer.dumpAttr(xmlElm, "f", exportAsDecOrHex(f, 0));
	XMLSerializer.dumpAttr(xmlElm, "p", scope.position);
	if (scope.manDivisions != 8)
	    XMLSerializer.dumpAttr(xmlElm, "md", scope.manDivisions);
	scope.trigger.dumpXml(xmlElm);
	root.appendChild(xmlElm);
	for (int i = 0; i < scope.plots.size(); i++) {
	    ScopePlot p = scope.plots.get(i);
	    Element pelm = doc.createElement("p");
	    if (p.getPlotFlags() > 0)
		XMLSerializer.dumpAttr(pelm, "f", Integer.toHexString(p.getPlotFlags()));
	    if (p.elm != elm)
		XMLSerializer.dumpAttr(pelm, "e", scope.app.locateElm(p.elm));
	    XMLSerializer.dumpAttr(pelm, "v", p.value);
	    XMLSerializer.dumpAttr(pelm, "sc", scope.scale[p.units]);
	    if (scope.isManualScale()) {
		XMLSerializer.dumpAttr(pelm, "ms", p.manScale);
		XMLSerializer.dumpAttr(pelm, "mp", p.manVPosition);
	    }
	    xmlElm.appendChild(pelm);
	}
	if (scope.text != null)
	    xmlElm.setAttribute("x", scope.text);
    }

    void undumpXml(XMLDeserializer xml) {
	int e = xml.parseIntAttr("en", -1);
	if (e == -1)
	    return;
	CircuitElm ce = scope.app.getElm(e);
	scope.setElm(ce);
	scope.plots = new Vector<ScopePlot>();
	scope.speed = xml.parseIntAttr("sp", 64);
	String fs = xml.parseStringAttr("f", "0");
	int flags = importDecOrHex(fs);
	scope.position = xml.parseIntAttr("p", 0);
	scope.manDivisions = xml.parseIntAttr("md", 8);
	scope.text = xml.parseStringAttr("x", (String) null);
	setFlags(flags);
	// override any stale trigger bits from old files with explicit XML attrs;
	// must be called before parseChildElement() changes XML context
	scope.trigger.undumpXml(xml);
	for (Element elem : xml.getChildElements()) {
	    xml.parseChildElement(elem);
	    int plotFlags = Integer.parseInt(xml.parseStringAttr("f", "0"), 16);
	    CircuitElm plotElm = scope.app.getElm(xml.parseIntAttr("e", e));
	    int val = xml.parseIntAttr("v", -1);
	    int u = plotElm.getScopeUnits(val);
	    double sc = xml.parseDoubleAttr("sc", -1);
	    if (sc >= 0)
		scope.scale[u] = sc;
	    ScopePlot p = new ScopePlot(plotElm, u, val, scope.getManScaleFromMaxScale(u, false));
	    scope.plots.add(p);
	    p.acCoupled = (plotFlags & ScopePlot.FLAG_AC) != 0;
	    double ms = xml.parseDoubleAttr("ms", -1);
	    if (ms >= 0) {
		p.manScaleSet = true;
		p.manScale = ms;
		p.manVPosition = xml.parseIntAttr("mp", 0);
	    }
	}
	// restore scaleX/scaleY for 2d plots
	if (scope.plot2d.enabled && scope.plots.size() >= 2) {
	    scope.plot2d.scaleX = scope.scale[scope.plots.get(0).units];
	    scope.plot2d.scaleY = scope.scale[scope.plots.get(1).units];
	}
    }

    void undump(StringTokenizer st) {
	scope.initialize();
	int e = new Integer(st.nextToken()).intValue();
	if (e == -1)
	    return;
	CircuitElm ce = scope.app.getElm(e);
	scope.setElm(ce);
	scope.speed = new Integer(st.nextToken()).intValue();
	int value = new Integer(st.nextToken()).intValue();
	// fix old value for VAL_POWER which doesn't work for transistors
	if (!(ce instanceof TransistorElm) && value == Scope.VAL_POWER_OLD)
	    value = Scope.VAL_POWER;
	int flags = importDecOrHex(st.nextToken());
	scope.scale[Scope.UNITS_V] = new Double(st.nextToken()).doubleValue();
	scope.scale[Scope.UNITS_A] = new Double(st.nextToken()).doubleValue();
	if (scope.scale[Scope.UNITS_V] == 0)
	    scope.scale[Scope.UNITS_V] = .5;
	if (scope.scale[Scope.UNITS_A] == 0)
	    scope.scale[Scope.UNITS_A] = 1;
	scope.plot2d.scaleX = scope.scale[Scope.UNITS_V];
	scope.plot2d.scaleY = scope.scale[Scope.UNITS_A];
	scope.scale[Scope.UNITS_OHMS] = scope.scale[Scope.UNITS_W] = scope.scale[Scope.UNITS_C] = scope.scale[Scope.UNITS_V];
	scope.text = null;
	boolean plot2dFlag = (flags & 64) != 0;
	boolean hasPlotFlags = (flags & FLAG_PERPLOTFLAGS) != 0;
	if ((flags & FLAG_PLOTS) != 0) {
	    // new-style dump
	    try {
		scope.position = Integer.parseInt(st.nextToken());
		int sz = Integer.parseInt(st.nextToken());
		scope.manDivisions = 8;
		if ((flags & FLAG_DIVISIONS) != 0)
		    scope.manDivisions = Scope.lastManDivisions = Integer.parseInt(st.nextToken());
		int u = ce.getScopeUnits(value);
		if (u > Scope.UNITS_A)
		    scope.scale[u] = Double.parseDouble(st.nextToken());
		scope.setValue(value);
		// setValue(0) creates an extra plot for current, so remove that
		while (scope.plots.size() > 1)
		    scope.plots.removeElementAt(1);
		int plotFlags = 0;
		for (int i = 0; i != sz; i++) {
		    if (hasPlotFlags)
			plotFlags = Integer.parseInt(st.nextToken(), 16);
		    if (i != 0) {
			int ne = Integer.parseInt(st.nextToken());
			int val = Integer.parseInt(st.nextToken());
			CircuitElm elm = scope.app.getElm(ne);
			u = elm.getScopeUnits(val);
			if (u > Scope.UNITS_A)
			    scope.scale[u] = Double.parseDouble(st.nextToken());
			scope.plots.add(new ScopePlot(elm, u, val, scope.getManScaleFromMaxScale(u, false)));
		    }
		    ScopePlot p = scope.plots.get(i);
		    p.acCoupled = (plotFlags & ScopePlot.FLAG_AC) != 0;
		    if ((flags & FLAG_PERPLOT_MAN_SCALE) != 0) {
			p.manScaleSet = true;
			p.manScale = Double.parseDouble(st.nextToken());
			p.manVPosition = Integer.parseInt(st.nextToken());
		    }
		}
		while (st.hasMoreTokens()) {
		    if (scope.text == null)
			scope.text = st.nextToken();
		    else
			scope.text += " " + st.nextToken();
		}
	    } catch (Exception ee) {
	    }
	} else {
	    // old-style dump
	    CircuitElm yElm = null;
	    int ivalue = 0;
	    scope.manDivisions = 8;
	    try {
		scope.position = new Integer(st.nextToken()).intValue();
		int ye = -1;
		if ((flags & FLAG_YELM) != 0) {
		    ye = new Integer(st.nextToken()).intValue();
		    if (ye != -1)
			yElm = scope.app.getElm(ye);
		    // sinediode.txt has yElm set to something even though there's no xy plot
		    if (!plot2dFlag)
			yElm = null;
		}
		if ((flags & FLAG_IVALUE) != 0)
		    ivalue = new Integer(st.nextToken()).intValue();
		while (st.hasMoreTokens()) {
		    if (scope.text == null)
			scope.text = st.nextToken();
		    else
			scope.text += " " + st.nextToken();
		}
	    } catch (Exception ee) {
	    }
	    scope.setValues(value, ivalue, scope.app.getElm(e), yElm);
	}
	if (scope.text != null)
	    scope.text = CustomLogicModel.unescape(scope.text);
	scope.plot2d.enabled = plot2dFlag;
	setFlags(flags);
    }

    void saveAsDefault() {
	Storage stor = Storage.getLocalStorageIfSupported();
	if (stor == null)
	    return;
	ScopePlot vPlot = scope.plots.get(0);
	int flags = getFlags();
	String s = "1 " + flags + " " + vPlot.scopePlotSpeed;
	if ((flags & FLAG_TRIGGER) != 0)
	    s += " " + scope.trigger.level;
	stor.setItem("scopeDefaults", s);
	CirSim.console("saved defaults " + flags);
    }

    boolean loadDefaults() {
	Storage stor = Storage.getLocalStorageIfSupported();
	if (stor == null)
	    return false;
	String str = stor.getItem("scopeDefaults");
	if (str == null)
	    return false;
	String arr[] = str.split(" ");
	int flags = Integer.parseInt(arr[1]);
	setFlags(flags);
	scope.speed = Integer.parseInt(arr[2]);
	if (arr.length > 3 && (flags & FLAG_TRIGGER) != 0)
	    scope.trigger.level = Double.parseDouble(arr[3]);
	return true;
    }

    private static String exportAsDecOrHex(int v, int thresh) {
	if (v >= thresh)
	    return "x" + Integer.toHexString(v);
	else
	    return Integer.toString(v);
    }

    private static int importDecOrHex(String s) {
	if (s.charAt(0) == 'x')
	    return Integer.parseInt(s.substring(1), 16);
	else
	    return Integer.parseInt(s);
    }
}
