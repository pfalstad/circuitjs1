package com.falstad.afilter.client;

import com.google.gwt.dom.client.NativeEvent;
import com.google.gwt.dom.client.Style;
import com.google.gwt.event.dom.client.ClickEvent;
import com.google.gwt.event.dom.client.ClickHandler;
import com.google.gwt.event.dom.client.MouseOutEvent;
import com.google.gwt.event.dom.client.MouseOverEvent;
import com.google.gwt.user.client.ui.*;

import java.util.HashMap;

public class Toolbar extends FlowPanel {

    private Label modeLabel;
    private HashMap<String, Label> highlightableButtons = new HashMap<>();
    private Label activeButton;  // Currently active button

    Label resistorButton;

    public Toolbar() {
        // Set the overall style of the toolbar
	Style style = getElement().getStyle();
        style.setPadding(2, Style.Unit.PX);
        style.setBackgroundColor("#f8f8f8");
        style.setBorderWidth(1, Style.Unit.PX);
        style.setBorderStyle(Style.BorderStyle.SOLID);
        style.setBorderColor("#ccc");
        style.setDisplay(Style.Display.FLEX);
	style.setProperty("alignItems", "center");

	add(createIconButton("reply",   "Undo", new MyCommand("edit", "undo")));
	add(createIconButton("forward", "Redo", new MyCommand("edit", "redo")));
	add(createIconButton("scissors", "Cut", new MyCommand("edit", "cut")));
	add(createIconButton("copy", "Copy", new MyCommand("edit", "copy")));
	add(createIconButton("paste", "Paste", new MyCommand("edit", "paste")));
	add(createIconButton("clone", "Duplicate", new MyCommand("edit", "duplicate")));
	add(createIconButton("search", "Find Component...", new MyCommand("edit", "search")));

	add(createIconButton("zoom-11", "Zoom 100%", new MyCommand("zoom", "zoom100")));
	add(createIconButton("zoom-in", "Zoom In", new MyCommand("zoom", "zoomin")));
	add(createIconButton("zoom-out", "Zoom Out", new MyCommand("zoom", "zoomout")));

	add(createIconButton(wireIcon, "WireElm"));
	add(resistorButton = createIconButton(resistorIcon, "ResistorElm"));
	add(createIconButton(capacitorIcon, "CapacitorElm"));
	add(createIconButton(inductIcon, "InductorElm"));
	add(createIconButton(groundIcon, "GroundElm"));
	add(createIconButton(inputIcon, "SweepElm"));
	add(createIconButton(outputIcon, "OutputElm"));

	String switchInfo[] = { switchIcon, "SwitchElm", spdtIcon, "Switch2Elm" };
	add(createButtonSet(switchInfo));

	String opAmpInfo[] = { opAmpBotIcon, "OpAmpElm", opAmpTopIcon, "OpAmpSwapElm" };
	add(createButtonSet(opAmpInfo));

        // Create and add the mode label
        modeLabel = new Label("");
        styleModeLabel(modeLabel);
        add(modeLabel);

    }

    public void setModeLabel(String text) { modeLabel.setText(text); }

    private Label createIconButton(String icon, String cls) {
	CirSim app = CirSim.theSim;
	return createIconButton(icon, app.getLabelTextForClass(cls), new MyCommand("main", cls));
    }

    private Label createIconButton(String iconClass, String tooltip, MyCommand command) {
        // Create a label to hold the icon
        Label iconLabel = new Label();
        iconLabel.setText(""); // No text, just an icon
	if (iconClass.startsWith("<svg"))
	    iconLabel.getElement().setInnerHTML(makeSvg(iconClass, 24));
        else
	    iconLabel.getElement().addClassName("cirjsicon-" + iconClass);
        iconLabel.setTitle(tooltip);

        // Style the icon button
	Style style = iconLabel.getElement().getStyle();
        style.setFontSize(24, Style.Unit.PX);
        style.setColor("#333");
        style.setPadding(1, Style.Unit.PX);
        style.setMarginRight(5, Style.Unit.PX);
        style.setCursor(Style.Cursor.POINTER);
	if (iconClass.startsWith("<svg"))
	    style.setPaddingTop(5, Style.Unit.PX);
	style.setProperty("touchAction", "none");

        // Add hover effect for the button
        iconLabel.addMouseOverHandler(event -> iconLabel.getElement().getStyle().setColor("#007bff"));
        iconLabel.addMouseOutHandler(event -> iconLabel.getElement().getStyle().setColor("#333"));

        // Add a click handler to perform the action
        iconLabel.addClickHandler(new ClickHandler() {
            @Override
            public void onClick(ClickEvent event) {
		// un-highlight
        	iconLabel.getElement().getStyle().setColor("#333");
		if (iconLabel == activeButton) {
		    new MyCommand("main", "Select").execute();
		    activeButton = null;
		} else
		    command.execute();
            }
        });

        // Track buttons that belong to the "main" command group
        if (command.getMenuName().equals("main")) {
            highlightableButtons.put(command.getItemName(), iconLabel);

            // pressing and dragging (rather than just clicking) drops a new element
            // where the mouse is released, instead of switching modes
            iconLabel.addMouseDownHandler(mde -> {
        	if (mde.getNativeButton() == NativeEvent.BUTTON_LEFT)
        	    CirSim.theSim.beginToolbarDrag(command.getItemName(), mde.getClientX(), mde.getClientY());
            });
            addTouchDragSupport(iconLabel.getElement());

            // while hovering over an element-creation button, tell the user how to use it
            iconLabel.addMouseOverHandler(event -> {
        	String label = CirSim.theSim.getLabelTextForClass(command.getItemName());
        	if (label != null)
        	    setModeLabel(label + ": Drag And Drop To Create");
            });
            iconLabel.addMouseOutHandler(event -> CirSim.theSim.updateToolbar());
        }

        return iconLabel;
    }

    // Translate touch gestures on a toolbar button into the synthetic mouse events that
    // beginToolbarDrag/toolbarDragMove/toolbarDragEnd already expect, since iOS/touch browsers
    // don't emit real mousemove events during a touch-drag (they just pan the page instead).
    // touchstart re-dispatches a "mousedown" on the button itself, which the existing
    // MouseDownHandler picks up; touchmove/touchend dispatch "mousemove"/"mouseup" on the
    // document so UIManager's global NativePreviewHandler (which drives the drag once it's
    // pending) sees them just like it would for a real mouse drag.
    private native void addTouchDragSupport(com.google.gwt.dom.client.Element el) /*-{
	var startX, startY, moved;
	var TAP_THRESHOLD = 6;
	el.addEventListener('touchstart', function(e) {
	    if (e.touches.length != 1)
		return;
	    var t = e.touches[0];
	    startX = t.clientX;
	    startY = t.clientY;
	    moved = false;
	    var me = new MouseEvent('mousedown', { clientX: t.clientX, clientY: t.clientY, bubbles: true, cancelable: true, button: 0 });
	    el.dispatchEvent(me);
	}, { passive: true });
	el.addEventListener('touchmove', function(e) {
	    if (e.touches.length != 1)
		return;
	    e.preventDefault();
	    var t = e.touches[0];
	    var dx = t.clientX - startX, dy = t.clientY - startY;
	    if (dx*dx + dy*dy > TAP_THRESHOLD*TAP_THRESHOLD)
		moved = true;
	    var me = new MouseEvent('mousemove', { clientX: t.clientX, clientY: t.clientY, bubbles: true, cancelable: true });
	    $doc.dispatchEvent(me);
	}, { passive: false });
	el.addEventListener('touchend', function(e) {
	    e.preventDefault();
	    var t = e.changedTouches[0];
	    var me = new MouseEvent('mouseup', { clientX: t.clientX, clientY: t.clientY, bubbles: true, cancelable: true });
	    $doc.dispatchEvent(me);
	    // preventDefault() suppressed the browser's own synthetic click for this tap,
	    // so re-create it ourselves when the touch didn't turn into a drag.
	    if (!moved) {
		var click = new MouseEvent('click', { clientX: t.clientX, clientY: t.clientY, bubbles: true, cancelable: true });
		el.dispatchEvent(click);
	    }
	}, { passive: false });
	el.addEventListener('touchcancel', function(e) {
	    var t = e.changedTouches[0];
	    var me = new MouseEvent('mouseup', { clientX: t.clientX, clientY: t.clientY, bubbles: true, cancelable: true });
	    $doc.dispatchEvent(me);
	}, { passive: true });
    }-*/;

    String makeSvg(String s, int size) {
	double scale = size/24.0;
	return "<svg xmlns='http://www.w3.org/2000/svg' width='" + size + "' height='" + size + "'><g transform='scale(" + scale + ")'>" +
                 s.substring(5, s.length()-5) + "<g></svg>";
    }

    // New method for creating variant buttons
    private Label createButtonSet(String info[]) {
	MyCommand mainCommand = new MyCommand("main", info[1]);
	CirSim app = CirSim.theSim;
	Label iconLabel = createIconButton(info[0], app.getLabelTextForClass(info[1]), mainCommand);
	
	FlowPanel paletteContainer = new FlowPanel();
	paletteContainer.setVisible(false); // Hidden by default
	paletteContainer.setStyleName("palette-container");

	// Apply CSS styles for positioning and visibility
	Style paletteStyle = paletteContainer.getElement().getStyle();
	paletteStyle.setPosition(Style.Position.ABSOLUTE);
	paletteStyle.setZIndex(1000); // High z-index to appear on top
	paletteStyle.setBackgroundColor("#ffffff");
	paletteStyle.setBorderWidth(1, Style.Unit.PX);
	paletteStyle.setBorderColor("#ccc");
	paletteStyle.setBorderStyle(Style.BorderStyle.SOLID);
	paletteStyle.setPadding(5, Style.Unit.PX);

	int i;
	for (i = 0; i < info.length; i += 2) {
	    // Create each variant button
	    Label variantButton = new Label();
	    variantButton.setText(""); // No text, just an icon
	    variantButton.getElement().setInnerHTML(makeSvg(info[i], 40));
	    variantButton.setTitle(app.getLabelTextForClass(info[i+1]));

	    // Style the variant button
	    Style variantStyle = variantButton.getElement().getStyle();
	    variantStyle.setColor("#333");
	    //variantStyle.setPadding(5, Style.Unit.PX);
	    variantStyle.setCursor(Style.Cursor.POINTER);
	    variantStyle.setProperty("touchAction", "none");

	    final MyCommand command = new MyCommand("main", info[i+1]);
	    final String smallSvg = makeSvg(info[i], 24);

	    // Change the icon of the main button to reflect the variant selected
	    final Runnable selectVariant = () -> {
		iconLabel.getElement().setInnerHTML(smallSvg);
		highlightableButtons.remove(mainCommand.getItemName());
                highlightableButtons.put(command.getItemName(), iconLabel);
		paletteContainer.setVisible(false);
		mainCommand.setItemName(command.getItemName());
	    };

	    // Add click handler to update the main button and execute the command
	    variantButton.addClickHandler(event -> {
		selectVariant.run();
		command.execute();  // Execute the corresponding command for the selected variant
	    });

	    // pressing and dragging (rather than just clicking) a variant drops that
	    // variant directly, instead of switching modes
	    variantButton.addMouseDownHandler(mde -> {
		if (mde.getNativeButton() == NativeEvent.BUTTON_LEFT) {
		    selectVariant.run();
		    CirSim.theSim.beginToolbarDrag(command.getItemName(), mde.getClientX(), mde.getClientY());
		}
	    });
	    addTouchDragSupport(variantButton.getElement());

	    // while hovering over a variant button, tell the user how to use it
	    variantButton.addMouseOverHandler(event -> {
		String label = app.getLabelTextForClass(command.getItemName());
		if (label != null)
		    setModeLabel(label + ": Drag And Drop To Create");
	    });
	    variantButton.addMouseOutHandler(event -> CirSim.theSim.updateToolbar());

	    // Append the variant button to the palette container
	    paletteContainer.add(variantButton);
	}

	// Add the palette container to the document (or you could append it to the toolbar directly)
	RootPanel.get().add(paletteContainer);

	// Show palette on mouse-over
	iconLabel.addMouseOverHandler(event -> {
	    paletteContainer.setVisible(true);

	    // Position the palette relative to the icon label
	    int leftOffset = iconLabel.getAbsoluteLeft() - 12;
	    int topOffset = iconLabel.getAbsoluteTop() + iconLabel.getOffsetHeight() - 2;
	    paletteContainer.getElement().getStyle().setLeft(leftOffset, Style.Unit.PX);
	    paletteContainer.getElement().getStyle().setTop(topOffset, Style.Unit.PX);
	});

	// Hide palette on mouse-out
	iconLabel.addMouseOutHandler(event -> { paletteContainer.setVisible(false); });

	// Keep the palette visible when hovering over it
	paletteContainer.addDomHandler(event -> paletteContainer.setVisible(true), MouseOverEvent.getType());
	paletteContainer.addDomHandler(event -> { paletteContainer.setVisible(false); }, MouseOutEvent.getType());

	return iconLabel;
    }

    private void styleModeLabel(Label label) {
	Style style = label.getElement().getStyle();
        style.setFontSize(16, Style.Unit.PX);
        style.setColor("#333");
        style.setPaddingRight(10, Style.Unit.PX);
	style.setProperty("whiteSpace", "nowrap");
    }

    public void highlightButton(String key) {
        // Deactivate the currently active button
        if (activeButton != null) {
            activeButton.getElement().getStyle().setColor("#333"); // Reset color
            activeButton.getElement().getStyle().setBackgroundColor(null);
        }

        // Activate the new button
        Label newActiveButton = highlightableButtons.get(key);
        if (newActiveButton != null) {
            newActiveButton.getElement().getStyle().setColor("#007bff"); // Active color
            newActiveButton.getElement().getStyle().setBackgroundColor("#e6f7ff");
            activeButton = newActiveButton;
        }
    }

    public void setEuroResistors(boolean euro) {
	resistorButton.getElement().setInnerHTML(makeSvg(euro ? euroResistorIcon : resistorIcon, 24));
    }

    final String wireIcon = "<svg><g transform='scale(0.208) translate(7.5, 32)'>" +
           "<line x1='5' y1='45' x2='95' y2='5' stroke='currentColor' stroke-width='8' /> " +
           "<circle cx='5' cy='45' r='10' fill='currentColor' /><circle cx='95' cy='5' r='10' fill='currentColor' /> " +
           "</g></svg>";

    final String resistorIcon = "<svg> <g transform='scale(.5,.5) translate(-544,-297)'>" +
      "<path stroke='#000000' d=' M 544 320 L 552 320' stroke-width='3'/>" +
      "<path stroke='#000000' d=' M 584 320 L 592 320' stroke-width='3'/>" +
      "<g transform='matrix(1,0,0,1,552,320)'><path fill='none' stroke='currentColor' " +
      "d=' M 0 0 L 2 6 L 6 -6 L 10 6 L 14 -6 L 18 6 L 22 -6 L 26 6 L 30 -6 L 32 0' stroke-width='2'/> </g> </g> </svg>";
    final String euroResistorIcon = "<svg><g transform='translate(97.71,-28.71) scale(0.428571)'><path fill='none' stroke='currentColor' d=' M -224 96 L -216 96' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M -184 96 L -176 96' stroke-linecap='round' stroke-width='3' /><g transform='matrix(1,0,0,1,-216,96)'><rect fill='none' stroke='currentColor' x='0' y='-6' width='32' height='12' stroke-linecap='round' stroke-width='3' /></g><path fill='currentColor' stroke='currentColor' d=' M -221 96 A 3 3 0 1 1 -221.00026077471009 95.96044522459944 Z' /><path fill='currentColor' stroke='currentColor' d=' M -173 96 A 3 3 0 1 1 -173.00026077471009 95.96044522459944 Z' /></g></svg>";

    final String groundIcon = "<svg><defs /><g transform='scale(.6) translate(-826.46,-231.31) scale(1.230769)'><path fill='none' stroke='currentColor' d=' M 688 192 L 688 208' stroke-linecap='round' stroke-width='3' /> <path fill='none' stroke='currentColor' d=' M 698 208 L 678 208' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 694 213 L 682 213' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 690 218 L 686 218' stroke-linecap='round' stroke-width='3' /><path fill='currentColor' stroke='currentColor' d=' M 691 192 A 3 3 0 1 1 690.9997392252899 191.96044522459943 Z' /> </g></svg>";

    final String capacitorIcon = "<svg><defs /><g transform='translate(-323.76,-71.18) scale(0.470588)'><path fill='none' stroke='currentColor' d=' M 688 176 L 708 176' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 708 164 L 708 188' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 736 176 L 716 176' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 716 164 L 716 188' stroke-linecap='round' stroke-width='3' /><path fill='currentColor' stroke='currentColor' d=' M 691 176 A 3 3 0 1 1 690.9997392252899 175.96044522459943 Z' /><path fill='currentColor' stroke='currentColor' d=' M 739 176 A 3 3 0 1 1 738.9997392252899 175.96044522459943 Z' /></g></svg>";

    final String switchIcon = "<svg><defs /><g transform='translate(55.79,-100.42) scale(0.421053)'><path fill='none' stroke='currentColor' d=' M -128 272 L -120 272' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M -88 272 L -80 272' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M -120 272 L -88 256' stroke-linecap='round' stroke-width='3' /></g></svg>";

    final String inductIcon = "<svg><g transform='translate(-101.59,-58.18) scale(0.405680)'><path fill='none' stroke='currentColor' d=' M 256 176 L 264 176' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 296 176 L 304 176' stroke-linecap='round' stroke-width='3' /><g transform='matrix(1,0,0,1,264,176) scale(1,1)'><path fill='none' stroke='currentColor' d=' M 0 0 L 0 6.53144959545255e-16 A 5.333333333333333 5.333333333333333 0 0 1 10.666666666666666 0 L 10.666666666666666 0' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 10.666666666666666 0 L 10.666666666666668 6.53144959545255e-16 A 5.333333333333333 5.333333333333333 0 0 1 21.333333333333332 0 L 21.333333333333332 0' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 21.333333333333332 0 L 21.333333333333336 6.53144959545255e-16 A 5.333333333333333 5.333333333333333 0 0 1 32 0 L 32 0' stroke-linecap='round' stroke-width='3' /></g><path fill='currentColor' stroke='currentColor' d=' M 259 176 A 3 3 0 1 1 258.99973922528994 175.96044522459943 Z' /><path fill='currentColor' stroke='currentColor' d=' M 307 176 A 3 3 0 1 1 306.99973922528994 175.96044522459943 Z' /></g></svg>";

    final String inputIcon = "<svg><g><text style='user-select: none;' fill='currentColor' stroke='none' font-family='sans-serif' font-size='10px' font-style='normal' font-weight='normal' text-decoration='normal' x='3' y='11' text-anchor='start' dominant-baseline='central'>In</text></g></svg>";
    final String outputIcon = "<svg><g><text style='user-select: none;' fill='currentColor' stroke='none' font-family='sans-serif' font-size='10px' font-style='normal' font-weight='normal' text-decoration='normal' x='1' y='11' text-anchor='start' dominant-baseline='central'>Out</text></g></svg>";

    final String spdtIcon = "<svg><g transform='translate(-242.27,-143.68) scale(0.324324)'><path fill='none' stroke='currentColor' d=' M 752 480 L 768 480' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 800 464 L 816 464' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 800 496 L 816 496' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 768 480 L 800 464' stroke-linecap='round' stroke-width='3' /></g></svg>";
    final String opAmpTopIcon = "<svg><g transform='translate(-169.33,-86.13) scale(0.266667)'><path fill='none' stroke='currentColor' d=' M 640 384 L 654 384' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 640 352 L 654 352' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 706 368 L 720 368' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 654 400 L 654 336 L 706 368 Z' stroke-linecap='round' stroke-width='3' /><g><text fill='currentColor' stroke='currentColor' font-family='sans-serif' font-size='14px' font-style='normal' font-weight='normal' text-decoration='normal' x='664' y='382' text-anchor='middle' dominant-baseline='central'>-</text></g><g><text fill='currentColor' stroke='currentColor' font-family='sans-serif' font-size='14px' font-style='normal' font-weight='normal' text-decoration='normal' x='664' y='352' text-anchor='middle' dominant-baseline='central'>+</text></g></g></svg>";
    final String opAmpBotIcon = "<svg><g transform='translate(-169.33,-86.13) scale(0.266667)'><path fill='none' stroke='currentColor' d=' M 640 352 L 654 352' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 640 384 L 654 384' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 706 368 L 720 368' stroke-linecap='round' stroke-width='3' /><path fill='none' stroke='currentColor' d=' M 654 336 L 654 400 L 706 368 Z' stroke-linecap='round' stroke-width='3' /><g><text fill='currentColor' stroke='currentColor' font-family='sans-serif' font-size='14px' font-style='normal' font-weight='normal' text-decoration='normal' x='664' y='350' text-anchor='middle' dominant-baseline='central'>-</text></g><g><text fill='currentColor' stroke='currentColor' font-family='sans-serif' font-size='14px' font-style='normal' font-weight='normal' text-decoration='normal' x='664' y='384' text-anchor='middle' dominant-baseline='central'>+</text></g></g></svg>";
}

