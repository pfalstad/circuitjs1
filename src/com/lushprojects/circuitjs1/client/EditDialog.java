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


import com.google.gwt.user.client.ui.HTML;
import com.google.gwt.user.client.ui.Button;
import com.google.gwt.user.client.ui.VerticalPanel;
import com.lushprojects.circuitjs1.client.util.Locale;
import com.google.gwt.user.client.ui.HorizontalPanel;
import com.google.gwt.event.dom.client.ClickHandler;
import com.google.gwt.event.dom.client.ClickEvent;
import com.google.gwt.user.client.ui.Label;
import com.google.gwt.user.client.ui.TextBox;
import com.google.gwt.i18n.client.NumberFormat;
import com.google.gwt.event.dom.client.ChangeHandler;
import com.google.gwt.dom.client.Style.Unit;
import com.google.gwt.event.dom.client.ChangeEvent;
import com.google.gwt.event.logical.shared.ValueChangeHandler;
import com.google.gwt.event.logical.shared.ValueChangeEvent;
import com.google.gwt.event.shared.GwtEvent;
import com.google.gwt.user.client.ui.HasHorizontalAlignment;
import com.google.gwt.user.client.ui.HasVerticalAlignment;
import com.google.gwt.core.client.Scheduler;
import com.google.gwt.user.client.Timer;
import com.google.gwt.event.dom.client.MouseDownHandler;
import com.google.gwt.event.dom.client.MouseDownEvent;
import com.google.gwt.event.dom.client.MouseUpHandler;
import com.google.gwt.event.dom.client.MouseUpEvent;
import com.google.gwt.event.dom.client.MouseOutHandler;
import com.google.gwt.event.dom.client.MouseOutEvent;
import com.google.gwt.event.dom.client.TouchStartHandler;
import com.google.gwt.event.dom.client.TouchStartEvent;
import com.google.gwt.event.dom.client.TouchEndHandler;
import com.google.gwt.event.dom.client.TouchEndEvent;
import com.google.gwt.event.dom.client.TouchCancelHandler;
import com.google.gwt.event.dom.client.TouchCancelEvent;

interface Editable {
    EditInfo getEditInfo(int n);
    void setEditValue(int n, EditInfo ei);
    // title shown in the edit dialog's title bar, e.g. "Edit Resistor" or "Edit Diode Model"
    String getDialogTitle();
}

class EditDialog extends Dialog {
	Editable elm;
	CirSim cframe;
	Button applyButton, okButton, cancelButton;
	EditInfo einfos[];
	int einfocount;
	final int barmax = 1000;
	VerticalPanel mainPanel;
	HorizontalPanel bottomButtonPanel;
	Label errorLabel;
	TextBox firstTextBox;
	static NumberFormat noCommaFormat = NumberFormat.getFormat("####.##########");

	EditDialog(Editable ce, CirSim f) {
//		super(f, "Edit Component", false);
		super(); // Do we need this?
		String title = ce.getDialogTitle();
		setText(Locale.LS(title));
		cframe = f;
		elm = ce;
//		setLayout(new EditDialogLayout());
		mainPanel=new VerticalPanel();
		setWidget(mainPanel);
		einfos = new EditInfo[20];
//		noCommaFormat = DecimalFormat.getInstance();
//		noCommaFormat.setMaximumFractionDigits(10);
//		noCommaFormat.setGroupingUsed(false);
		bottomButtonPanel = new HorizontalPanel();
		bottomButtonPanel.setWidth("100%");
		bottomButtonPanel.setHorizontalAlignment(HasHorizontalAlignment.ALIGN_LEFT);
		bottomButtonPanel.setStyleName("topSpace");
		mainPanel.add(bottomButtonPanel);
		applyButton = new Button(Locale.LS("Apply"));
		bottomButtonPanel.add(applyButton);
		applyButton.addClickHandler(new ClickHandler() {
			public void onClick(ClickEvent event) {
				apply();
			}
		});
		bottomButtonPanel.add(okButton = new Button(Locale.LS("OK")));
		okButton.addClickHandler(new ClickHandler() {
			public void onClick(ClickEvent event) {
				if (apply())
				    closeDialog();
			}
		});
		bottomButtonPanel.setHorizontalAlignment(HasHorizontalAlignment.ALIGN_RIGHT);
		bottomButtonPanel.add(cancelButton = new Button(Locale.LS("Cancel")));
		cancelButton.addClickHandler(new ClickHandler() {
			public void onClick(ClickEvent event) {
				closeDialog();
			}
		});

		buildDialog();

		errorLabel = new Label();
		errorLabel.getElement().getStyle().setColor("red");
		errorLabel.setVisible(false);
		mainPanel.insert(errorLabel, mainPanel.getWidgetIndex(bottomButtonPanel));
		this.center();
		if (firstTextBox != null) {
		    final TextBox ftb = firstTextBox;
		    Scheduler.get().scheduleDeferred(new Scheduler.ScheduledCommand() {
			public void execute() {
			    ftb.setFocus(true);
			    ftb.selectAll();
			}
		    });
		}
	}
	
	void buildDialog() {
		int i;
		HorizontalPanel hp = new HorizontalPanel();
		VerticalPanel vp = new VerticalPanel();
		mainPanel.insert(hp, mainPanel.getWidgetIndex(bottomButtonPanel));
		hp.add(vp);
		boolean first = true;
		for (i = 0; ; i++) {
			Label l = null;
			einfos[i] = elm.getEditInfo(i);
			if (einfos[i] == null)
				break;
			final EditInfo ei = einfos[i];

			if (vp.getWidgetCount() > 15 || ei.newColumn) {
			    // start a new column
			    vp = new VerticalPanel();
			    hp.add(vp);
			    vp.getElement().getStyle().setPaddingLeft(10, Unit.PX);
			    first = true;
			}

			String name = Locale.LS(ei.name);
			if (ei.name.startsWith("<"))
			    vp.add(l = new HTML(name));
			else
			    vp.add(l = new Label(name));
			if (!first && l != null)
				l.setStyleName("topSpace");
			first = false;
			if (ei.choice != null) {
				vp.add(ei.choice);
				ei.choice.addChangeHandler( new ChangeHandler() {
					public void onChange(ChangeEvent e){
						itemStateChanged(e);
					}
				});
			} else if (ei.checkbox != null) {
				vp.add(ei.checkbox);
				ei.checkbox.addValueChangeHandler( new ValueChangeHandler<Boolean>() {
					public void onValueChange(ValueChangeEvent<Boolean> e){
						itemStateChanged(e);
					}
				});
			} else if (ei.button != null) {
			    vp.add(ei.button);
			    if (ei.loadFile != null) {
			    	//Open file dialog
			    	vp.add(ei.loadFile);
				    ei.button.addClickHandler( new ClickHandler() {
						public void onClick(ClickEvent event) {
					    	ei.loadFile.open();
						}
				    });
			    } else {
			    	//Normal button press
				    ei.button.addClickHandler( new ClickHandler() {
						public void onClick(ClickEvent event) {
						    itemStateChanged(event);
						}
				    });
			    }
			} else if (ei.textArea != null) {
			    vp.add(ei.textArea);
			    closeOnEnter = false;
			} else if (ei.widget != null) {
			    vp.add(ei.widget);
			} else {
			    ei.textf = new TextBox();
			    if (firstTextBox == null)
				firstTextBox = ei.textf;
			    if (ei.text != null) {
				ei.textf.setText(ei.text);
				if (ei.isColor)
				    ei.textf.getElement().setAttribute("type", "color");
				else
				    ei.textf.setVisibleLength(50);
				vp.add(ei.textf);
			    } else {
				ei.textf.setText(unitString(ei));
				vp.add(makeValueStepperRow(ei));
			    }
			}
		}
		einfocount = i;
	}

	// A text field with "-"/"+" buttons that step the value, so it can be tweaked without
	// having to type on a mobile keyboard. Component values (R/L/C, etc.) step through the
	// E12 preferred-value series (reusing the same table ScrollValuePopup uses for its
	// scroll-to-adjust popup); dimensionless fields and voltage sources, which don't really
	// have a "preferred value" series, just step by 1. Holding a button down repeats the step.
	private HorizontalPanel makeValueStepperRow(final EditInfo ei) {
	    HorizontalPanel row = new HorizontalPanel();
	    row.setVerticalAlignment(HasVerticalAlignment.ALIGN_MIDDLE);
	    Button minus = new Button("−");
	    Button plus = new Button("+");
	    minus.setWidth("2em");
	    plus.setWidth("2em");
	    // without this, holding the button down on iOS is treated as a long-press on
	    // selectable text and pops up the Copy/Look Up/etc. callout instead of repeating
	    disableTouchCallout(minus);
	    disableTouchCallout(plus);
	    addRepeatingStepHandler(minus, ei, -1);
	    addRepeatingStepHandler(plus, ei, 1);
	    row.add(minus);
	    row.add(ei.textf);
	    row.add(plus);
	    return row;
	}

	private static void disableTouchCallout(Button button) {
	    com.google.gwt.dom.client.Style style = button.getElement().getStyle();
	    style.setProperty("webkitTouchCallout", "none");
	    style.setProperty("webkitUserSelect", "none");
	    style.setProperty("userSelect", "none");
	    style.setProperty("touchAction", "manipulation");
	}

	// step once immediately on mouse/touch-down, then keep stepping at a fixed rate for as
	// long as the button is held, like a native stepper control
	private void addRepeatingStepHandler(Button button, final EditInfo ei, final int dir) {
	    final Timer repeatTimer = new Timer() {
		public void run() { stepValue(ei, dir); }
	    };
	    final Timer startRepeatTimer = new Timer() {
		public void run() { repeatTimer.scheduleRepeating(120); }
	    };
	    button.addMouseDownHandler(new MouseDownHandler() {
		public void onMouseDown(MouseDownEvent e) {
		    stepValue(ei, dir);
		    startRepeatTimer.schedule(400);
		}
	    });
	    MouseUpHandler stop = new MouseUpHandler() {
		public void onMouseUp(MouseUpEvent e) {
		    startRepeatTimer.cancel();
		    repeatTimer.cancel();
		}
	    };
	    button.addMouseUpHandler(stop);
	    button.addMouseOutHandler(new MouseOutHandler() {
		public void onMouseOut(MouseOutEvent e) {
		    startRepeatTimer.cancel();
		    repeatTimer.cancel();
		}
	    });

	    // On touch devices, mousedown/mouseup are synthesized from touchstart/touchend, but
	    // only *after* touchend has already fired - so a mousedown-based repeat never gets a
	    // chance to run while the finger is actually held down. Handle real touch events
	    // directly instead, and preventDefault() on touchstart so the browser doesn't also
	    // fire the (now redundant, badly-timed) synthetic mouse events afterward.
	    button.addDomHandler(new TouchStartHandler() {
		public void onTouchStart(TouchStartEvent e) {
		    e.preventDefault();
		    stepValue(ei, dir);
		    startRepeatTimer.schedule(400);
		}
	    }, TouchStartEvent.getType());
	    TouchEndHandler touchStop = new TouchEndHandler() {
		public void onTouchEnd(TouchEndEvent e) {
		    startRepeatTimer.cancel();
		    repeatTimer.cancel();
		}
	    };
	    button.addDomHandler(touchStop, TouchEndEvent.getType());
	    button.addDomHandler(new TouchCancelHandler() {
		public void onTouchCancel(TouchCancelEvent e) {
		    startRepeatTimer.cancel();
		    repeatTimer.cancel();
		}
	    }, TouchCancelEvent.getType());
	}

	void stepValue(EditInfo ei, int dir) {
	    double cur;
	    try {
		cur = parseUnits(ei);
	    } catch (Exception ex) {
		cur = ei.value;
	    }
	    boolean linearStep = ei.dimensionless || ei.unitStep;
	    double next = linearStep ? cur + dir : stepE12(cur, dir);
	    // just update the displayed text, like typing a new value would; actually committing
	    // it to the element happens on Apply/OK like normal, so Cancel still works correctly
	    ei.textf.setText(unitString(ei, next));
	}

	// step to the next/previous value (in direction dir) in the E12 preferred-value series,
	// which repeats every decade; preserves sign, and treats 0 as just below the first step
	static double stepE12(double value, int dir) {
	    double[] e12 = ScrollValuePopup.e12;
	    if (value == 0)
		return dir > 0 ? e12[0] : -e12[0];
	    double sign = value < 0 ? -1 : 1;
	    double av = Math.abs(value);
	    int decade = (int) Math.floor(Math.log10(av));
	    int idx = 0;
	    for (int i = 0; i < e12.length; i++) {
		if (e12[i] * Math.pow(10, decade) <= av * 1.0000001)
		    idx = i;
	    }
	    idx += dir;
	    if (idx < 0) {
		idx = e12.length - 1;
		decade--;
	    } else if (idx >= e12.length) {
		idx = 0;
		decade++;
	    }
	    return sign * e12[idx] * Math.pow(10, decade);
	}

	static final double ROOT2 = 1.41421356237309504880;

	String unitString(EditInfo ei) {
	    // for voltage elements, express values in rms if that would be shorter
	    if (elm != null && elm instanceof VoltageElm) {
		VoltageElm ve = (VoltageElm) elm;
		if (ve.useRmsDisplay(ei.value))
		    return unitString(ei, ei.value * ve.getRmsMultiplier()) + "rms";
	    }
	    return unitString(ei, ei.value);
	}

	static String unitString(EditInfo ei, double v) {
		double va = Math.abs(v);
		if (ei != null && ei.dimensionless)
			return noCommaFormat.format(v);
		if (Double.isInfinite(va))
			return noCommaFormat.format(v);
		if (v == 0) return "0";
		if (va < 1e-12)
			return noCommaFormat.format(v*1e15) + "f";
		if (va < 1e-9)
			return noCommaFormat.format(v*1e12) + "p";
		if (va < 1e-6)
			return noCommaFormat.format(v*1e9) + "n";
		if (va < 1e-3)
			return noCommaFormat.format(v*1e6) + "u";
		if (va < 1 /*&& !ei.forceLargeM*/)
			return noCommaFormat.format(v*1e3) + "m";
		if (va < 1e3)
			return noCommaFormat.format(v);
		if (va < 1e6)
			return noCommaFormat.format(v*1e-3) + "k";
		if (va < 1e9)
			return noCommaFormat.format(v*1e-6) + "M";
		return noCommaFormat.format(v*1e-9) + "G";
	}

	double parseUnits(EditInfo ei) throws java.text.ParseException {
		String s = ei.textf.getText().trim();
		// for voltage elements, convert rms input using waveform-specific multiplier
		if (elm != null && elm instanceof VoltageElm && s.endsWith("rms")) {
		    s = s.substring(0, s.length()-3).trim();
		    double rmsMult = ((VoltageElm)elm).getRmsMultiplier();
		    if (rmsMult > 0) {
			// parseUnits will not see "rms" suffix, so no double-conversion
			return parseUnits(s) / rmsMult;
		    }
		}
		return parseUnits(s);
	}
	
	static double parseUnits(String s) throws java.text.ParseException {
		s = s.trim();
		double rmsMult = 1;
		if (s.endsWith("rms")) {
		    s = s.substring(0, s.length()-3).trim();
		    rmsMult = ROOT2;
		}
		// rewrite shorthand (eg "2k2") in to normal format (eg 2.2k) using regex
		s=s.replaceAll("([0-9]+)([pPnNuUmMkKgG])([0-9]+)", "$1.$3$2");
		// rewrite meg to M
		s=s.replaceAll("[mM][eE][gG]$", "M");

		// handle scientific notation (e.g. "4.416e-8", "1.2E+3", "5e9")
		// before checking for unit suffixes, so that "e" is not
		// misinterpreted and the value is not silently rejected
		if (s.matches("^-?[0-9]*\\.?[0-9]+[eE][+-]?[0-9]+$"))
		    return Double.parseDouble(s) * rmsMult;

		int len = s.length();
		char uc = s.charAt(len-1);
		double mult = 1;
		switch (uc) {
		case 'f': case 'F': mult = 1e-15; break;
		case 'p': case 'P': mult = 1e-12; break;
		case 'n': case 'N': mult = 1e-9; break;
		case 'u': case 'U': mult = 1e-6; break;

		// for ohm values, we used to assume mega for lowercase m, otherwise milli
		case 'm': mult = /*(ei.forceLargeM) ? 1e6 : */ 1e-3; break;

		case 'k': case 'K': mult = 1e3; break;
		case 'M': mult = 1e6; break;
		case 'G': case 'g': mult = 1e9; break;
		}
		if (mult != 1)
			s = s.substring(0, len-1).trim();
		return noCommaFormat.parse(s) * mult * rmsMult;
	}

	boolean apply() {
		int i;
		for (i = 0; i != einfocount; i++) {
			EditInfo ei = einfos[i];
			ei.error = null;
			if (ei.textf!=null && ei.text==null) {
				try {
					double d = parseUnits(ei);
					ei.value = d;
				} catch (Exception ex) { /* ignored */ }
			}
			if (ei.positive && ei.value <= 0) {
			    ei.setError("must be > 0");
			}
			if (ei.nonNegative && ei.value < 0) {
			    ei.setError("must be >= 0");
			}
			// don't press buttons.  also don't operate on choices becuase then they might happen
			// twice.  (for square wave)
			if (ei.button != null || ei.choice != null)
			    continue;
			if (ei.error == null)
			    elm.setEditValue(i, ei);
			if (ei.error != null) {
			    String msg = ei.error;
			    String field = ei.errorFieldName != null ? ei.errorFieldName : ei.name;
			    if (field != null && field.length() > 0)
				msg = field + ": " + msg;
			    errorLabel.setText(msg);
			    errorLabel.setVisible(true);
			    return false;
			}

			// update slider if any
			if (elm instanceof CircuitElm) {
			    Adjustable adj = cframe.findAdjustable((CircuitElm)elm, i);
			    if (adj != null)
				adj.setSliderValue(ei.value);
			}

			// this row's change means the dialog's row layout is stale and about to be
			// rebuilt (see itemStateChanged) - stop here instead of continuing to apply
			// values to the remaining einfos, whose indices may no longer mean what they
			// used to under the rebuilt layout
			if (ei.newDialog)
			    break;
		}
		errorLabel.setVisible(false);
		cframe.needAnalyze();
		return true;
	}

	public void itemStateChanged(GwtEvent e) {
	    Object src = e.getSource();
	    int i;
	    boolean changed = false;
	    boolean applied = false;
	    for (i = 0; i != einfocount; i++) {
		EditInfo ei = einfos[i];
		if (ei.choice == src || ei.checkbox == src || ei.button == src) {
		    
		    // if we're pressing a button, make sure to apply changes first.
		    // also for choices (for square wave)
		    if ((ei.button == src || ei.choice == src) && !ei.newDialog) {
			apply();
			applied = true;
		    }
		    
		    elm.setEditValue(i, ei);
		    if (ei.newDialog)
			changed = true;
		    cframe.needAnalyze();
		}
	    }
	    if (changed) {
		// apply changes before we reset everything
		// (need to check if we already applied changes; otherwise Diode create simple model button doesn't work)
		if (!applied)
		    apply();
		
		clearDialog();
		buildDialog();
	    }
	}
	
	public void resetDialog() {
	    clearDialog();
	    buildDialog();
	}
	
	public void clearDialog() {
		while (mainPanel.getWidget(0)!=bottomButtonPanel)
			mainPanel.remove(0);
	}
	
	public void closeDialog()
	{
		super.closeDialog();
		if (CirSim.editDialog == this)
		    CirSim.editDialog = null;
		if (CirSim.customLogicEditDialog == this)
		    CirSim.customLogicEditDialog = null;
	}
}

