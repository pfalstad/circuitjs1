package com.lushprojects.circuitjs1.client;

import com.google.gwt.core.client.JavaScriptObject;
import com.google.gwt.core.client.JsArray;

public class JSInterface {

    CirSim sim;

    JSInterface(CirSim sim) {
	this.sim = sim;
    }

    void setExtVoltage(String name, double v) {
	int i;
	for (i = 0; i != sim.elmList.size(); i++) {
	    CircuitElm ce = sim.getElm(i);
	    if (ce instanceof ExtVoltageElm) {
		ExtVoltageElm eve = (ExtVoltageElm) ce;
		if (eve.getName().equals(name))
		    eve.setVoltage(v);
	    }
	}
    }

    native JsArray<JavaScriptObject> getJSArray() /*-{ return []; }-*/;

    JsArray<JavaScriptObject> getJSElements() {
	int i;
	JsArray<JavaScriptObject> arr = getJSArray();
	for (i = 0; i != sim.elmList.size(); i++) {
	    CircuitElm ce = sim.getElm(i);
	    ce.addJSMethods();
	    arr.push(ce.getJavaScriptObject());
	}
	return arr;
    }

    double getLabeledNodeVoltage(String name) { return sim.sim.getLabeledNodeVoltage(name); }

    // Delegate methods for JSNI access
    void setSimRunning(boolean run) { sim.setSimRunning(run); }
    boolean simIsRunning() { return sim.simIsRunning(); }
    void doExportAsSVGFromAPI() { sim.doExportAsSVGFromAPI(); }
    String dumpCircuit() { return sim.dumpCircuit(); }
    void importCircuitFromText(String t, boolean s) { sim.importCircuitFromText(t, s); }
    double getTime() { return sim.sim.t; }
    double getTimeStep() { return sim.sim.timeStep; }
    void setTimeStep(double ts) { sim.sim.timeStep = ts; }
    double getMaxTimeStep() { return sim.sim.maxTimeStep; }
    void setMaxTimeStep(double ts) { sim.sim.maxTimeStep = sim.sim.timeStep = ts; }

    native void setupJSInterface() /*-{
	var that = this;
	$wnd.CircuitJS1 = {
	    setSimRunning: $entry(function(run) { that.@com.lushprojects.circuitjs1.client.JSInterface::setSimRunning(Z)(run); } ),
	    getTime: $entry(function() { return that.@com.lushprojects.circuitjs1.client.JSInterface::getTime()(); } ),
	    getTimeStep: $entry(function() { return that.@com.lushprojects.circuitjs1.client.JSInterface::getTimeStep()(); } ),
	    setTimeStep: $entry(function(ts) { that.@com.lushprojects.circuitjs1.client.JSInterface::setTimeStep(D)(ts); } ), // don't use this, see #843
	    getMaxTimeStep: $entry(function() { return that.@com.lushprojects.circuitjs1.client.JSInterface::getMaxTimeStep()(); } ),
	    setMaxTimeStep: $entry(function(ts) { that.@com.lushprojects.circuitjs1.client.JSInterface::setMaxTimeStep(D)(ts); } ),
	    isRunning: $entry(function() { return that.@com.lushprojects.circuitjs1.client.JSInterface::simIsRunning()(); } ),
	    getNodeVoltage: $entry(function(n) { return that.@com.lushprojects.circuitjs1.client.JSInterface::getLabeledNodeVoltage(Ljava/lang/String;)(n); } ),
	    setExtVoltage: $entry(function(n, v) { that.@com.lushprojects.circuitjs1.client.JSInterface::setExtVoltage(Ljava/lang/String;D)(n, v); } ),
	    getElements: $entry(function() { return that.@com.lushprojects.circuitjs1.client.JSInterface::getJSElements()(); } ),
	    getCircuitAsSVG: $entry(function() { return that.@com.lushprojects.circuitjs1.client.JSInterface::doExportAsSVGFromAPI()(); } ),
	    exportCircuit: $entry(function() { return that.@com.lushprojects.circuitjs1.client.JSInterface::dumpCircuit()(); } ),
	    importCircuit: $entry(function(circuit, subcircuitsOnly) { return that.@com.lushprojects.circuitjs1.client.JSInterface::importCircuitFromText(Ljava/lang/String;Z)(circuit, subcircuitsOnly); })
	};
	var hook = $wnd.oncircuitjsloaded;
	if (hook)
	    hook($wnd.CircuitJS1);
    }-*/;

    native void callUpdateHook() /*-{
	var hook = $wnd.CircuitJS1.onupdate;
	if (hook)
	    hook($wnd.CircuitJS1);
    }-*/;

    native void callAnalyzeHook() /*-{
	var hook = $wnd.CircuitJS1.onanalyze;
	if (hook)
	    hook($wnd.CircuitJS1);
    }-*/;

    native void callTimeStepHook() /*-{
	var hook = $wnd.CircuitJS1.ontimestep;
	if (hook)
	    hook($wnd.CircuitJS1);
    }-*/;

    native void callSVGRenderedHook(String svgData) /*-{
	var hook = $wnd.CircuitJS1.onsvgrendered;
	if (hook)
	    hook($wnd.CircuitJS1, svgData);
    }-*/;
}
