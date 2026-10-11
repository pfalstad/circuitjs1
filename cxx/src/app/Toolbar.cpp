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

#include "Toolbar.h"

#include <QApplication>
#include <QFontDatabase>
#include <QLabel>
#include <QCursor>
#include <QEvent>
#include <QFrame>
#include <QTimer>
#include <QVBoxLayout>
#include <QPainter>
#include <QSvgRenderer>
#include <QToolButton>

#include "CirSim.h"
#include "ToolbarIcons.h"
#include "core/ElementFactory.h"
#include "core/Locale.h"

static QString LS(const char *s) { return QString::fromStdString(Locale::LS(s)); }

static const QColor iconColor("#333");
static const QColor activeColor("#007bff");

// glyphs in the fontello icon font (font/fontello.css)
static constexpr int ICON_SCISSORS = 0xe806;
static constexpr int ICON_ZOOM_11 = 0xe807;
static constexpr int ICON_ZOOM_IN = 0xe80a;
static constexpr int ICON_ZOOM_OUT = 0xe80b;
static constexpr int ICON_SEARCH = 0xe814;
static constexpr int ICON_FORWARD = 0xe818;
static constexpr int ICON_COPY = 0xf0c5;
static constexpr int ICON_PASTE = 0xf0ea;
static constexpr int ICON_REPLY = 0xf112;
static constexpr int ICON_CLONE = 0xf24d;

// Toolbar.makeSvg(): the icons are drawn in a 24x24 box; scale to the requested size
QPixmap Toolbar::svgPixmap(const char *svg, int size, const QColor &color, qreal dpr) {
    QString s = QString::fromUtf8(svg);
    double scale = size / 24.0;
    QString inner = s.mid(5, s.size() - 11);  // strip "<svg>" and "</svg>"
    QString doc = QString("<svg xmlns='http://www.w3.org/2000/svg' width='%1' height='%1'>"
                          "<g transform='scale(%2)'>%3</g></svg>")
                      .arg(size).arg(scale).arg(inner);
    doc.replace("currentColor", color.name());
    // QtSvg doesn't know CSS generic families; asking for one costs a slow font lookup
    doc.replace("font-family='sans-serif'", "font-family='Helvetica'");
    QSvgRenderer r(doc.toUtf8());
    QPixmap pm(QSize(size, size) * dpr);
    pm.fill(Qt::transparent);
    pm.setDevicePixelRatio(dpr);
    QPainter p(&pm);
    r.render(&p, QRectF(0, 0, size, size));
    return pm;
}

static QIcon fontIcon(int glyph, int size, qreal dpr) {
    static QString family;
    if (family.isEmpty()) {
        int id = QFontDatabase::addApplicationFont(CirSim::resourceDir() + "/font/fontello.ttf");
        if (id >= 0)
            family = QFontDatabase::applicationFontFamilies(id).value(0);
    }
    QIcon icon;
    for (const QColor &c : {iconColor, activeColor}) {
        QPixmap pm(QSize(size, size) * dpr);
        pm.fill(Qt::transparent);
        pm.setDevicePixelRatio(dpr);
        QPainter p(&pm);
        QFont f(family);
        f.setPixelSize(size);
        p.setFont(f);
        p.setPen(c);
        p.drawText(QRectF(0, 0, size, size), Qt::AlignCenter, QString(QChar(glyph)));
        icon.addPixmap(pm, c == iconColor ? QIcon::Normal : QIcon::Active);
    }
    return icon;
}

QIcon Toolbar::makeIcon(const char *svg, int size) {
    qreal dpr = devicePixelRatioF();
    QIcon icon;
    icon.addPixmap(svgPixmap(svg, size, iconColor, dpr), QIcon::Normal, QIcon::Off);
    icon.addPixmap(svgPixmap(svg, size, activeColor, dpr), QIcon::Normal, QIcon::On);
    icon.addPixmap(svgPixmap(svg, size, activeColor, dpr), QIcon::Active, QIcon::Off);
    icon.addPixmap(svgPixmap(svg, size, QColor("#bbb"), dpr), QIcon::Disabled, QIcon::Off);
    return icon;
}

Toolbar::Toolbar(CirSim *a) : QToolBar(a), app(a) {
    setMovable(false);
    setFloatable(false);
    setIconSize(QSize(24, 24));

    // the palette stays open while the mouse is over its button or the palette itself.
    // Polling is simpler and more reliable than tracking leave events across two windows.
    paletteCloser = new QTimer(this);
    paletteCloser->setInterval(50);
    connect(paletteCloser, &QTimer::timeout, this, [this] {
        if (openPalette == nullptr)
            return;
        QPoint pos = QCursor::pos();
        bool overButton = openPaletteButton->rect().contains(openPaletteButton->mapFromGlobal(pos));
        if (!overButton && !openPalette->frameGeometry().contains(pos))
            closeAllPalettes();
    });
    setStyleSheet("QToolBar { background: #f8f8f8; border: 1px solid #ccc; padding: 2px; spacing: 3px; }"
                  "QToolButton { border: none; padding: 1px; }"
                  "QToolButton:checked { background: #e6f7ff; }");

    // TODO: search (the command palette) isn't implemented yet
    undoButton = createFontButton(ICON_REPLY, LS("Undo"), [this] { app->undoManager->doUndo(); });
    redoButton = createFontButton(ICON_FORWARD, LS("Redo"), [this] { app->undoManager->doRedo(); });
    createFontButton(ICON_SCISSORS, LS("Cut"), [this] { if (!app->isReadOnly()) app->doCut(nullptr); });
    createFontButton(ICON_COPY, LS("Copy"), [this] { if (!app->isReadOnly()) app->doCopy(nullptr); });
    createFontButton(ICON_PASTE, LS("Paste"), [this] { if (!app->isReadOnly()) app->doPaste(); });
    createFontButton(ICON_CLONE, LS("Duplicate"), [this] { if (!app->isReadOnly()) app->doDuplicate(nullptr); });
    createFontButton(ICON_SEARCH, LS("Find Component/Command..."), nullptr);

    createFontButton(ICON_ZOOM_11, LS("Zoom 100%"), [this] { app->mouse.setCircuitScale(1, true); app->repaint(); });
    createFontButton(ICON_ZOOM_IN, LS("Zoom In"), [this] { app->mouse.zoomCircuit(20, true); app->repaint(); });
    createFontButton(ICON_ZOOM_OUT, LS("Zoom Out"), [this] { app->mouse.zoomCircuit(-20, true); app->repaint(); });

    using namespace ToolbarIcons;
    createIconButtonForClass(wireIcon, "WireElm");
    resistorButton = createIconButtonForClass(app->options.euroResistor ? euroResistorIcon : resistorIcon, "ResistorElm");
    createIconButtonForClass(groundIcon, "GroundElm");
    createButtonSet({{capacitorIcon, "CapacitorElm"}, {polarCapacitorIcon, "PolarCapacitorElm"}});
    createIconButtonForClass(inductIcon, "InductorElm");
    createIconButtonForClass(diodeIcon, "DiodeElm");
    createButtonSet({{voltage2Icon, "DCVoltageElm"}, {acSrcIcon, "ACVoltageElm"}});
    createIconButtonForClass(railIcon, "RailElm");
    createButtonSet({{switchIcon, "SwitchElm"}, {spdtIcon, "Switch2Elm"}, {aswitch1Icon, "AnalogSwitchElm"},
                     {aswitch2Icon, "AnalogSwitch2Elm"}});
    createButtonSet({{opAmpBotIcon, "OpAmpElm"}, {opAmpTopIcon, "OpAmpSwapElm"}});
    createButtonSet({{transistorIcon, "NTransistorElm"}, {pnpTransistorIcon, "PTransistorElm"}});
    createButtonSet({{fetIcon, "NMosfetElm"}, {fetIcon2, "PMosfetElm"}});
    createIconButtonForClass(inverterIcon, "InverterElm");
    createButtonSet({{andIcon, "AndGateElm"}, {nandIcon, "NandGateElm"}, {orIcon, "OrGateElm"},
                     {norIcon, "NorGateElm"}, {xorIcon, "XorGateElm"}, {xnorIcon, "XnorGateElm"}});

    // the mode label
    modeLabel = new QLabel();
    modeLabel->setStyleSheet("QLabel { font-size: 16px; color: #333; padding-left: 8px; padding-right: 10px; }");
    addWidget(modeLabel);
}

void Toolbar::setEuroResistors(bool euro) {
    resistorButton->setIcon(makeIcon(euro ? ToolbarIcons::euroResistorIcon : ToolbarIcons::resistorIcon, 24));
}

void Toolbar::enableUndoRedo(bool undo, bool redo) {
    undoButton->setEnabled(undo);
    redoButton->setEnabled(redo);
}

QToolButton *Toolbar::createFontButton(int glyph, const QString &tooltip, std::function<void()> action) {
    QToolButton *b = new QToolButton();
    b->setIcon(fontIcon(glyph, 24, devicePixelRatioF()));
    b->setToolTip(tooltip);
    b->setAutoRaise(true);
    if (action)
        connect(b, &QToolButton::clicked, this, action);
    else
        b->setEnabled(false);
    addWidget(b);
    return b;
}

QToolButton *Toolbar::createIconButtonForClass(const char *icon, const QString &cls) {
    QToolButton *b = new QToolButton();
    b->setIcon(makeIcon(icon, 24));
    b->setToolTip(app->classToLabelMap.value(cls, cls));
    b->setCheckable(true);
    b->setAutoRaise(true);
    b->setProperty("cls", cls);
    b->setEnabled(ElementFactory::hasClass(cls.toStdString()));
    // TODO: dragging from the button onto the canvas to drop an element
    connect(b, &QToolButton::clicked, this, [this, b] { buttonClicked(b); });
    highlightableButtons[cls] = b;
    addWidget(b);
    return b;
}

QToolButton *Toolbar::createButtonSet(const std::vector<std::pair<const char *, QString>> &info) {
    QToolButton *b = createIconButtonForClass(info[0].first, info[0].second);

    // a frameless popup that doesn't take focus from the main window
    QFrame *palette = new QFrame(this, Qt::ToolTip | Qt::FramelessWindowHint);
    palette->setAttribute(Qt::WA_ShowWithoutActivating);
    palette->setObjectName("palette");
    palette->setStyleSheet("QFrame#palette { background: #ffffff; border: 1px solid #ccc; }"
                           "QToolButton { border: none; padding: 0px; background: transparent; }");
    QVBoxLayout *layout = new QVBoxLayout(palette);
    layout->setContentsMargins(5, 5, 5, 5);
    layout->setSpacing(0);

    bool anyEnabled = false;
    for (const auto &v : info) {
        const char *icon = v.first;
        QString cls = v.second;
        QToolButton *vb = new QToolButton(palette);
        vb->setIcon(makeIcon(icon, 40));
        vb->setIconSize(QSize(40, 40));
        vb->setAutoRaise(true);
        vb->setToolTip(app->classToLabelMap.value(cls, cls));
        bool ok = ElementFactory::hasClass(cls.toStdString());
        vb->setEnabled(ok);
        anyEnabled |= ok;
        // TODO: dragging a variant onto the canvas to drop it
        // choosing a variant makes it this button's element, and switches to it
        connect(vb, &QToolButton::clicked, this, [this, b, icon, cls] {
            highlightableButtons.remove(b->property("cls").toString());
            b->setIcon(makeIcon(icon, 24));
            b->setToolTip(app->classToLabelMap.value(cls, cls));
            b->setProperty("cls", cls);
            highlightableButtons[cls] = b;
            closeAllPalettes();
            app->setMouseMode(cls);
        });
        layout->addWidget(vb);
    }
    palette->adjustSize();
    palettes[b] = palette;
    b->installEventFilter(this);
    // the set is usable if any of its variants is
    b->setEnabled(anyEnabled);
    return b;
}

// show the palette on mouse-over (b's Enter event)
bool Toolbar::eventFilter(QObject *obj, QEvent *e) {
    if (e->type() == QEvent::Enter) {
        QToolButton *b = static_cast<QToolButton *>(obj);
        if (palettes.contains(b) && b->isEnabled())
            showPalette(b, palettes[b]);
    }
    return QToolBar::eventFilter(obj, e);
}

void Toolbar::showPalette(QToolButton *b, QFrame *palette) {
    if (openPalette == palette)
        return;
    closeAllPalettes();
    // just below the button, a little to the left, like the web version
    palette->move(b->mapToGlobal(QPoint(-12, b->height() - 2)));
    palette->show();
    palette->raise();
    openPalette = palette;
    openPaletteButton = b;
    paletteCloser->start();
}

void Toolbar::closeAllPalettes() {
    paletteCloser->stop();
    if (openPalette != nullptr)
        openPalette->hide();
    openPalette = nullptr;
    openPaletteButton = nullptr;
}

void Toolbar::buttonClicked(QToolButton *b) {
    QString cls = b->property("cls").toString();
    if (b == activeButton || !ElementFactory::hasClass(cls.toStdString())) {
        // clicking the active button again goes back to Select
        // (a button set whose default isn't ported yet just shows its palette)
        app->setMouseMode("Select");
    } else {
        app->setMouseMode(cls);
    }
}

void Toolbar::setModeLabel(const QString &text) {
    modeLabel->setText(text);
}

void Toolbar::highlightButton(const QString &key) {
    if (activeButton != nullptr)
        activeButton->setChecked(false);
    activeButton = highlightableButtons.value(key, nullptr);
    if (activeButton != nullptr)
        activeButton->setChecked(true);
}
