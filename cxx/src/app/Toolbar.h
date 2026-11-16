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

#pragma once

#include <QMap>
#include <QToolBar>
#include <functional>
#include <vector>

class CirSim;
class QLabel;
class QToolButton;
class QFrame;
class QTimer;

// the icon toolbar above the canvas (Toolbar.ts)
class Toolbar : public QToolBar {
public:
    explicit Toolbar(CirSim *app);

    void setModeLabel(const QString &text);
    void enableUndoRedo(bool undo, bool redo);
    // highlight the button for the current mouse mode (a class name like "ResistorElm")
    void highlightButton(const QString &key);
    // show the European or US resistor icon
    void setEuroResistors(bool euro);

    // render one of the SVG icon strings from Toolbar.ts
    static QPixmap svgPixmap(const char *svg, int size, const QColor &color, qreal dpr);

private:
    QToolButton *createIconButtonForClass(const char *icon, const QString &cls);
    QToolButton *createFontButton(int glyph, const QString &tooltip, std::function<void()> action);
    QToolButton *undoButton = nullptr;
    QToolButton *redoButton = nullptr;
    QToolButton *resistorButton = nullptr;
    // a button with a palette of variants (capacitor/polarized capacitor, etc) that pops
    // up below it on hover.  info is icon, class, icon, class, ...; the first pair is the
    // default.  Choosing a variant makes it the button's element.
    QToolButton *createButtonSet(const std::vector<std::pair<const char *, QString>> &info);
    void showPalette(QToolButton *b, QFrame *palette);
    void closeAllPalettes();
    bool eventFilter(QObject *obj, QEvent *e) override;
    QIcon makeIcon(const char *svg, int size);
    void buttonClicked(QToolButton *b);
    // set up press-and-drag from a button (whose element class is its "cls" property)
    // onto the canvas, and the hover hint
    void addDragSupport(QToolButton *b);
    // tracks a press-and-drag started on a button (installed on the whole application,
    // since the gesture ends over the canvas)
    bool handleToolbarDrag(QObject *obj, QEvent *e);

    CirSim *app;
    QLabel *modeLabel;
    // mode name -> button that selects it (variant buttons move as variants are chosen)
    QMap<QString, QToolButton *> highlightableButtons;
    QToolButton *activeButton = nullptr;
    // variant palettes, keyed by the button that opens them
    QMap<QToolButton *, QFrame *> palettes;
    QFrame *openPalette = nullptr;
    QToolButton *openPaletteButton = nullptr;
    // the button a toolbar drag started on
    QToolButton *dragButton = nullptr;
    // installed on the application while a toolbar drag is pending
    QObject *dragFilter;
    // palette variant buttons -> make that variant its button's element
    QMap<QToolButton *, std::function<void()>> variantSelectors;
    QTimer *paletteCloser;  // polls the mouse while a palette is open; closes it once the mouse leaves
};
