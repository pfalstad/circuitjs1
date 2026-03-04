package com.lushprojects.circuitjs1.client;

import com.google.gwt.http.client.Request;
import com.google.gwt.http.client.RequestBuilder;
import com.google.gwt.http.client.RequestCallback;
import com.google.gwt.http.client.RequestException;
import com.google.gwt.http.client.Response;
import com.google.gwt.user.client.Window;
import com.lushprojects.circuitjs1.client.util.Locale;
import com.google.gwt.core.client.GWT;

/**
 * Handles all circuit loading, parsing, clearing, setup-file fetching,
 * and low-level import logic.
 *
 * CirSim should only call high-level methods on this class.
 */
public class CircuitLoader {

    private final CirSim app;     // was CirSim – the main app/UI object
    private final SimulationManager sim;      // the simulation engine
    private final ScopeManager scopes;        // to clear/add scopes
    private final Menus menus;                // to toggle check items (dots, volts, etc.)

    // Flags (copied from CirSim for clarity – you can keep them here or reference app's constants)
    static final int RC_RETAIN       = 1;
    static final int RC_NO_CENTER    = 2;
    static final int RC_SUBCIRCUITS  = 4;
    static final int RC_KEEP_TITLE   = 8;

    public CircuitLoader(CirSim app, SimulationManager sim,
                         ScopeManager scopes, Menus menus) {
        this.app   = app;
        this.sim   = sim;
        this.scopes = scopes;
        this.menus = menus;
    }

    public void clearCircuit() {
        app.mouse.clearMouseElm();
        for (CircuitElm ce : app.elmList) {
            ce.delete();
        }
        sim.resetTime();
        app.elmList.removeAllElements();
        app.hintType = -1;
        sim.maxTimeStep = 5e-6;
        sim.minTimeStep = 50e-12;
        menus.dotsCheckItem.setState(false);
        menus.smallGridCheckItem.setState(false);
        menus.powerCheckItem.setState(false);
        menus.voltsCheckItem.setState(true);
        menus.showValuesCheckItem.setState(true);
        app.setGrid();
        app.ui.speedBar.setValue(117);
        app.ui.currentBar.setValue(50);
        app.ui.powerBar.setValue(50);
        CircuitElm.voltageRange = 5;
        scopes.clearScopes();
        sim.lastIterTime = 0;
        if (app.contextStack.isEmpty())
            CustomCompositeModel.clearLocalModels();
        if (!app.ui.subcircuitStack.isEmpty()) {
            app.ui.subcircuitStack.clear();
            app.ui.elmList = app.elmList;
            app.ui.updateSubcircuitPath();
        }
    }

    public void readCircuit(String text, int flags) {
        if (text.startsWith("<")) {
	    if ((flags & RC_RETAIN) == 0)
		clearCircuit();
            XMLDeserializer xml = new XMLDeserializer(app);
            xml.readCircuit(text, flags);
            return;
        }
        readCircuit(text.getBytes(), flags);
        if ((flags & RC_KEEP_TITLE) == 0) {
            app.setCircuitTitle(null);
        }
    }

    void readCircuit(String text) {
	readCircuit(text, 0);
    }

    public void loadCircuitFromUrl(String url, String title) {
        RequestBuilder builder = new RequestBuilder(RequestBuilder.GET, url);
        try {
            builder.sendRequest(null, new RequestCallback() {
                public void onResponseReceived(Request request, Response response) {
                    if (response.getStatusCode() == Response.SC_OK) {
                        String text = response.getText();
                        readCircuit(text, RC_KEEP_TITLE);
                        app.allowSave(false);
                        app.unsavedChanges = false;
                    } else {
                        Window.alert(Locale.LS("Can't load circuit!"));
                        GWT.log("Bad file server response:" + response.getStatusText());
                    }
                }

                public void onError(Request request, Throwable exception) {
                    Window.alert(Locale.LS("Can't load circuit!"));
                    GWT.log("File Error Response", exception);
                }
            });
        } catch (RequestException e) {
            GWT.log("failed file reading", e);
        }

        if (title != null) {
            app.setCircuitTitle(title);
        }
        app.unsavedChanges = false;
        ExportAsLocalFileDialog.setLastFileName(null);
    }

    private void readCircuit(byte[] b, int flags) {
        int len = b.length;
        if ((flags & RC_RETAIN) == 0) {
            clearCircuit();
        }
        boolean subs = (flags & RC_SUBCIRCUITS) != 0;

        int p = 0;
        while (p < len) {
            int l;
            int linelen = len - p;
            for (l = 0; l != len - p; l++) {
                if (b[l + p] == '\n' || b[l + p] == '\r') {
                    linelen = l++;
                    if (l + p < b.length && b[l + p] == '\n') l++;
                    break;
                }
            }
            String line = new String(b, p, linelen);
            StringTokenizer st = new StringTokenizer(line, " +\t\n\r\f");
            while (st.hasMoreTokens()) {
                String type = st.nextToken();
                int tint = type.charAt(0);
                try {
                    if (subs && tint != '.') continue;

                    if (tint == 'o') {
                        Scope sc = new Scope(app, sim);
                        sc.undump(st);
                        scopes.addScope(sc);
                        break;
                    }
                    if (tint == 'h') {
                        readHint(st);
                        break;
                    }
                    if (tint == '$') {
                        readOptions(st, flags);
                        break;
                    }
                    if (tint == '!') {
                        CustomLogicModel.undumpModel(st);
                        break;
                    }
                    if (tint == '%' || tint == '?' || tint == 'B') {
                        // ignore afilter-specific stuff
                        break;
                    }

                    if (tint >= '0' && tint <= '9')
                        tint = Integer.parseInt(type);

                    if (tint == 34) {
                        DiodeModel.undumpModel(st);
                        break;
                    }
                    if (tint == 32) {
                        TransistorModel.undumpModel(st);
                        break;
                    }
                    if (tint == 38) {
                        Adjustable adj = new Adjustable(st, app);
                        if (adj.elm != null)
                            app.adjustables.add(adj);
                        break;
                    }
                    if (tint == '.') {
                        CustomCompositeModel.undumpModel(st);
                        break;
                    }

                    int x1 = Integer.parseInt(st.nextToken());
                    int y1 = Integer.parseInt(st.nextToken());
                    int x2 = Integer.parseInt(st.nextToken());
                    int y2 = Integer.parseInt(st.nextToken());
                    int f  = Integer.parseInt(st.nextToken());

                    CircuitElm newce = app.createCe(tint, x1, y1, x2, y2, f, st);
                    if (newce == null) {
                        app.console("unrecognized dump type: " + type);
                        break;
                    }
                    newce.setPoints();
                    app.elmList.addElement(newce);
                } catch (Exception ee) {
                    ee.printStackTrace();
                    app.console("exception while undumping " + ee);
                    break;
                }
                break;
            }
            p += l;
        }

	finishReadCircuit(flags);
    }

    public void finishReadCircuit(int flags) {
        app.setPowerBarEnable();
        app.enableItems();

        if ((flags & RC_RETAIN) == 0) {
            for (int i = 0; i < app.adjustables.size(); i++) {
                if (!app.adjustables.get(i).createSlider(app))
                    app.adjustables.remove(i--);
            }
        }

        app.needAnalyze();
        if ((flags & RC_NO_CENTER) == 0)
            app.centreCircuit();

        if ((flags & RC_SUBCIRCUITS) != 0)
            app.updateModels();

        AudioInputElm.clearCache();
        DataInputElm.clearCache();
    }

    private void readHint(StringTokenizer st) {
        app.hintType  = Integer.parseInt(st.nextToken());
        app.hintItem1 = Integer.parseInt(st.nextToken());
        app.hintItem2 = Integer.parseInt(st.nextToken());
    }

    private void readOptions(StringTokenizer st, int importFlags) {
        int flags = Integer.parseInt(st.nextToken());
        if ((importFlags & RC_RETAIN) != 0) {
            if ((flags & 2) != 0)
                menus.smallGridCheckItem.setState(true);
            return;
        }

        readCircuitFlags(flags);
        sim.maxTimeStep = sim.timeStep = Double.parseDouble(st.nextToken());
        double sp = Double.parseDouble(st.nextToken());
        int sp2 = (int) (Math.log(10 * sp) * 24 + 61.5);
        app.ui.speedBar.setValue(sp2);
        app.ui.currentBar.setValue(Integer.parseInt(st.nextToken()));
        CircuitElm.voltageRange = Double.parseDouble(st.nextToken());
        try {
            app.ui.powerBar.setValue(Integer.parseInt(st.nextToken()));
            sim.minTimeStep = Double.parseDouble(st.nextToken());
        } catch (Exception ignored) {}
        app.setGrid();
    }

    public void readCircuitFlags(int flags) {
        menus.dotsCheckItem.setState((flags & 1) != 0);
        menus.smallGridCheckItem.setState((flags & 2) != 0);
        menus.voltsCheckItem.setState((flags & 4) == 0);
        menus.powerCheckItem.setState((flags & 8) == 8);
        menus.showValuesCheckItem.setState((flags & 16) == 0);
        sim.adjustTimeStep = (flags & 64) != 0;
    }

    void loadFileFromURL(String url) {
	RequestBuilder requestBuilder = new RequestBuilder(RequestBuilder.GET, url);
	
	try {
	    requestBuilder.sendRequest(null, new RequestCallback() {
		public void onError(Request request, Throwable exception) {
		    Window.alert(Locale.LS("Can't load circuit!"));
		    GWT.log("File Error Response", exception);
		}

		public void onResponseReceived(Request request, Response response) {
		    if (response.getStatusCode()==Response.SC_OK) {
			String text = response.getText();
			readCircuit(text, CircuitLoader.RC_KEEP_TITLE);
			app.allowSave(false);
			app.unsavedChanges = false;
		    }
		    else { 
			Window.alert(Locale.LS("Can't load circuit!"));
			GWT.log("Bad file server response:"+response.getStatusText() );
		    }
		}
	    });
	} catch (RequestException e) {
	    GWT.log("failed file reading", e);
	}

    }

}
