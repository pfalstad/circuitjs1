package com.lushprojects.circuitjs1.client;

import java.util.Arrays;

import com.google.gwt.canvas.client.Canvas;
import com.google.gwt.canvas.dom.client.Context2d;
import com.google.gwt.dom.client.CanvasElement;
import com.google.gwt.core.client.Callback;
import com.google.gwt.core.client.ScriptInjector;
import com.google.gwt.user.client.Window;

public class ImageExporter {

	static final int CAC_PRINT = 0;
	static final int CAC_IMAGE = 1;
	static final int CAC_SVG   = 2;

	CirSim sim;
	boolean loadedCanvas2SVG = false;

	ImageExporter(CirSim sim) {
		this.sim = sim;
	}

	void doExportAsImage() {
		sim.dialogShowing = new ExportAsImageDialog(CAC_IMAGE);
		sim.dialogShowing.show();
	}

	private static native void clipboardWriteImage(CanvasElement cv) /*-{
		cv.toBlob(function(blob) {
		    var promise = parent.navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
		    promise.then(function(x) { console.log(x); });
		});
	}-*/;

	void doImageToClipboard() {
		Canvas cv = getCircuitAsCanvas(CAC_IMAGE);
		clipboardWriteImage(cv.getCanvasElement());
	}

	native void printCanvas(CanvasElement cv) /*-{
	    var img    = cv.toDataURL("image/png");
	    var win = window.open("", "print", "height=500,width=500,status=yes,location=no");
	    win.document.title = "Print Circuit";
	    win.document.open();
	    win.document.write('<img src="'+img+'"/>');
	    win.document.close();
	    setTimeout(function(){win.print();},1000);
	}-*/;

	void doPrint() {
	    Canvas cv = getCircuitAsCanvas(CAC_PRINT);
	    printCanvas(cv.getCanvasElement());
	}

	boolean initializeSVGScriptIfNecessary(final String followupAction) {
		// load canvas2svg if we haven't already
		if (!loadedCanvas2SVG) {
			ScriptInjector.fromUrl("canvas2svg.js").setCallback(new Callback<Void,Exception>() {
				public void onFailure(Exception reason) {
					Window.alert("Can't load canvas2svg.js.");
				}
				public void onSuccess(Void result) {
					loadedCanvas2SVG = true;
					if (followupAction.equals("doExportAsSVG")) {
						doExportAsSVG();
					} else if (followupAction.equals("doExportAsSVGFromAPI")) {
						doExportAsSVGFromAPI();
					}
				}
			}).inject();
			return false;
		}
		return true;
	}

	void doExportAsSVG() {
		if (!initializeSVGScriptIfNecessary("doExportAsSVG")) {
			return;
		}
		sim.dialogShowing = new ExportAsImageDialog(CAC_SVG);
		sim.dialogShowing.show();
	}

	public void doExportAsSVGFromAPI() {
		if (!initializeSVGScriptIfNecessary("doExportAsSVGFromAPI")) {
			return;
		}
		String svg = getCircuitAsSVG();
		sim.jsInterface.callSVGRenderedHook(svg);
	}

	public Canvas getCircuitAsCanvas(int type) {
	    	// create canvas to draw circuit into
	    	Canvas cv = Canvas.createIfSupported();
	    	Rectangle bounds = sim.getCircuitBounds();

		// add some space on edges because bounds calculation is not perfect
	    	int wmargin = 140;
	    	int hmargin = 100;
	    	int w = (bounds.width*2+wmargin) ;
	    	int h = (bounds.height*2+hmargin) ;
	    	cv.setCoordinateSpaceWidth(w);
	    	cv.setCoordinateSpaceHeight(h);

		Context2d context = cv.getContext2d();
		drawCircuitInContext(context, type, bounds, w, h);
		return cv;
	}

	// create SVG context using canvas2svg
	native static Context2d createSVGContext(int w, int h) /*-{
	    return new C2S(w, h);
	}-*/;

	native static String getSerializedSVG(Context2d context) /*-{
	    return context.getSerializedSvg();
	}-*/;

	public String getCircuitAsSVG() {
	    Rectangle bounds = sim.getCircuitBounds();

	    // add some space on edges because bounds calculation is not perfect
	    int wmargin = 140;
	    int hmargin = 100;
	    int w = (bounds.width+wmargin) ;
	    int h = (bounds.height+hmargin) ;
	    Context2d context = createSVGContext(w, h);
	    drawCircuitInContext(context, CAC_SVG, bounds, w, h);
	    return getSerializedSVG(context);
	}

	void drawCircuitInContext(Context2d context, int type, Rectangle bounds, int w, int h) {
		Graphics g = new Graphics(context);
		context.setTransform(1, 0, 0, 1, 0, 0);
	    	double oldTransform[] = Arrays.copyOf(sim.transform, 6);

	        double scale = 1;

		// turn on white background, turn off current display
		boolean p = sim.menus.printableCheckItem.getState();
		boolean c = sim.menus.dotsCheckItem.getState();
		boolean print = (type == CAC_PRINT);
		if (print)
		    sim.menus.printableCheckItem.setState(true);
	        if (sim.menus.printableCheckItem.getState()) {
	            CircuitElm.whiteColor = Color.black;
	            CircuitElm.lightGrayColor = Color.black;
	            g.setColor(Color.white);
	        } else {
	            CircuitElm.whiteColor = Color.white;
	            CircuitElm.lightGrayColor = Color.lightGray;
	            g.setColor(Color.black);
	        }
	        g.fillRect(0, 0, w, h);
		sim.menus.dotsCheckItem.setState(false);

	    	int wmargin = 140;
	    	int hmargin = 100;
	        if (bounds != null)
	            scale = Math.min(w /(double)(bounds.width+wmargin),
	                             h/(double)(bounds.height+hmargin));

	        // ScopeElms need the transform array to be updated
		sim.transform[0] = sim.transform[3] = scale;
		sim.transform[4] = -(bounds.x-wmargin/2);
		sim.transform[5] = -(bounds.y-hmargin/2);
		context.scale(scale, scale);
		context.translate(sim.transform[4], sim.transform[5]);
		context.setLineCap(Context2d.LineCap.ROUND);

		// draw elements
		for (CircuitElm ce : sim.elmList) {
		    ce.draw(g);
		}
		int i;
		for (i = 0; i != sim.postDrawList.size(); i++) {
		    CircuitElm.drawPost(g, sim.postDrawList.get(i));
		}

		// restore everything
		sim.menus.printableCheckItem.setState(p);
		sim.menus.dotsCheckItem.setState(c);
		sim.transform = oldTransform;
	}
}
