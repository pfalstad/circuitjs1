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

import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.Vector;
import java.util.HashSet;
import com.google.gwt.user.client.ui.HasHorizontalAlignment;
import com.google.gwt.user.client.ui.HorizontalPanel;
import com.google.gwt.user.client.Window;
import com.google.gwt.user.client.ui.Anchor;
import com.google.gwt.user.client.ui.Button;
import com.google.gwt.user.client.ui.VerticalPanel;
import com.lushprojects.circuitjs1.client.ChipElm.Pin;
import com.lushprojects.circuitjs1.client.util.Locale;
import com.google.gwt.event.dom.client.ClickHandler;
import com.google.gwt.event.dom.client.MouseDownEvent;
import com.google.gwt.event.dom.client.MouseDownHandler;
import com.google.gwt.event.dom.client.MouseMoveEvent;
import com.google.gwt.event.dom.client.MouseMoveHandler;
import com.google.gwt.event.dom.client.MouseOutEvent;
import com.google.gwt.event.dom.client.MouseOutHandler;
import com.google.gwt.event.dom.client.MouseOverEvent;
import com.google.gwt.event.dom.client.MouseOverHandler;
import com.google.gwt.event.dom.client.MouseUpEvent;
import com.google.gwt.event.dom.client.MouseUpHandler;
import com.google.gwt.event.logical.shared.ValueChangeEvent;
import com.google.gwt.event.logical.shared.ValueChangeHandler;
import com.google.gwt.canvas.client.Canvas;
import com.google.gwt.canvas.dom.client.Context2d;
import com.google.gwt.event.dom.client.ClickEvent;
import com.google.gwt.user.client.ui.Label;
import com.google.gwt.user.client.ui.TextBox;

public class EditCompositeModelDialog extends Dialog implements MouseDownHandler, MouseMoveHandler, MouseUpHandler, MouseOutHandler, MouseOverHandler {
	
	VerticalPanel vp;
	boolean error;
	CustomCompositeChipElm chip;
	int postCount;
	Context2d context;
	CustomCompositeModel model;
	
	boolean popContext;

	void setModel(CustomCompositeModel m) { model = m; }
	
        boolean createModel() {
            HashSet<Integer> nodeSet = new HashSet<Integer>();
            model = SimulationManager.theSim.getCircuitAsComposite();
            if (model == null)
        	return false;
            if (model.extList.size() == 0) {
        	Window.alert(Locale.LS("Device has no external inputs/outputs!"));
        	return false;
            }
            Collections.sort(model.extList, new Comparator<ExtListEntry>() {
        	public int compare(ExtListEntry a, ExtListEntry b) {
        	    return a.name.toLowerCase().compareTo(b.name.toLowerCase());
        	}
            });
            int i;
            int postCount = model.extList.size();
            int sideCounts[] = new int[] { 0, 0, 0, 0 };
            for (i = 0; i != postCount; i++) {
        	ExtListEntry pin = model.extList.get(i);
                sideCounts[pin.side] += 1;

        	if (nodeSet.contains(pin.node)) {
        	    Window.alert(Locale.LS("Can't have two input/output nodes connected!"));
        	    return false;
        	}
        	nodeSet.add(pin.node);
            }

            int xOffsetLeft = (sideCounts[ChipElm.SIDE_W] > 0) ? 1 : 0;
            int xOffsetRight = (sideCounts[ChipElm.SIDE_E] > 0) ? 1 : 0;
            for (i = 0; i != postCount; i++) {
                ExtListEntry pin = model.extList.get(i);
                if (pin.side == ChipElm.SIDE_N || pin.side == ChipElm.SIDE_S) {
                    pin.pos += xOffsetLeft;
                }
            }

            int minHeight = (sideCounts[ChipElm.SIDE_N] > 0 && sideCounts[ChipElm.SIDE_S] > 0) ? 2 : 1;
            int minWidth = 2;
            int pinsNS = Math.max(sideCounts[ChipElm.SIDE_N], sideCounts[ChipElm.SIDE_S]);
            int pinsWE = Math.max(sideCounts[ChipElm.SIDE_W], sideCounts[ChipElm.SIDE_E]);
            model.sizeX = Math.max(minWidth, pinsNS + xOffsetLeft + xOffsetRight);
            model.sizeY = Math.max(minHeight, pinsWE);

            //model.modelCircuit = CirSim.theApp.dumpCircuit();
            return true;
        }
        
	public EditCompositeModelDialog() {
		super();
		closeOnEnter = true;
	}
	
	TextBox modelNameTextBox = null;
	Choice scopeChoice = null;
	Checkbox labelCheck = null;
	public String defaultName;

	// load an externally-built model (e.g. from SPICE import)
	boolean loadModel(CustomCompositeModel m) {
	    model = m;
	    if (model.extList.size() == 0) {
		Window.alert(Locale.LS("Device has no external inputs/outputs!"));
		return false;
	    }
	    HashSet<Integer> nodeSet = new HashSet<Integer>();
	    Collections.sort(model.extList, new Comparator<ExtListEntry>() {
		public int compare(ExtListEntry a, ExtListEntry b) {
		    return a.name.toLowerCase().compareTo(b.name.toLowerCase());
		}
	    });
	    int i;
	    int postCount = model.extList.size();
	    int sideCounts[] = new int[] { 0, 0, 0, 0 };
	    for (i = 0; i != postCount; i++) {
		ExtListEntry pin = model.extList.get(i);
		sideCounts[pin.side] += 1;
		if (nodeSet.contains(pin.node)) {
		    Window.alert(Locale.LS("Can't have two input/output nodes connected!"));
		    return false;
		}
		nodeSet.add(pin.node);
	    }
	    int xOffsetLeft = (sideCounts[ChipElm.SIDE_W] > 0) ? 1 : 0;
	    int xOffsetRight = (sideCounts[ChipElm.SIDE_E] > 0) ? 1 : 0;
	    for (i = 0; i != postCount; i++) {
		ExtListEntry pin = model.extList.get(i);
		if (pin.side == ChipElm.SIDE_N || pin.side == ChipElm.SIDE_S) {
		    pin.pos += xOffsetLeft;
		}
	    }
	    int minHeight = (sideCounts[ChipElm.SIDE_N] > 0 && sideCounts[ChipElm.SIDE_S] > 0) ? 2 : 1;
	    int minWidth = 2;
	    int pinsNS = Math.max(sideCounts[ChipElm.SIDE_N], sideCounts[ChipElm.SIDE_S]);
	    int pinsWE = Math.max(sideCounts[ChipElm.SIDE_W], sideCounts[ChipElm.SIDE_E]);
	    model.sizeX = Math.max(minWidth, pinsNS + xOffsetLeft + xOffsetRight);
	    model.sizeY = Math.max(minHeight, pinsWE);
	    return true;
	}

	static final int SCOPE_THIS_CIRCUIT = 0;
	static final int SCOPE_THIS_SESSION = 1;
	static final int SCOPE_SAVE_ACROSS_SESSIONS = 2;

	void createDialog() {
		Button okButton;
		Anchor a;
		vp=new VerticalPanel();
		setWidget(vp);
		setText(Locale.LS("Edit Subcircuit Pin Layout"));
		vp.add(new Label(Locale.LS("Drag the pins to the desired position")));
		Date date = new Date();

		Canvas canvas = Canvas.createIfSupported();
		canvas.setWidth("400 px");
		canvas.setHeight("400 px");
		canvas.setCoordinateSpaceWidth(400);
		canvas.setCoordinateSpaceHeight(400);
		vp.add(canvas);
		MouseManager.doTouchHandlers(null, canvas.getCanvasElement());
		context = canvas.getContext2d();
		
		chip = new CustomCompositeChipElm(50, 50);
		chip.x2 = 200;
		chip.y2 = 50;
		selectedPin = -1;
		createPinsFromModel();
		
		if (model.name == null) {
		    vp.add(new Label(Locale.LS("Model Name")));
		    modelNameTextBox = new TextBox();
		    vp.add(modelNameTextBox);
		    if (defaultName != null)
			modelNameTextBox.setText(defaultName);
		    modelNameTextBox.addValueChangeHandler(new ValueChangeHandler<String>() {
			@Override
			public void onValueChange(ValueChangeEvent<String> event) {
			    drawChip();
			}
		    });
		}
		
		HorizontalPanel hp = new HorizontalPanel();
		hp.setVerticalAlignment(com.google.gwt.user.client.ui.HasVerticalAlignment.ALIGN_MIDDLE);
		Label widthLabel = new Label(Locale.LS("Width"));
		widthLabel.getElement().getStyle().setMarginRight(6, com.google.gwt.dom.client.Style.Unit.PX);
		hp.add(widthLabel);
		Button b;
		hp.add(b = new Button("+"));
		b.addClickHandler(new ClickHandler() {
                    public void onClick(ClickEvent event) {
                	adjustChipSize(1, 0);
                    }
                });
		hp.add(b = new Button("-"));
		b.getElement().getStyle().setMarginRight(10, com.google.gwt.dom.client.Style.Unit.PX);
		b.addClickHandler(new ClickHandler() {
                    public void onClick(ClickEvent event) {
                	adjustChipSize(-1, 0);
                    }
                });
		Label heightLabel = new Label(Locale.LS("Height"));
		heightLabel.getElement().getStyle().setMarginRight(6, com.google.gwt.dom.client.Style.Unit.PX);
		hp.add(heightLabel);
		hp.add(b = new Button("+"));
		b.addClickHandler(new ClickHandler() {
                    public void onClick(ClickEvent event) {
                	adjustChipSize(0, 1);
                    }
                });
		hp.add(b = new Button("-"));
		b.addClickHandler(new ClickHandler() {
                    public void onClick(ClickEvent event) {
                	adjustChipSize(0, -1);
                    }
                });
		vp.add(hp);
		hp.addStyleName("topSpace");
		vp.add(labelCheck = new Checkbox(Locale.LS("Show Label")));
		labelCheck.setState(model.showLabel());
		labelCheck.addClickHandler(new ClickHandler() {
		    public void onClick(ClickEvent event) {
			model.setShowLabel(labelCheck.getValue());
			drawChip();
		    }
		});
		HorizontalPanel scopePanel = new HorizontalPanel();
		scopePanel.setVerticalAlignment(com.google.gwt.user.client.ui.HasVerticalAlignment.ALIGN_MIDDLE);
		scopePanel.addStyleName("topSpace");
		Label scopeLabel = new Label(Locale.LS("Scope:"));
		scopeLabel.getElement().getStyle().setMarginRight(8, com.google.gwt.dom.client.Style.Unit.PX);
		scopePanel.add(scopeLabel);
		scopeChoice = new Choice();
		scopeChoice.add(Locale.LS("This Circuit"));
		scopeChoice.add(Locale.LS("This Session"));
		scopeChoice.add(Locale.LS("Save Across Sessions"));
		if (model.isSaved())
		    scopeChoice.select(SCOPE_SAVE_ACROSS_SESSIONS);
		else if (model.name != null && CustomCompositeModel.globalModelMap.containsKey(model.name))
		    scopeChoice.select(SCOPE_THIS_SESSION);
		else
		    scopeChoice.select(SCOPE_THIS_CIRCUIT);
		scopePanel.add(scopeChoice);
		vp.add(scopePanel);
	
                canvas.addMouseDownHandler(this);
                canvas.addMouseUpHandler(this);
                canvas.addMouseMoveHandler(this);
                canvas.addMouseOutHandler(this);
                canvas.addMouseOverHandler(this);

                hp = new HorizontalPanel();
                hp.setWidth("100%");
                hp.setHorizontalAlignment(HasHorizontalAlignment.ALIGN_LEFT);
                hp.setStyleName("topSpace");
                vp.add(hp);
                hp.add(okButton = new Button(Locale.LS("OK")));
                hp.setHorizontalAlignment(HasHorizontalAlignment.ALIGN_RIGHT);
                Button cancelButton;
		if (model.name == null) {
		    hp.add(cancelButton = new Button(Locale.LS("Cancel")));
		    cancelButton.addClickHandler(new ClickHandler() {
			public void onClick(ClickEvent event) {
			    closeDialog();
			}
		    });
		}
		okButton.addClickHandler(new ClickHandler() {
			public void onClick(ClickEvent event) {
			    enterPressed();
			}
		});
		this.center();
	}
	
	void createPinsFromModel() {
	    postCount = model.extList.size();
	    chip.allocPins(postCount);
	    chip.sizeX = model.sizeX;
	    chip.sizeY = model.sizeY;
	    for (int i = 0; i != postCount; i++) {
		ExtListEntry pin = model.extList.get(i);
		chip.setPin(i, pin.pos, pin.side, pin.name);
		chip.volts[i] = 0;
		if (i == selectedPin)
		    chip.pins[i].selected = true;
	    }
	    chip.setPoints();
	}
	
	public void enterPressed() {
	    if (modelNameTextBox != null) {
		String name = modelNameTextBox.getText();
		if (name.length() == 0) {
		    Window.alert(Locale.LS("Please enter a model name."));
		    return;
		}
		model.setName(CustomCompositeElm.lastModelName = name);
	    }
	    int scope = scopeChoice.getSelectedIndex();
	    // remove from old locations first
	    CustomCompositeModel.localModelMap.remove(model.name);
	    CustomCompositeModel.globalModelMap.remove(model.name);
	    model.setSaved(false); // remove from storage
	    if (scope == SCOPE_THIS_CIRCUIT) {
		CustomCompositeModel.localModelMap.put(model.name, model);
	    } else if (scope == SCOPE_THIS_SESSION) {
		CustomCompositeModel.globalModelMap.put(model.name, model);
	    } else {
		model.setSaved(true); // puts in global map + storage
	    }
	    CirSim.theApp.updateModels();
	    CirSim.theApp.needAnalyze(); // will get singular matrix if we don't do this
	    if (!popContext && !CirSim.theApp.contextStack.isEmpty()) {
		// record this model change so it survives when the parent context pops
		CirSim.theApp.contextStack.lastElement().changedModels.add(model);
	    }
	    if (popContext) {
		// Save the new model, pop context (which reloads old circuit with old models),
		// then swap the new model back in.  Also carry forward any models changed at
		// deeper levels so they aren't lost when the parent context pops.
		CirSim app = CirSim.theApp;
		CustomCompositeModel savedModel = model;
		Vector<CustomCompositeModel> changedModels = app.popContextAndGetChangedModels();
		changedModels.add(savedModel);
		for (CustomCompositeModel m : changedModels) {
		    CustomCompositeModel.replaceModel(m);
		    app.refreshModels(m.name);
		}
		// if still in a context, carry forward all changed models to the parent
		if (!app.contextStack.isEmpty())
		    app.contextStack.lastElement().changedModels.addAll(changedModels);
	    }
	    closeDialog();
	}

	double scale;
	
	void drawChip() {
	    Graphics g = new Graphics(context);
	    double scalew = context.getCanvas().getWidth()  / (double)(chip.boundingBox.width + chip.boundingBox.x*2);
	    double scaleh = context.getCanvas().getHeight() / (double)(chip.boundingBox.height + chip.boundingBox.y*2);
	    scale = 1/Math.min(scalew, scaleh);
	    context.setFillStyle(CirSim.theApp.getBackgroundColor().getHexValue());
		context.setTransform(1, 0, 0, 1, 0, 0);
	    context.fillRect(0, 0, context.getCanvas().getWidth(), context.getCanvas().getHeight());
	    context.setTransform(1/scale, 0, 0, 1/scale, 0, 0);
	    chip.setLabel(!labelCheck.getValue() ? null : (modelNameTextBox != null) ? modelNameTextBox.getText() : model.name);
	    chip.draw(g);
	}
	
	void adjustChipSize(int dx, int dy) {
	    if (dx < 0 || dy < 0) {
		for (int i = 0; i != postCount; i++) {
		    Pin p = chip.pins[i];
		    if (dx < 0 && (p.side == ChipElm.SIDE_N || p.side == ChipElm.SIDE_S) && p.pos >= chip.sizeX+dx)
			return;
		    if (dy < 0 && (p.side == ChipElm.SIDE_E || p.side == ChipElm.SIDE_W) && p.pos >= chip.sizeY+dy)
			return;
		}
	    }
	    if (chip.sizeX + dx < 1 || chip.sizeY + dy < 1)
		return;
	    model.sizeX += dx;
	    model.sizeY += dy;
	    createPinsFromModel();
	    drawChip();
	}
	
	boolean dragging;
	
	public void onMouseOver(MouseOverEvent event) {
	    // TODO Auto-generated method stub
	    
	}

	public void onMouseOut(MouseOutEvent event) {
	    // TODO Auto-generated method stub
	    
	}

	public void onMouseUp(MouseUpEvent event) {
	    dragging = false;
	}

	int selectedPin;
	
	public void onMouseMove(MouseMoveEvent event) {
	    mouseMoved(event.getX(), event.getY());
	}
	
	void mouseMoved(int x, int y) {
	    if (dragging) {
		if (selectedPin < 0)
		    return;
		int pos[] = new int[2];
		if (!chip.getPinPos((int)(x*scale), (int)(y*scale), selectedPin, pos))
		    return;
		ExtListEntry p = model.extList.get(selectedPin);
		int pn = chip.getOverlappingPin(pos[0], pos[1], selectedPin);
		if (pn != -1) {
		    // swap positions with overlapping pin
		    ExtListEntry p2 = model.extList.get(pn);
		    p2.pos = p.pos;
		    p2.side = p.side;
		}
		p.pos  = pos[0];
		p.side = pos[1];
		createPinsFromModel();
		drawChip();
	    } else {
		int i;
		double bestdist = 20;
		selectedPin = -1;
		for (i = 0; i != postCount; i++) {
		    Pin p = chip.pins[i];
		    int dx = (int)(x*scale) - p.textloc.x;
		    int dy = (int)(y*scale) - p.textloc.y;
		    double dist = Math.hypot(dx, dy);
		    if (dist < bestdist) {
			bestdist = dist;
			selectedPin = i;
		    }
		    p.selected = false;
		}
		if (selectedPin >= 0)
		    chip.pins[selectedPin].selected = true;
		drawChip();
	    }
	}

	public void onMouseDown(MouseDownEvent event) {
	    mouseMoved(event.getX(), event.getY());
	    dragging = true;
	}

	public void show() {
	    super.show();
	    drawChip();
	}
}
