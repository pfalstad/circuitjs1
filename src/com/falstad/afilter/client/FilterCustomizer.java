package com.falstad.afilter.client;

import com.google.gwt.event.dom.client.ChangeEvent;
import com.google.gwt.event.dom.client.ChangeHandler;
import com.google.gwt.xml.client.Element;

class FilterCustomizer extends Customizer {
    Choice designChooser;
    double frequency, cfrequency;
    int form, design, poles;
    static int FLAG_POLESLIDER = 128;
    static int FILT_LOPASS = 0;
    static int FILT_HIPASS = 1;
    static int FILT_BANDPASS = 2;
    static int FILT_BANDSTOP = 3;
    static int FILT_OTHER = 0;
    static int FILT_BUTTER = 1;
    static int FILT_CHEBY = 2;
    static int FILT_BESSEL = 3;
    static int FILT_INVCHEBY = 4;
    static int FILT_ELLIPTIC = 5;
    Scrollbar slider, cslider, pslider, rslider, aslider;
    // initial slider values restored from xml (-1 = use default)
    int initPoles = -1, initRipple = -1, initAtten = -1;
    public FilterCustomizer(int f, StringTokenizer st) {
	super(f, st);
	frequency = 1000;
	cfrequency = 2000;
	if (st == null)
	    return;
	frequency = new Double(st.nextToken()).doubleValue();
	cfrequency = new Double(st.nextToken()).doubleValue();
	form = new Integer(st.nextToken()).intValue();
	design = new Integer(st.nextToken()).intValue();
    }
    void dumpXml(Element elem) {
	super.dumpXml(elem);
	XMLSerializer.dumpAttr(elem, "fr", frequency);
	XMLSerializer.dumpAttr(elem, "cf", cfrequency);
	XMLSerializer.dumpAttr(elem, "fo", form);
	XMLSerializer.dumpAttr(elem, "de", design);
	if (pslider != null)
	    XMLSerializer.dumpAttr(elem, "po", pslider.getValue());
	if (rslider != null)
	    XMLSerializer.dumpAttr(elem, "rp", rslider.getValue());
	if (aslider != null)
	    XMLSerializer.dumpAttr(elem, "sa", aslider.getValue());
    }
    void undumpXml(XMLDeserializer xml) {
	super.undumpXml(xml);
	frequency  = xml.parseDoubleAttr("fr", frequency);
	cfrequency = xml.parseDoubleAttr("cf", cfrequency);
	form       = xml.parseIntAttr("fo", form);
	design     = xml.parseIntAttr("de", design);
	initPoles  = xml.parseIntAttr("po", -1);
	initRipple = xml.parseIntAttr("rp", -1);
	initAtten  = xml.parseIntAttr("sa", -1);
    }
    boolean isHiPass()   { return (form == FILT_HIPASS); }
    boolean isBandPass() { return (form == FILT_BANDPASS); }
    boolean isBandStop() { return (form == FILT_BANDSTOP); }
    boolean isBand() { return (form >= FILT_BANDPASS); }
    boolean isCheby()  { return (design == FILT_CHEBY); }
    boolean isBessel() { return (design == FILT_BESSEL); }
    boolean isInvCheby() { return (design == FILT_INVCHEBY); }
    boolean isElliptic() { return (design == FILT_ELLIPTIC); }
    // true if the design has finite transmission zeros
    boolean hasZeros() { return isInvCheby() || isElliptic(); }
    // true if this filter can realize the finite transmission zeros of inverse Chebyshev
    boolean hasInvCheby() { return false; }
    boolean hasElliptic() { return false; }
    int getMaxPoles() { return 7; }
    int getDefaultPoles() { return 1; }
    int getPoleCount() {
	if (pslider == null)
	    return -1;
	int v = pslider.getValue();
	return isBand() ? v*4 : v*2;
    }
    void create() {
	designChooser = new Choice();
	designChooser.add("Butterworth");
	designChooser.add("Chebyshev");
	designChooser.add("Bessel");
	if (hasInvCheby())
	    designChooser.add("Inverse Chebyshev");
	if (hasElliptic())
	    designChooser.add("Elliptic");
	designChooser.addChangeHandler(new ChangeHandler() {
	    public void onChange(ChangeEvent ev) {
		design = designChooser.getSelectedIndex()+1;
		enableSliders();
		frequencyChanged();
	    }
	});
//	designChooser.addItemListener(this);
	if (design > 0) {
	    designChooser.select(design-1);
	    sim.addWidgetToVerticalPanel(designChooser);
	}
		
	String lb = "Cutoff Frequency";
	if (isBand()) {
	    int x = (int) (sim.frequencyToLinear(cfrequency) * 1000);
	    cslider = createSlider("Center Frequency", x, 0, 1000);
	    lb = "Bandwidth";
	}
	
	int x = (int) (sim.frequencyToLinear(frequency) * 1000);
	slider = createSlider(lb, x, 0, 1000);

	pslider = null;
	if ((flags & FLAG_POLESLIDER) != 0)
	    pslider = createSlider("# of Poles", initPoles >= 0 ? initPoles : getDefaultPoles(), 1, getMaxPoles()+1);

	rslider = null;
	if (design > 0)
	    rslider = createSlider("Passband Ripple", initRipple >= 0 ? initRipple : 60, 1, 999);
	aslider = null;
	if (design > 0 && (hasInvCheby() || hasElliptic()))
	    aslider = createSlider("Stopband Attenuation", initAtten >= 0 ? initAtten : 400, 0, 901);
	if (design > 0)
	    enableSliders();
	
//	sim.main.validate();
	frequencyChanged();
    }
    void enableSliders() {
	rslider.setEnabled(design == FILT_CHEBY || design == FILT_ELLIPTIC);
	if (aslider != null)
	    aslider.setEnabled(hasZeros());
    }
    void delete() {
	super.delete();
	sim.removeWidgetFromVerticalPanel(designChooser);
    }
    void slidersChanged(Scrollbar s) {
	if (s == slider) {
	    double x = slider.getValue()/1000.;
	    frequency = sim.linearToFrequency(x);
	} else if (s == cslider) {
	    double x = cslider.getValue()/1000.;
	    cfrequency = sim.linearToFrequency(x);
	} else if (s == pslider) {
	    polesChanged();
	    return;
	} else if (s == rslider || s == aslider) {
	    frequencyChanged();
	    return;
	}
	// clamp bandwidth so lower band edge stays positive (frequency/2 < cfrequency)
	if (isBand() && frequency > 2 * cfrequency) {
	    frequency = 2 * cfrequency;
	    int sx = (int) (sim.frequencyToLinear(frequency) * 1000);
	    slider.setValue(sx);
	}
	frequencyChanged();
    }
    /*
    public void itemStateChanged(ItemEvent ie) {
	design = designChooser.getSelectedIndex()+1;
//	rslider.setEnabled(design == FILT_CHEBY);
	frequencyChanged();
    }
    */
    double getFrequency() { return (isBand()) ? cfrequency : frequency; }
    void getInfo(String info[], int i) {
	if (isBand()) {
	    info[i++] = "Center Freq: " +
		CircuitElm.getUnitText(cfrequency, "Hz");
	    info[i++] = (isBandPass() ?
			 "Passband width: " :
			 "Stopband width: ") +
		CircuitElm.getUnitText(frequency, "Hz");
	} else
	    info[i++] = "Cutoff: " + CircuitElm.getUnitText(frequency, "Hz");
	int pl = getPoleCount();
	if (pl > 0)
	    info[i++] = "Poles: " + pl;
	if (design == FILT_CHEBY || design == FILT_ELLIPTIC)
	    info[i++] = "Ripple: " + CircuitElm.showFormat.format(ripdb) +
		" dB";
	if (hasZeros())
	    info[i++] = "Stopband: -" + CircuitElm.showFormat.format(getStopDb()) +
		" dB";
    }
    void frequencyChanged() {}
    double getScaleFactor(double w, Complex x[]) { return 1; }

    // scale factor giving the response the gain at the frequency that
    // corresponds to DC in the lowpass prototype
    double getRefScaleFactor(double gain, Complex poles[]) {
	// gain at infinity equals the lowpass prototype's gain at DC
	if (isHiPass())
	    return gain;

	// at the frequency corresponding to DC in the prototype (0, or w0 for
	// bandpass), the response should equal the gain
	Complex ref = new Complex(0, isBandPass() ? 2*Math.PI*cfrequency : 0);
	Complex zeros[] = getZeros();
	int i;
	double x = gain;
	for (i = 0; i != poles.length; i++) {
	    Complex p = new Complex(poles[i]);
	    p.subtract(ref);
	    x *= p.mag();
	}
	if (zeros != null)
	    for (i = 0; i != zeros.length; i++) {
		Complex z = new Complex(zeros[i]);
		z.subtract(ref);
		x /= z.mag();
	    }
	return x;
    }
    
    double [] getIdealResponse(int size) {
	Complex poles[] = getPoles();
	if (poles == null)
	    return null;
	Complex zeros[] = getZeros();
	double resp[] = new double[size];
	int i;
	int pcount = poles.length;
	Complex c1 = new Complex();
	Complex tot = new Complex();
	Complex c2 = new Complex();
	int zcount = (zeros == null) ? 0 : zeros.length;
	for (i = 0; i != size; i++) {
	    double w = 2*Math.PI*sim.linearToFrequency(i/(double) size);
	    int pn;
	    tot.set(getScaleFactor(w, poles), 0);
	    for (pn = 0; pn != pcount; pn++) {
		// divide by z-p
		c1.set(0, w);
		c1.subtract(poles[pn]);
		tot.divide(c1);

		/*
		// divide by z-pconjugate
		c1.set(0, w);
		c2.set(poles[pn]);
		c2.conjugate();
		c1.subtract(c2);
		tot.divide(c1);*/
	    }
	    for (pn = 0; pn != zcount; pn++) {
		// multiply by z-p
		c1.set(0, w);
		c1.subtract(zeros[pn]);
		tot.mult(c1);
	    }
	    resp[i] = tot.mag();
	}
	return resp;
    }

    void getButterPole(int pn, int poles, Complex c1, double wc) {
	double theta = Math.PI/2 + (2*pn+1)*Math.PI/(2*poles);
	c1.setMagPhase(wc, theta);
    }

    static final double besselPoles[] = {
	-1.0000000, 0, -1.1016013, -0.6360098, -1.1016013, 0.6360098, -1.3226758, 0, 
	-1.0474092, -0.9992644, -1.0474092, 0.9992644, -1.3700678, -0.4102497, 
	-1.3700678, 0.4102497, -0.9952088, -1.2571057, -0.9952088, 1.2571057, 
	-1.5023163, 0, -1.3808773, -0.7179096, -1.3808773, 0.7179096, -0.9576765, 
	-1.4711243, -0.9576765, 1.4711243, -1.5714904, -0.3208964, -1.5714904, 
	0.3208964, -1.3818581, -0.9714719, -1.3818581, 0.9714719, -0.9306565, 
	-1.6618633, -0.9306565, 1.6618633, -1.6843682, 0, -1.6120388, -0.5892445, 
	-1.6120388, 0.5892445, -1.3789032, -1.1915668, -1.3789032, 1.1915668, 
	-0.9098678, -1.8364514, -0.9098678, 1.8364514, -1.7574084, -0.2728676, 
	-1.7574084, 0.2728676, -1.6369394, -0.8227956, -1.6369394, 0.8227956, 
	-1.3738412, -1.3883566, -1.3738412, 1.3883566, -0.8928697, -1.9983258, 
	-0.8928697, 1.9983258, -1.8566005, 0, -1.8071705, -0.5123837, -1.8071705, 
	0.5123837, -1.6523965, -1.0313896, -1.6523965, 1.0313896, -1.3675883, 
	-1.5677337, -1.3675883, 1.5677337, -0.8783993, -2.1498005, -0.8783993, 
	2.1498005, -1.9276197, -0.2416235, -1.9276197, 0.2416235, -1.8421962, 
	-0.7272576, -1.8421962, 0.7272576, -1.6618102, -1.2211002, -1.6618102, 
	1.2211002, -1.3606923, -1.7335057, -1.3606923, 1.7335057, -0.8657569, 
	-2.2926048, -0.8657569, 2.2926048, -2.0167015, 0, -1.9801606, -0.4595987, 
	-1.9801606, 0.4595987, -1.8673612, -0.9231156, -1.8673612, 0.9231156, 
	-1.6671936, -1.3959629, -1.6671936, 1.3959629, -1.3534867, -1.8882968, 
	-1.3534867, 1.8882968, -0.8545126, -2.4280595, -0.8545126, 2.4280595, 
	-2.0846445, -0.2191615, -2.0846445, 0.2191615, -2.0199459, -0.6589965, 
	-2.0199459, 0.6589965, -1.8856496, -1.1038149, -1.8856496, 1.1038149, 
	-1.6698036, -1.5588027, -1.6698036, 1.5588027, -1.3461747, -2.0339985, 
	-1.3461747, 2.0339985, -0.8443789, -2.5571890, -0.8443789, 2.5571890, 
	-2.1660827, 0, -2.1376483, -0.4204163, -2.1376483, 0.4204163, -2.0505809, 
	-0.8433831, -2.0505809, 0.8433831, -1.8989861, -1.2721194, -1.8989861, 
	1.2721194, -1.6704585, -1.7116783, -1.6704585, 1.7116783, -1.3388803, 
	-2.1720229, -1.3388803, 2.1720229, -0.8351520, -2.6808028, -0.8351520, 
	2.6808028, -2.2309307, -0.2020003, -2.2309307, 0.2020003, -2.1797095, 
	-0.6070298, -2.1797095, 0.6070298, -2.0744515, -1.0153671, -2.0744515, 
	1.0153671, -1.9086645, -1.4300797, -1.9086645, 1.4300797, -1.6697101, 
	-1.8561387, -1.6697101, 1.8561387, -1.3316792, -2.3034553, -1.3316792, 
	2.3034553, -0.8266813, -2.7995522, -0.8266813, 2.7995522, -2.3063700, 0, 
	-2.2834265, -0.3898289, -2.2834265, 0.3898289, -2.2135274, -0.7814300, 
	-2.2135274, 0.7814300, -2.0931997, -1.1769161, -2.0931997, 1.1769161, 
	-1.9155843, -1.5792603, -1.9155843, 1.5792603, -1.6679408, -1.9933807, 
	-1.6679408, 1.9933807, -1.3246167, -2.4291497, -1.3246167, 2.4291497, 
	-0.8188518, -2.9139698, -0.8188518, 2.9139698, -2.3683466, -0.1883329, 
	-2.3683466, 0.1883329, -2.3264790, -0.5657367, -2.3264790, 0.5657367, 
	-2.2409931, -0.9454740, -2.2409931, 0.9454740, -2.1079907, -1.3295524, 
	-2.1079907, 1.3295524, -1.9203880, -1.7208833, -1.9203880, 1.7208833, 
	-1.6654219, -2.1243495, -1.6654219, 2.1243495, -1.3177194, -2.5497920, 
	-1.3177194, 2.5497920, -0.8115734, -3.0244979, -0.8115734, 3.0244979
    };

    void getBesselPole(int pn, int poles, Complex c1, double wc, boolean lp) {
	int base = (poles-1)*poles;
	if (poles % 2 == 1) {
	    // odd order: real pole is first in the table; put it last
	    if (pn == poles-1)
		pn = 0;
	    else {
		base += 2;
		poles--;
	    }
	}
	// conjugate poles should be sorted into second half of pole array
	if (pn < poles/2)
	    base += pn*4;
	else
	    //base += 2+(pn-poles/2)*4;
	    base += 2+(poles-1-pn)*4;
	c1.set(besselPoles[base], besselPoles[base+1]);
	if (isHiPass() && !lp)
	    c1.recip();
	c1.mult(wc);
	//System.out.println("bessel  " + pn + " " + c1.asString());
    }

    Complex [] getPoles() { return getPoles(false); }
    
    Complex [] getPoles(boolean lopass) {
	if (!lopass && form == FILT_BANDPASS)
	    return getBandPassPoles();
	if (!lopass && form == FILT_BANDSTOP)
	    return getBandStopPoles();
	int i;
	int pn = getPoleCount();
	if (isBand())
	    pn /= 2;
	Complex poles[] = new Complex[pn];
	double wc = 2*Math.PI*frequency;
	for (i = 0; i != pn; i++) {
	    poles[i] = new Complex();
	    getPole(i, pn, poles[i], wc, lopass);
	}
	return poles;
    }

    Complex [] getBandPassPoles() {
	int i;
	/*
	  linear center frequency
	double wl = 2*Math.PI*(cfrequency-frequency/2);
	if (wl < 1)
	    wl = 1;
	double wu = 2*Math.PI*(cfrequency+frequency/2);

	double w0 = Math.sqrt(wu*wl);
	double bw = wu-wl;*/

	// geometric center frequency
	double w0 = 2*Math.PI*cfrequency;
	double bw = 2*Math.PI*frequency;
	
	// bandpass transform
	double a = -1/bw;
	double c = -w0*w0/bw;
	int poles2 = getPoleCount()/2;
	Complex poles[] = new Complex[poles2*2];
	for (i = 0; i != poles2; i++) {
	    Complex b = new Complex();
	    getPole(i, poles2, b, 1, true);
	    Complex b2 = new Complex(b);
	    b2.mult(b);
	    b2.add(-4*a*c);
	    b2.sqrt();
	    Complex p1 = new Complex(b2);
	    p1.subtract(b);
	    p1.mult(1/(2*a));
	    Complex p2 = new Complex(b2);
	    p2.mult(-1);
	    p2.subtract(b);
	    p2.mult(1/(2*a));
	    poles[i] = p1;
	    poles[i+poles2] = p2;
	}
	return poles;
    }
    
    Complex [] getBandStopPoles() {
	int i;

	// geometric center frequency
	double w0 = 2*Math.PI*cfrequency;
	double bw = 2*Math.PI*frequency;
	double q = w0/bw;
	
	// bandpass transform
	int poles2 = getPoleCount()/2;
	Complex poles[] = new Complex[poles2*2];
	for (i = 0; i != poles2; i++) {
	    Complex a = new Complex();
	    getPole(i, poles2, a, 1, true);
	    a.mult(2*q);
	    Complex a2 = new Complex(a);
	    a2.mult(a);
	    a2.add(-1);
	    a2.mult(-w0*w0);
	    a2.sqrt();
	    Complex p1 = new Complex(a2);
	    p1.mult(-1);
	    p1.add(w0);
	    p1.divide(a);
	    Complex p2 = new Complex(a2);
	    p2.add(w0);
	    p2.divide(a);
	    poles[i] = p1;
	    poles[i+poles2] = p2;
	}
	return poles;
    }
    
    Complex [] getBandStopZeros() {
	int poles2 = getPoleCount()/2;
	Complex zeros[] = new Complex[poles2*2];
	// geometric center frequency
	double w0 = 2*Math.PI*cfrequency;
	int i;
	for (i = 0; i != poles2; i++) {
	    zeros[i] = new Complex(0, w0);
	    zeros[i+poles2] = new Complex(0, -w0);
	}
	return zeros;
    }
    
    void getPole(int i, int pn, Complex c1, double wc, boolean lopass) {
	if (isCheby())
	    getChebyPole(i, pn, c1, wc, lopass);
	else if (isBessel())
	    getBesselPole(i, pn, c1, wc, lopass);
	else if (hasZeros())
	    getZeroPole(i, pn, c1, wc, lopass);
	else
	    getButterPole(i, pn, c1, wc);
    }
    
    // order of the lowpass prototype
    int getOrder() {
	int n = getPoleCount();
	return isBand() ? n/2 : n;
    }

    // finite zeros of the lowpass prototype (normalized to 1 rad/s), as the
    // positive frequencies w of each pair of zeros at +/- jw.  the rest of the
    // zeros are at infinity.
    double [] getProtoZeros() {
	if (!hasZeros())
	    return new double[0];
	calcZeros(getOrder());
	return protoZeros;
    }

    Complex [] getZeros() {
	int n = getOrder();
	double pz[] = getProtoZeros();
	int ninf = n-2*pz.length;
	double wc = 2*Math.PI*frequency;
	double w0 = 2*Math.PI*cfrequency;
	int i, j = 0;
	Complex zeros[];
	if (isBandPass()) {
	    // each prototype zero gives a pair on either side of w0; the zeros
	    // at infinity give zeros at 0 (and infinity)
	    zeros = new Complex[4*pz.length + ninf];
	    for (i = 0; i != pz.length; i++) {
		double a = pz[i]*wc;
		double b = Math.sqrt(a*a + 4*w0*w0);
		zeros[j++] = new Complex(0, (a+b)/2);
		zeros[j++] = new Complex(0, (a-b)/2);
		zeros[j++] = new Complex(0, -(a+b)/2);
		zeros[j++] = new Complex(0, -(a-b)/2);
	    }
	    while (j < zeros.length)
		zeros[j++] = new Complex(0, 0);
	} else if (isBandStop()) {
	    // each prototype zero gives a pair on either side of w0; the zeros
	    // at infinity give zeros at w0
	    zeros = new Complex[4*pz.length + 2*ninf];
	    for (i = 0; i != pz.length; i++) {
		double b = Math.sqrt(wc*wc + 4*pz[i]*pz[i]*w0*w0);
		zeros[j++] = new Complex(0, (wc+b)/(2*pz[i]));
		zeros[j++] = new Complex(0, (wc-b)/(2*pz[i]));
		zeros[j++] = new Complex(0, -(wc+b)/(2*pz[i]));
		zeros[j++] = new Complex(0, -(wc-b)/(2*pz[i]));
	    }
	    for (i = 0; i != ninf; i++) {
		zeros[j++] = new Complex(0, w0);
		zeros[j++] = new Complex(0, -w0);
	    }
	} else if (isHiPass()) {
	    zeros = new Complex[2*pz.length + ninf];
	    for (i = 0; i != pz.length; i++) {
		zeros[j++] = new Complex(0, wc/pz[i]);
		zeros[j++] = new Complex(0, -wc/pz[i]);
	    }
	    while (j < zeros.length)
		zeros[j++] = new Complex(0, 0);
	} else {
	    if (pz.length == 0)
		return null;
	    zeros = new Complex[2*pz.length];
	    for (i = 0; i != pz.length; i++) {
		zeros[j++] = new Complex(0, wc*pz[i]);
		zeros[j++] = new Complex(0, -wc*pz[i]);
	    }
	}
	return zeros;
    }

    // added to the stopband attenuation if needed to realize the filter
    double stopDbExtra;
    double getStopDb() {
	return 10 + aslider.getValue()/10. + stopDbExtra;
    }

    // number of the highest finite zeros of the prototype to move to infinity
    // (see moveZeros)
    int zerosMoved;
    // true if the response must go to zero at infinity, as with an LC ladder
    boolean needsZeroAtInfinity() { return true; }
    // poles and finite zeros of the inverse Chebyshev or elliptic prototype
    Complex protoPoles[];
    double protoZeros[];

    void calcZeros(int n) {
	if (isElliptic())
	    calcElliptic(n);
	else
	    calcInvCheby(n);
    }

    // inverse Chebyshev lowpass prototype of order n, with the 3 dB point at 1 rad/s
    void calcInvCheby(int n) {
	double epsilon = 1/Math.sqrt(Math.pow(10, getStopDb()/10)-1);
	double alpha = 1/epsilon + Math.sqrt(1+1/(epsilon*epsilon));
	double a = .5*(Math.pow(alpha, 1./n) - Math.pow(alpha, -1./n));
	double b = .5*(Math.pow(alpha, 1./n) + Math.pow(alpha, -1./n));
	// 3 dB point relative to the stopband edge
	double w3 = 1/cosh(arccosh(1/epsilon)/n);
	int i, k;
	// poles are the reciprocals of the Chebyshev poles
	protoPoles = new Complex[n];
	for (i = 0; i != n; i++) {
	    Complex c1 = protoPoles[i] = new Complex();
	    double theta = Math.PI/2 + (2*i+1)*Math.PI/(2*n);
	    c1.setMagPhase(1, theta);
	    c1.re *= a;
	    c1.im *= b;
	    c1.recip();
	    c1.mult(1/w3);
	}
	// zeros, in increasing order
	protoZeros = new double[n/2];
	for (k = 0; k != n/2; k++)
	    protoZeros[k] = 1/(Math.cos((2*k+1)*Math.PI/(2*n))*w3);
	moveZeros(n);
    }

    // elliptic lowpass prototype of order n, with the 3 dB point at 1 rad/s
    void calcElliptic(int n) {
	double stopDb = getStopDb();
	// the ripple must be less than the stopband attenuation
	double passDb = Math.min(getRippleDb(), stopDb-3);
	ripdb = passDb;
	Elliptic e = new Elliptic(n, passDb, stopDb);
	protoPoles = e.poles;
	protoZeros = e.zeros;

	// find the 3 dB point by bisection where the response is monotonic: in
	// the passband above the last peak for ripple of at least 3 dB, otherwise
	// in the transition band
	double target = protoGainDb(e.peak) - 10*Math.log10(2);
	double lo = 1, hi = 1/e.k;
	if (protoGainDb(1) < target) {
	    lo = e.peak;
	    hi = 1;
	}
	int i;
	for (i = 0; i != 60; i++) {
	    double m = (lo+hi)/2;
	    if (protoGainDb(m) >= target)
		lo = m;
	    else
		hi = m;
	}
	double w3 = (lo+hi)/2;
	for (i = 0; i != n; i++)
	    protoPoles[i].mult(1/w3);
	for (i = 0; i != protoZeros.length; i++)
	    protoZeros[i] /= w3;
	moveZeros(n);
    }

    // unnormalized gain of the prototype at w, in dB
    double protoGainDb(double w) {
	double x = 1;
	int i;
	for (i = 0; i != protoPoles.length; i++) {
	    Complex c = new Complex(0, w);
	    c.subtract(protoPoles[i]);
	    x /= c.mag();
	}
	for (i = 0; i != protoZeros.length; i++)
	    x *= Math.abs(protoZeros[i]*protoZeros[i] - w*w);
	return 20*Math.log10(x);
    }

    // Even orders have a nonzero response at infinity, which an LC ladder can't
    // produce, and some odd orders have no ladder realization with positive
    // elements.  So move the highest zero to infinity with the transformation
    // w'^2 = c w^2/(1 - w^2/wz^2), which keeps w = 1 fixed and keeps the
    // stopband equiripple (and the passband, for elliptic filters).
    void moveZeros(int n) {
	int i, k;
	int moved = Math.min(Math.max(zerosMoved, needsZeroAtInfinity() ? 1-n%2 : 0), protoZeros.length);
	for (k = 0; k != moved; k++) {
	    int m = protoZeros.length-1;
	    double xz = protoZeros[m]*protoZeros[m];
	    double c = 1-1/xz;
	    for (i = 0; i != n; i++) {
		// x = w^2 = -s^2
		Complex p = protoPoles[i];
		Complex x = new Complex(p);
		x.square();
		x.mult(-1);
		Complex d = new Complex(x);
		d.mult(-1/xz);
		d.add(1);
		x.mult(c);
		x.divide(d);
		x.mult(-1);
		x.sqrt();
		// pick the left half plane root, in the same half as the original pole
		if (x.re > 0)
		    x.mult(-1);
		if (x.im*p.im < 0)
		    x.conjugate();
		protoPoles[i] = x;
	    }
	    double z[] = new double[m];
	    for (i = 0; i != m; i++) {
		double x = protoZeros[i]*protoZeros[i];
		z[i] = Math.sqrt(c*x/(1-x/xz));
	    }
	    protoZeros = z;
	}
    }

    void getZeroPole(int i, int n, Complex c1, double wc, boolean lp) {
	calcZeros(n);
	c1.set(protoPoles[i]);
	if (isHiPass() && !lp)
	    c1.recip();
	c1.mult(wc);
    }

    double ripdb;

    double getRippleDb() {
	int val = rslider.getValue();
	if (val < 300)
	    return 5*val/300.;
	return 5+45*(val-300)/700.;
    }

    void getChebyPole(int i, int n, Complex c1, double wc, boolean lp) {
	ripdb = getRippleDb();
	double ripval = Math.exp(-ripdb*.1*Math.log(10));
	double epsilon = Math.sqrt(1/ripval-1);
	double alpha = 1/epsilon + Math.sqrt(1+1/(epsilon*epsilon));
	double a = .5*(Math.pow(alpha, 1./n) - Math.pow(alpha, -1./n));
	double b = .5*(Math.pow(alpha, 1./n) + Math.pow(alpha, -1./n));
	double theta = Math.PI/2 + (2*i+1)*Math.PI/(2*n);
	c1.setMagPhase(1, theta);
	c1.re *= a;
	c1.im *= b;
	if (isHiPass() && !lp)
	    c1.recip();

	// get 3db cutoff
	double wc3 = wc;
	if (epsilon < 1)
	    wc3 /= cosh(arccosh(1/epsilon)/n);
	else
	    wc3 /= Math.cos(Math.acos(1/epsilon)/n);
	if (isHiPass() && !lp)
	    wc3 = wc * (wc/wc3);
	//System.out.println("wc3 "  + wc3 + " " + wc + " " + epsilon);
	c1.mult(wc3);
    }

    double cosh(double x) {
	return .5*(Math.exp(x)+Math.exp(-x));
    }

    double arccosh(double x) {
	return Math.log(x+Math.sqrt(x*x-1));
    }

    int getBoxCount() {
	if (isBand())
	    return getPoleCount()/4;
	return getPoleCount()/2;
    }
    
    void polesChanged() {
	int oldBoxes = sim.countElm(BoxElm.class);
	int newBoxes = getBoxCount();
	if (oldBoxes == newBoxes)
	    return;
	BoxElm be1 = (BoxElm) sim.getElm(0, BoxElm.class);
	BoxElm belast = (BoxElm) sim.getElm(oldBoxes-1, BoxElm.class);
	if (newBoxes > oldBoxes) {
	    sim.makeRoom(belast.x2, (be1.x2-be1.x)*(newBoxes-oldBoxes));
	    int i;
	    for (i = oldBoxes; i < newBoxes; i++)
		belast = sim.cloneBox(belast, be1.x2-be1.x);
	} else {
	    int i;
	    for (i = oldBoxes; i > newBoxes; i--)
		sim.deleteBox((BoxElm) sim.getElm(i-1, BoxElm.class));
	    belast = (BoxElm) sim.getElm(newBoxes-1, BoxElm.class);
	    //System.out.println(be1 + " " + belast + " " + oldBoxes);
	    sim.makeRoom(belast.x2, (be1.x2-be1.x)*(newBoxes-oldBoxes));
	}
	frequencyChanged();
	sim.centerCircuit();
    }
    // helpers for customizers that generate their circuit in code

    CircuitElm add(String s) {
	try {
	    return sim.undump(s);
	} catch (Exception e) {
	    e.printStackTrace();
	    return null;
	}
    }

    CircuitElm add(char type, int x1, int y1, int x2, int y2, String rest) {
	return add(type + " " + x1 + " " + y1 + " " + x2 + " " + y2 + " 0 " + rest);
    }

    void addWire(int x1, int y1, int x2, int y2) { add('w', x1, y1, x2, y2, ""); }

    // delete everything but the sweep source, which is moved (or created) so
    // its output is at (x, y)
    void clearCircuit(int x, int y) {
	int i;
	SweepElm src = null;
	sim.clearMouseElm();
	for (i = 0; i != sim.elmList.size(); i++) {
	    CircuitElm ce = sim.getElm(i);
	    if (src == null && ce instanceof SweepElm) {
		src = (SweepElm) ce;
		continue;
	    }
	    ce.delete();
	    sim.elmList.removeElementAt(i--);
	}
	if (src == null)
	    add("170 " + x + " " + y + " " + (x-32) + " " + y + " 2 20 4000 5 0.1");
	else
	    src.move(x-src.x, y-src.y);
    }
};
