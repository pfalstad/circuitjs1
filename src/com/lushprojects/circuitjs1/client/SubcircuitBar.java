package com.lushprojects.circuitjs1.client;

import com.google.gwt.dom.client.Style;
import com.google.gwt.event.dom.client.ClickHandler;
import com.google.gwt.user.client.ui.Button;
import com.google.gwt.user.client.ui.FlowPanel;
import com.google.gwt.user.client.ui.InlineLabel;
import com.lushprojects.circuitjs1.client.util.Locale;

public class SubcircuitBar extends FlowPanel {

    private InlineLabel subcircuitLabel;
    private Button backButton;
    private InlineLabel contextLabel;
    private Button contextSaveButton;
    private Button contextSaveCopyButton;

    private boolean hasSubcircuit;
    private boolean hasContext;

    public SubcircuitBar() {
	Style style = getElement().getStyle();
	style.setProperty("background", "rgba(248,248,248,0.85)");
	style.setPosition(Style.Position.ABSOLUTE);
	// no z-index so menu popups (added later in DOM) stack above us
	style.setPadding(4, Style.Unit.PX);
	style.setPaddingLeft(8, Style.Unit.PX);
	style.setPaddingRight(8, Style.Unit.PX);
	style.setProperty("borderBottom", "1px solid #ccc");
	style.setProperty("pointerEvents", "auto");
	style.setProperty("boxSizing", "border-box");
	style.setProperty("whiteSpace", "nowrap");
	// start hidden
	style.setDisplay(Style.Display.NONE);

	// Subcircuit path label
	subcircuitLabel = new InlineLabel("");
	styleLabel(subcircuitLabel);
	subcircuitLabel.setVisible(false);
	add(subcircuitLabel);

	// Context editing label
	contextLabel = new InlineLabel("");
	styleLabel(contextLabel);
	contextLabel.setVisible(false);
	add(contextLabel);

	// Back button (serves both subcircuit back and context back)
	backButton = createButton("\u25c0 Back", event -> {
	    CirSim app = CirSim.theApp;
	    if (!app.ui.subcircuitStack.isEmpty())
		app.ui.popSubcircuit();
	    else
		app.popContext();
	});
	backButton.setVisible(false);
	add(backButton);

	// Context Save button
	contextSaveButton = createButton("Save", event -> {
	    CirSim app = CirSim.theApp;
	    String modelName = app.getEditingModelName();
	    EditCompositeModelDialog dlg = new EditCompositeModelDialog();
	    if (!dlg.createModel())
		return;
	    dlg.model.setName(modelName);
	    dlg.popContext = true;
	    dlg.createDialog();
	    app.dialogShowing = dlg;
	    dlg.show();
	});
	contextSaveButton.setVisible(false);
	add(contextSaveButton);

	// Context Save Copy button
	contextSaveCopyButton = createButton("Save Copy", event -> {
	    EditCompositeModelDialog dlg = new EditCompositeModelDialog();
	    if (!dlg.createModel())
		return;
	    dlg.popContext = true;
	    dlg.createDialog();
	    CirSim.theApp.dialogShowing = dlg;
	    dlg.show();
	});
	contextSaveCopyButton.setVisible(false);
	add(contextSaveCopyButton);
    }

    private void styleLabel(InlineLabel label) {
	Style style = label.getElement().getStyle();
	style.setFontSize(14, Style.Unit.PX);
	style.setColor("#333");
	style.setPaddingRight(10, Style.Unit.PX);
    }

    private Button createButton(String text, ClickHandler handler) {
	Button btn = new Button(Locale.LS(text));
	btn.addClickHandler(handler);
	Style s = btn.getElement().getStyle();
	s.setMarginLeft(5, Style.Unit.PX);
	s.setMarginRight(5, Style.Unit.PX);
	return btn;
    }

    public void setSubcircuitPath(String path) {
	hasSubcircuit = path != null;
	subcircuitLabel.setVisible(hasSubcircuit);
	if (hasSubcircuit)
	    subcircuitLabel.setText(path);
	updateVisibility();
    }

    public void setContextInfo(String modelName) {
	hasContext = modelName != null;
	contextLabel.setVisible(hasContext);
	contextSaveButton.setVisible(hasContext);
	contextSaveCopyButton.setVisible(hasContext);
	if (hasContext)
	    contextLabel.setText(Locale.LS("Editing: ") + modelName);
	updateVisibility();
    }

    private void updateVisibility() {
	boolean show = hasSubcircuit || hasContext;
	// Use display style directly to avoid GWT setVisible overriding it
	getElement().getStyle().setDisplay(show ? Style.Display.BLOCK : Style.Display.NONE);
	backButton.setVisible(show);
    }

    public void updatePosition(int left, int top, int width) {
	Style style = getElement().getStyle();
	style.setLeft(left, Style.Unit.PX);
	style.setTop(top, Style.Unit.PX);
	style.setWidth(width, Style.Unit.PX);
    }
}
