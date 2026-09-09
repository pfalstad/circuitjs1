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

import com.google.gwt.dom.client.Style;
import com.google.gwt.event.dom.client.ClickEvent;
import com.google.gwt.event.dom.client.ClickHandler;
import com.google.gwt.event.dom.client.KeyUpEvent;
import com.google.gwt.event.dom.client.KeyUpHandler;
import com.google.gwt.user.client.Window;
import com.google.gwt.user.client.ui.*;
import com.lushprojects.circuitjs1.client.util.Locale;

import java.util.Vector;

// Modal command palette (VS Code / Sublime style). Opened via double-tap Shift or a
// user-assigned shortcut (CommandManager "key"/"commandpalette"). Arrow keys, Enter,
// and Escape are handled in UIManager.onPreviewNativeEvent so they work even when the
// filter box has focus.
public class CommandPalette extends PopupPanel {

    static final int WIDTH = 520;
    static final int MAX_RESULTS = 50;

    CirSim sim;
    TextBox filterBox;
    FlowPanel listPanel;
    Vector<CommandPaletteRegistry.PaletteCommand> visibleCommands = new Vector<CommandPaletteRegistry.PaletteCommand>();
    int selectedIndex = 0;
    // Only rebuild the list when the filter text actually changes; refreshList() resets
    // selectedIndex to 0, so we must not call it on every key-up (e.g. arrow keys).
    String lastQuery = "";

    public CommandPalette(CirSim asim) {
        super(true, true);
        sim = asim;
        setStyleName("command-palette");
        getElement().getStyle().setWidth(WIDTH, Style.Unit.PX);

        VerticalPanel vp = new VerticalPanel();
        vp.setWidth(WIDTH + "px");
        setWidget(vp);

        filterBox = new TextBox();
        filterBox.setStyleName("command-palette-input");
        filterBox.getElement().setAttribute("placeholder", Locale.LS("Type a command..."));
        vp.add(filterBox);

        listPanel = new FlowPanel();
        listPanel.setStyleName("command-palette-list");
        vp.add(listPanel);

        filterBox.addKeyUpHandler(new KeyUpHandler() {
            public void onKeyUp(KeyUpEvent ev) {
                onFilterTextChanged();
            }
        });
    }

    public void show() {
        lastQuery = "";
        filterBox.setText("");
        refreshList();
        super.show();
        centerPopup();
        filterBox.setFocus(true);
        selectedIndex = 0;
        updateSelectionHighlight();
    }

    void centerPopup() {
        int left = (Window.getClientWidth() - WIDTH) / 2;
        int top = Window.getClientHeight() / 5;
        if (left < 0)
            left = 0;
        if (top < 0)
            top = 0;
        setPopupPosition(left, top);
    }

    void onFilterTextChanged() {
        String query = filterBox.getText();
        if (query.equals(lastQuery))
            return;
        lastQuery = query;
        refreshList();
    }

    void refreshList() {
        String query = filterBox.getText();
        listPanel.clear();
        visibleCommands.clear();
        selectedIndex = 0;

        if (query.trim().length() == 0) {
            Vector<CommandPaletteRegistry.PaletteCommand> recent =
                    CommandPaletteRegistry.recentCommands();
            if (recent.size() > 0) {
                addSectionLabel(Locale.LS("Recent"));
                int i;
                for (i = 0; i != recent.size(); i++)
                    addCommandRow(recent.get(i), query);
            }
        } else {
            Vector<CommandPaletteRegistry.PaletteCommand> results =
                    CommandPaletteRegistry.search(query, MAX_RESULTS);
            int i;
            for (i = 0; i != results.size(); i++)
                addCommandRow(results.get(i), query);
        }
        updateSelectionHighlight();
    }

    void addSectionLabel(String text) {
        Label l = new Label(text);
        l.setStyleName("command-palette-section-label");
        listPanel.add(l);
    }

    void addCommandRow(final CommandPaletteRegistry.PaletteCommand cmd, String query) {
        final int index = visibleCommands.size();
        visibleCommands.add(cmd);

        FlowPanel row = new FlowPanel();
        row.setStyleName("command-palette-item");
        row.getElement().setAttribute("data-index", Integer.toString(index));

        Label label = new Label();
        label.setStyleName("command-palette-item-label");
        String displayLabel = Locale.LS(cmd.label);
        label.getElement().setInnerHTML(
                CommandPaletteRegistry.highlightMatch(displayLabel, query));
        row.add(label);

        if (cmd.hint != null && cmd.hint.length() > 0) {
            Label hint = new Label(Locale.LS(cmd.hint));
            hint.setStyleName("command-palette-item-hint");
            row.add(hint);
        }

        if (!CommandPaletteRegistry.isAvailable(cmd, sim))
            row.addStyleName("command-palette-item-disabled");

        row.addDomHandler(new ClickHandler() {
            public void onClick(ClickEvent event) {
                selectedIndex = index;
                executeSelected();
            }
        }, ClickEvent.getType());

        listPanel.add(row);
    }

    public void moveSelection(int delta) {
        if (visibleCommands.size() == 0)
            return;
        selectedIndex += delta;
        if (selectedIndex < 0)
            selectedIndex = visibleCommands.size() - 1;
        if (selectedIndex >= visibleCommands.size())
            selectedIndex = 0;
        updateSelectionHighlight();
        scrollSelectedIntoView();
    }

    void updateSelectionHighlight() {
        int i;
        for (i = 0; i != listPanel.getWidgetCount(); i++) {
            if (!(listPanel.getWidget(i) instanceof FlowPanel))
                continue;
            FlowPanel row = (FlowPanel) listPanel.getWidget(i);
            String idxStr = row.getElement().getAttribute("data-index");
            if (idxStr == null || idxStr.length() == 0)
                continue;
            int idx = Integer.parseInt(idxStr);
            if (idx == selectedIndex)
                row.addStyleName("command-palette-item-selected");
            else
                row.removeStyleName("command-palette-item-selected");
        }
    }

    void scrollSelectedIntoView() {
        int i;
        for (i = 0; i != listPanel.getWidgetCount(); i++) {
            if (!(listPanel.getWidget(i) instanceof FlowPanel))
                continue;
            FlowPanel row = (FlowPanel) listPanel.getWidget(i);
            String idxStr = row.getElement().getAttribute("data-index");
            if (idxStr != null && idxStr.length() > 0 && Integer.parseInt(idxStr) == selectedIndex) {
                row.getElement().scrollIntoView();
                break;
            }
        }
    }

    public void executeSelected() {
        if (visibleCommands.size() == 0 || selectedIndex < 0 || selectedIndex >= visibleCommands.size())
            return;
        CommandPaletteRegistry.PaletteCommand cmd = visibleCommands.get(selectedIndex);
        if (!CommandPaletteRegistry.isAvailable(cmd, sim))
            return;
        // Close before running the command so modal overlay doesn't block native
        // file/print dialogs (Open File, Save As, etc.).
        close();
        execute(cmd);
    }

    static void execute(CommandPaletteRegistry.PaletteCommand cmd) {
        CirSim app = CirSim.theApp;
        // Context commands (elm:*) need menuElm set the same way as choosing from the right-click menu.
        if (cmd.contextRequired)
            app.mouse.menuElm = app.mouse.getMouseElm();
        if (cmd.custom != null)
            cmd.custom.execute();
        else
            app.commands.menuPerformed(cmd.menu, cmd.item);
        CommandPaletteHistory.record(cmd.id);
    }

    public void close() {
        hide();
        if (CirSim.commandPalette == this)
            CirSim.commandPalette = null;
    }
}
