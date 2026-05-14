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
		// only count first pin of each bus group for layout
		if (pin.busZ == 0)
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
		    modelNameTextBox.addValueChangeHandler(new ValueChangeHandler<String>() {
			@Override
			public void onValueChange(ValueChangeEvent<String> event) {
			    drawChip();
			}
		    });
//		    modelNameTextBox.setText(model.name);
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
		chip.pins[i].busWidth = pin.busWidth;
		chip.pins[i].busZ = pin.busZ;
		chip.volts[i] = 0;
		if (selectedPins.contains(i))
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
	    if (dx < 0) {
		for (int i = 0; i != postCount; i++) {
		    Pin p = chip.pins[i];
		    if (p.busZ > 0) continue;
		    if ((p.side == ChipElm.SIDE_N || p.side == ChipElm.SIDE_S) && p.pos >= chip.sizeX+dx)
			return;
		}
	    }
	    if (dy < 0) {
		boolean needShift = false;
		for (int i = 0; i != postCount; i++) {
		    Pin p = chip.pins[i];
		    if (p.busZ > 0) continue;
		    if ((p.side == ChipElm.SIDE_E || p.side == ChipElm.SIDE_W) && p.pos >= chip.sizeY+dy) {
			needShift = true;
			break;
		    }
		}
		if (needShift) {
		    // check if there's room at the top (no side pins at pos 0)
		    for (int i = 0; i != postCount; i++) {
			Pin p = chip.pins[i];
			if (p.busZ > 0) continue;
			if ((p.side == ChipElm.SIDE_E || p.side == ChipElm.SIDE_W) && p.pos == 0)
			    return;
		    }
		    // shift all side pins up by 1 to use the room at the top
		    for (int i = 0; i != postCount; i++) {
			ExtListEntry pe = model.extList.get(i);
			if (pe.side == ChipElm.SIDE_E || pe.side == ChipElm.SIDE_W)
			    pe.pos -= 1;
		    }
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
	boolean rubberBand;
	int rubberBandX1, rubberBandY1, rubberBandX2, rubberBandY2;
	HashSet<Integer> selectedPins = new HashSet<Integer>();
	int[] dragStartPosArr;
	int[] dragStartSideArr;
	int dragStartPos, dragStartSide, dragCurrentSide;

	int findNearestPin(int x, int y) {
	    double bestdist = 20;
	    int best = -1;
	    for (int i = 0; i != postCount; i++) {
		Pin p = chip.pins[i];
		if (p.busZ > 0) continue;
		int dx = (int)(x*scale) - p.textloc.x;
		int dy = (int)(y*scale) - p.textloc.y;
		double dist = Math.hypot(dx, dy);
		if (dist < bestdist) {
		    bestdist = dist;
		    best = i;
		}
	    }
	    return best;
	}

	void updatePinHighlight() {
	    for (int i = 0; i != postCount; i++)
		chip.pins[i].selected = selectedPins.contains(i);
	}

	void drawRubberBand() {
	    int x1 = Math.min(rubberBandX1, rubberBandX2);
	    int y1 = Math.min(rubberBandY1, rubberBandY2);
	    int w  = Math.abs(rubberBandX2 - rubberBandX1);
	    int h  = Math.abs(rubberBandY2 - rubberBandY1);
	    context.save();
	    context.setTransform(1, 0, 0, 1, 0, 0);
	    context.setFillStyle("rgba(68,136,255,0.15)");
	    context.fillRect(x1, y1, w, h);
	    context.setStrokeStyle("#4488ff");
	    context.setLineWidth(1);
	    context.strokeRect(x1, y1, w, h);
	    context.restore();
	}

	public void onMouseOver(MouseOverEvent event) {
	    // TODO Auto-generated method stub
	    
	}

	public void onMouseOut(MouseOutEvent event) {
	    // TODO Auto-generated method stub
	    
	}

	public void onMouseUp(MouseUpEvent event) {
	    if (rubberBand) {
		int x1 = Math.min(rubberBandX1, rubberBandX2);
		int x2 = Math.max(rubberBandX1, rubberBandX2);
		int y1 = Math.min(rubberBandY1, rubberBandY2);
		int y2 = Math.max(rubberBandY1, rubberBandY2);
		int selSide = selectedPins.isEmpty() ? -1
			: model.extList.get(selectedPins.iterator().next()).side;
		for (int i = 0; i != postCount; i++) {
		    if (chip.pins[i].busZ > 0) continue;
		    int px = (int)(chip.pins[i].textloc.x / scale);
		    int py = (int)(chip.pins[i].textloc.y / scale);
		    if (px >= x1 && px <= x2 && py >= y1 && py <= y2) {
			if (selSide == -1) selSide = model.extList.get(i).side;
			if (model.extList.get(i).side == selSide) selectedPins.add(i);
		    }
		}
		rubberBand = false;
		updatePinHighlight();
		drawChip();
	    }
	    dragging = false;
	}

	int selectedPin;

	public void onMouseMove(MouseMoveEvent event) {
	    mouseMoved(event.getX(), event.getY());
	}

	void mouseMoved(int x, int y) {
	    if (rubberBand) {
		rubberBandX2 = x;
		rubberBandY2 = y;
		int x1 = Math.min(rubberBandX1, rubberBandX2);
		int x2 = Math.max(rubberBandX1, rubberBandX2);
		int y1 = Math.min(rubberBandY1, rubberBandY2);
		int y2 = Math.max(rubberBandY1, rubberBandY2);
		int selSide2 = selectedPins.isEmpty() ? -1
			: model.extList.get(selectedPins.iterator().next()).side;
		// first pass: find side from rectangle if none yet committed
		if (selSide2 == -1) {
		    for (int i = 0; i != postCount; i++) {
			if (chip.pins[i].busZ > 0) continue;
			int px = (int)(chip.pins[i].textloc.x / scale);
			int py = (int)(chip.pins[i].textloc.y / scale);
			if (px >= x1 && px <= x2 && py >= y1 && py <= y2) {
			    selSide2 = model.extList.get(i).side;
			    break;
			}
		    }
		}
		for (int i = 0; i != postCount; i++) {
		    chip.pins[i].selected = selectedPins.contains(i);
		    if (chip.pins[i].busZ > 0) continue;
		    int px = (int)(chip.pins[i].textloc.x / scale);
		    int py = (int)(chip.pins[i].textloc.y / scale);
		    if (px >= x1 && px <= x2 && py >= y1 && py <= y2
			    && model.extList.get(i).side == selSide2)
			chip.pins[i].selected = true;
		}
		drawChip();
		drawRubberBand();
		return;
	    }
	    if (dragging) {
		if (selectedPin < 0)
		    return;
		int pos[] = new int[2];
		if (!chip.getPinPos((int)(x*scale), (int)(y*scale), dragCurrentSide, pos))
		    return;
		dragCurrentSide = pos[1];
		{
		    // Reset to drag-start snapshot so each call is idempotent
		    for (int i = 0; i < postCount; i++) {
			model.extList.get(i).pos  = dragStartPosArr[i];
			model.extList.get(i).side = dragStartSideArr[i];
		    }
		    int newSide = pos[1];
		    int maxNewPos = (newSide == ChipElm.SIDE_N || newSide == ChipElm.SIDE_S)
			    ? chip.sizeX - 1 : chip.sizeY - 1;
		    int minOff = Integer.MAX_VALUE, maxOff = Integer.MIN_VALUE;
		    int sameSideCount = 0;
		    for (int idx : selectedPins) {
			if (dragStartSideArr[idx] != dragStartSide) continue;
			sameSideCount++;
			int off = dragStartPosArr[idx] - dragStartPos;
			if (off < minOff) minOff = off;
			if (off > maxOff) maxOff = off;
		    }
		    int groupSize = maxOff - minOff + 1;
		    // If the group doesn't fit on the target side, stay on the current side
		    if (groupSize > maxNewPos + 1) {
			newSide = dragStartSide;
			maxNewPos = (newSide == ChipElm.SIDE_N || newSide == ChipElm.SIDE_S)
				? chip.sizeX - 1 : chip.sizeY - 1;
		    }
		    int anchor = Math.max(-minOff, Math.min(maxNewPos - maxOff, pos[0]));
		    int delta = anchor - dragStartPos;
		    boolean sameSide = (newSide == dragStartSide);
		    boolean contiguous = (groupSize == sameSideCount);

		    if (sameSide && contiguous) {
			// Swept-range: every non-selected pin the group sweeps over shifts by groupSize
			// opposite the direction of travel, keeping all positions conflict-free.
			for (int i = 0; i < postCount; i++) {
			    if (selectedPins.contains(i) || chip.pins[i].busZ > 0) continue;
			    if (dragStartSideArr[i] != dragStartSide) continue;
			    int origPos = dragStartPosArr[i];
			    int newPos;
			    if (delta >= 0)
				newPos = (origPos >= dragStartPos + maxOff + 1 && origPos <= anchor + maxOff)
					? origPos - groupSize : origPos;
			    else
				newPos = (origPos >= anchor + minOff && origPos <= dragStartPos + minOff - 1)
					? origPos + groupSize : origPos;
			    if (newPos != origPos) {
				ExtListEntry pj = model.extList.get(i);
				pj.pos = newPos;
				for (int j = 0; j < postCount; j++) {
				    ExtListEntry pjj = model.extList.get(j);
				    if (pjj.name.equals(pj.name) && pjj.busWidth == pj.busWidth)
					pjj.pos = newPos;
				}
			    }
			}
		    } else {
			// Cross-side or non-contiguous: displace only pins at the group's landing slots,
			// pushing them opposite to the direction of travel.
			HashSet<Integer> groupPos = new HashSet<Integer>();
			for (int idx : selectedPins) {
			    if (dragStartSideArr[idx] != dragStartSide) continue;
			    groupPos.add(anchor + dragStartPosArr[idx] - dragStartPos);
			}
			Vector<Integer> displaced = new Vector<Integer>();
			for (int i = 0; i < postCount; i++) {
			    if (selectedPins.contains(i) || chip.pins[i].busZ > 0) continue;
			    if (dragStartSideArr[i] != newSide) continue;
			    if (groupPos.contains(dragStartPosArr[i])) displaced.add(i);
			}
			HashSet<Integer> taken = new HashSet<Integer>();
			for (int i = 0; i < postCount; i++) {
			    if (selectedPins.contains(i) || chip.pins[i].busZ > 0) continue;
			    if (dragStartSideArr[i] == newSide && !groupPos.contains(dragStartPosArr[i]))
				taken.add(dragStartPosArr[i]);
			}
			Vector<Integer> available = new Vector<Integer>();
			for (int slot = 0; slot <= maxNewPos; slot++)
			    if (!groupPos.contains(slot) && !taken.contains(slot)) available.add(slot);
			Collections.sort(displaced, new Comparator<Integer>() {
			    public int compare(Integer a, Integer b) { return dragStartPosArr[a] - dragStartPosArr[b]; }
			});
			Collections.sort(available);
			Vector<Integer> slots = new Vector<Integer>();
			if (delta >= 0) {
			    for (int k = available.size()-1; k >= 0 && slots.size() < displaced.size(); k--)
				if (available.get(k) < anchor) slots.add(available.get(k));
			    for (int k = 0; k < available.size() && slots.size() < displaced.size(); k++)
				if (available.get(k) > anchor + maxOff) slots.add(available.get(k));
			} else {
			    for (int k = 0; k < available.size() && slots.size() < displaced.size(); k++)
				if (available.get(k) > anchor + maxOff) slots.add(available.get(k));
			    for (int k = available.size()-1; k >= 0 && slots.size() < displaced.size(); k--)
				if (available.get(k) < anchor) slots.add(available.get(k));
			}
			Collections.sort(slots);
			for (int k = 0; k < displaced.size() && k < slots.size(); k++) {
			    int newPos = slots.get(k);
			    ExtListEntry pj = model.extList.get(displaced.get(k));
			    pj.pos = newPos;
			    for (int j = 0; j < postCount; j++) {
				ExtListEntry pjj = model.extList.get(j);
				if (pjj.name.equals(pj.name) && pjj.busWidth == pj.busWidth)
				    pjj.pos = newPos;
			    }
			}
		    }
		    // Move selected pins to their new positions
		    for (int idx : selectedPins) {
			if (dragStartSideArr[idx] != dragStartSide) continue;
			int newPos = anchor + dragStartPosArr[idx] - dragStartPos;
			ExtListEntry pj = model.extList.get(idx);
			pj.pos = newPos;  pj.side = newSide;
			for (int j = 0; j < postCount; j++) {
			    ExtListEntry pjj = model.extList.get(j);
			    if (pjj.name.equals(pj.name) && pjj.busWidth == pj.busWidth) {
				pjj.pos = newPos;  pjj.side = newSide;
			    }
			}
		    }
		}
		createPinsFromModel();
		drawChip();
	    } else {
		// hover: highlight nearest pin without disturbing selectedPins
		int hoveredPin = findNearestPin(x, y);
		for (int i = 0; i != postCount; i++)
		    chip.pins[i].selected = selectedPins.contains(i) || i == hoveredPin;
		drawChip();
	    }
	}

	public void onMouseDown(MouseDownEvent event) {
	    int x = event.getX(), y = event.getY();
	    int hoveredPin = findNearestPin(x, y);

	    if (hoveredPin < 0) {
		// empty space: start rubber-band selection
		if (!event.isShiftKeyDown())
		    selectedPins.clear();
		rubberBand = true;
		rubberBandX1 = rubberBandX2 = x;
		rubberBandY1 = rubberBandY2 = y;
		updatePinHighlight();
		drawChip();
		return;
	    }

	    rubberBand = false;
	    if (event.isShiftKeyDown()) {
		if (selectedPins.contains(hoveredPin)) {
		    selectedPins.remove(hoveredPin);
		} else {
		    int hSide = model.extList.get(hoveredPin).side;
		    boolean ok = selectedPins.isEmpty();
		    if (!ok) ok = (model.extList.get(selectedPins.iterator().next()).side == hSide);
		    if (ok) selectedPins.add(hoveredPin);
		}
	    } else {
		// keep existing multi-selection if clicking one of the selected pins
		if (!selectedPins.contains(hoveredPin)) {
		    selectedPins.clear();
		    selectedPins.add(hoveredPin);
		}
	    }
	    selectedPin = hoveredPin;

	    // record per-pin drag-start positions for delta computation
	    dragStartPosArr  = new int[postCount];
	    dragStartSideArr = new int[postCount];
	    for (int i = 0; i < postCount; i++) {
		ExtListEntry pe = model.extList.get(i);
		dragStartPosArr[i]  = pe.pos;
		dragStartSideArr[i] = pe.side;
	    }
	    ExtListEntry sp = model.extList.get(selectedPin);
	    dragStartPos  = sp.pos;
	    dragStartSide = dragCurrentSide = sp.side;

	    updatePinHighlight();
	    dragging = true;
	    drawChip();
	}

	public void show() {
	    super.show();
	    drawChip();
	}
}
