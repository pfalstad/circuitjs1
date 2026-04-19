package com.lushprojects.circuitjs1.client;

import java.util.Date;
import java.util.Vector;

import com.google.gwt.event.dom.client.ClickEvent;
import com.google.gwt.event.dom.client.ClickHandler;
import com.google.gwt.http.client.Request;
import com.google.gwt.http.client.RequestBuilder;
import com.google.gwt.http.client.RequestCallback;
import com.google.gwt.http.client.RequestException;
import com.google.gwt.http.client.Response;
import com.google.gwt.i18n.client.DateTimeFormat;
import com.google.gwt.user.client.Window;
import com.google.gwt.user.client.ui.Anchor;
import com.google.gwt.user.client.ui.Button;
import com.google.gwt.user.client.ui.VerticalPanel;

class TestManager {

    static class ScopeDataRef {
	int si, pi, en, value, units, speed;
	double ts;
	double[] values;
    }

    CirSim app;
    boolean testRunning;
    double testLen = -1;
    Vector<ScopeDataRef> refData = new Vector<ScopeDataRef>();
    static final boolean enabled = true;
    static TestManager theManager;
    static boolean loadingTestCircuit;

    static final double TOLERANCE = 1e-3;

    TestManager(CirSim app) {
	this.app = app;
	theManager = this;
    }

    static void init(CirSim app) {
	if (theManager == null)
	    return;
	QueryParameters qp = new QueryParameters();
	String testFile = qp.getValue("test");
	if (testFile == null)
	    return;
	theManager.loadTestCircuit(testFile);
	loadingTestCircuit = true;
    }

    void loadTestCircuit(String filename) {
	String url = "http://127.0.0.1:5001/auto-tests/" + filename;
	RequestBuilder rb = new RequestBuilder(RequestBuilder.GET, url);
	try {
	    rb.sendRequest(null, new RequestCallback() {
		public void onResponseReceived(Request req, Response resp) {
		    if (resp.getStatusCode() == Response.SC_OK) {
			app.loader.readCircuit(resp.getText());
			startTest();
		    } else {
			Window.alert("Could not load test circuit: " + resp.getStatusText());
		    }
		}
		public void onError(Request req, Throwable ex) {
		    Window.alert("Error loading test circuit: " + ex.getMessage());
		}
	    });
	} catch (RequestException e) {
	    Window.alert("Error loading test circuit: " + e.getMessage());
	}
    }

    void startTest() {
	app.ui.resetAction();
	testRunning = true;
    }

    // called from XMLDeserializer when it sees a <test> tag
    void saveTestTag(double len) {
	testLen = len;
	refData.clear();
    }

    // called from XMLDeserializer when it sees a <scopedata> tag
    void saveScopeDataTag(int si, int pi, int en, int v, int u, int sp, double ts, double[] values) {
	ScopeDataRef ref = new ScopeDataRef();
	ref.si = si;
	ref.pi = pi;
	ref.en = en;
	ref.value = v;
	ref.units = u;
	ref.speed = sp;
	ref.ts = ts;
	ref.values = values;
	refData.add(ref);
    }

    // called each frame from UIManager.updateCircuit() after runCircuit()
    void checkTime() {
	if (!testRunning || testLen < 0)
	    return;
	if (app.sim.t >= testLen) {
	    testRunning = false;
	    app.setSimRunning(false);
	    compareAndReport();
	}
    }

    void compareAndReport() {
	StringBuilder failures = new StringBuilder();
	for (ScopeDataRef ref : refData) {
	    if (ref.si >= app.scopeManager.scopeCount)
		continue;
	    Scope scope = app.scopeManager.scopes[ref.si];
	    if (ref.pi >= scope.plots.size())
		continue;
	    ScopePlot plot = scope.plots.get(ref.pi);
	    if (plot.elm == null || plot.maxValues == null)
		continue;

	    int spc = plot.scopePointCount;
	    double ts = app.sim.maxTimeStep * plot.scopePlotSpeed;
	    double tStart = app.sim.t - ts * spc;

	    int refIdx = 0;
	    int mismatch = 0;
	    double maxDiff = 0;
	    for (int i = 0; i < spc && refIdx < ref.values.length; i++) {
		double t = tStart + ts * i;
		if (t < 0)
		    continue;
		int ip = (i + plot.ptr) & (spc - 1);
		double actual = plot.maxValues[ip];
		double expected = ref.values[refIdx++];
		double diff = Math.abs(actual - expected);
		double tol = Math.max(TOLERANCE * Math.abs(expected), 1e-9);
		if (diff > tol) {
		    mismatch++;
		    CirSim.console("mismatch scope " + ref.si + " plot " + ref.pi + " got " + actual + " should be " + expected);
		    if (diff > maxDiff)
			maxDiff = diff;
		}
	    }
	    if (mismatch > 0)
		failures.append("scope ").append(ref.si).append(" plot ").append(ref.pi)
			.append(": ").append(mismatch).append(" mismatches, max diff=").append(maxDiff).append("\n");
	}
	if (failures.length() == 0)
	    Window.alert("Test PASSED");
	else
	    Window.alert("Test FAILED:\n" + failures.toString());
    }

    void createUI(VerticalPanel vp) {
	Button startButton = new Button("Start Test");
	Button stopButton = new Button("Stop Test");
	Button cancelButton = new Button("Cancel Test");

	startButton.addClickHandler(new ClickHandler() {
	    public void onClick(ClickEvent event) {
		app.ui.resetAction();
		testRunning = true;
	    }
	});

	stopButton.addClickHandler(new ClickHandler() {
	    public void onClick(ClickEvent event) {
		testRunning = false;
		downloadWithTest();
	    }
	});

	cancelButton.addClickHandler(new ClickHandler() {
	    public void onClick(ClickEvent event) {
		testRunning = false;
	    }
	});

	vp.add(startButton);
	vp.add(stopButton);
	vp.add(cancelButton);
    }

    void downloadWithTest() {
	double len = app.sim.t;
	String dump = app.dumpCircuit();
	String insert = "  <test len=\"" + len + "\"/>\n" + dumpScopeData();
	int idx = dump.lastIndexOf("</cir>");
	if (idx >= 0)
	    dump = dump.substring(0, idx) + insert + dump.substring(idx);
	else
	    dump += insert;

	String url = ExportAsLocalFileDialog.getBlobUrl(dump);
	String fname = ExportAsLocalFileDialog.lastFileName;
	if (fname == null) {
	    DateTimeFormat dtf = DateTimeFormat.getFormat("yyyyMMdd-HHmmss");
	    fname = "circuitjs-" + dtf.format(new Date()) + ".txt";
	}
	Anchor a = new Anchor(fname, url);
	a.getElement().setAttribute("Download", fname);
	ExportAsLocalFileDialog.click(a.getElement());
    }

    String dumpScopeData() {
	StringBuilder sb = new StringBuilder();
	ScopeManager sm = app.scopeManager;
	for (int si = 0; si < sm.scopeCount; si++) {
	    Scope scope = sm.scopes[si];
	    for (int pi = 0; pi < scope.plots.size(); pi++) {
		ScopePlot plot = scope.plots.get(pi);
		if (plot.elm == null || plot.minValues == null)
		    continue;
		int en = app.locateElm(plot.elm);
		if (en < 0)
		    continue;
		int spc = plot.scopePointCount;
		double ts = app.sim.maxTimeStep * plot.scopePlotSpeed;
		double tStart = app.sim.t - ts * spc;
		sb.append("  <scopedata si=\"").append(si)
		  .append("\" pi=\"").append(pi)
		  .append("\" en=\"").append(en)
		  .append("\" v=\"").append(plot.value)
		  .append("\" u=\"").append(plot.units)
		  .append("\" sp=\"").append(plot.scopePlotSpeed)
		  .append("\" ts=\"").append(ts)
		  .append("\">");
		boolean first = true;
		for (int i = 0; i < spc; i++) {
		    double t = tStart + ts * i;
		    if (t < 0)
			continue;
		    int ip = (i + plot.ptr) & (spc - 1);
		    if (!first) sb.append(",");
		    first = false;
		    sb.append(plot.maxValues[ip]);
		}
		sb.append("</scopedata>\n");
	    }
	}
	return sb.toString();
    }
}
