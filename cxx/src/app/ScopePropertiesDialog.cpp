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

#include "ScopePropertiesDialog.h"

#include <QButtonGroup>
#include <QCheckBox>
#include <QComboBox>
#include <QGridLayout>
#include <QHBoxLayout>
#include <QLabel>
#include <QLineEdit>
#include <QPainter>
#include <QPushButton>
#include <QRadioButton>
#include <QScreen>
#include <QSignalBlocker>
#include <QSlider>
#include <QTimer>
#include <QVBoxLayout>
#include <cmath>

#include "CirSim.h"
#include "EditDialog.h"
#include "core/CircuitElm.h"
#include "core/JsMath.h"
#include "core/JsNumber.h"
#include "core/Locale.h"
#include "core/NumberFormat.h"
#include "core/Scope.h"
#include "core/ScopeConstants.h"
#include "core/ScopePlot.h"
#include "core/SimulationManager.h"

using namespace ScopeConstants;

static QString LS(const std::string &s) { return QString::fromStdString(Locale::LS(s)); }

void ScopePropertiesDialog::ScopeCheckBox::setValue(bool b) {
    if (box->isChecked() != b)
        box->setChecked(b);
}

void ScopePropertiesDialog::ScopeCheckBox::setEnabled(bool b) { box->setEnabled(b); }

ScopePropertiesDialog::ScopePropertiesDialog(CirSim *app_, Scope *scope_) : QDialog(app_), app(app_), scope(scope_) {
    setWindowTitle(LS("Scope Properties"));
    setMinimumWidth(420);

    QScreen *screen = app->screen();
    double allowedHeight = (screen ? screen->availableGeometry().height() : 800) * 4 / 5.;
    bool displayAll = allowedHeight > 600;
    bool displayScales = allowedHeight > 470;

    QVBoxLayout *fp = new QVBoxLayout(this);
    fp->setSpacing(2);
    fp->setSizeConstraint(QLayout::SetFixedSize);

    CircuitElm *elm = scope->getSingleElm();
    bool transistor = elm != nullptr && elm->isTransistorElm();
    bool capacitor = elm != nullptr && elm->isCapacitorElm();

    // ---- Vertical Scale ----
    QVBoxLayout *vContent = makeSection(vScaleSection, "Vertical Scale", displayScales, fp);

    // Auto / Max / Manual radio group
    QHBoxLayout *vModePDiv = new QHBoxLayout();
    vContent->addLayout(vModePDiv);
    autoButton = makeRadio("Auto", vModePDiv);
    maxButton = makeRadio("Auto (Max Scale)", vModePDiv);
    manualButton = makeRadio("Manual", vModePDiv);
    vModePDiv->addStretch(1);
    connect(autoButton, &QRadioButton::clicked, this, [this] {
        scope->setManualScale(false, false);
        scope->setMaxScale(false);
        changed();
    });
    connect(maxButton, &QRadioButton::clicked, this, [this] {
        scope->setManualScale(false, false);
        scope->setMaxScale(true);
        changed();
    });
    connect(manualButton, &QRadioButton::clicked, this, [this] {
        scope->setManualScale(true, true);
        changed();
    });

    // Channel buttons
    channelButtonsLayout = new QHBoxLayout();
    channelButtonsLayout->setSpacing(4);
    channelButtonsLayout->addStretch(1);
    vContent->addLayout(channelButtonsLayout);

    // DC/AC coupling row
    vScaleRow0 = new QWidget();
    QHBoxLayout *row0 = new QHBoxLayout(vScaleRow0);
    row0->setContentsMargins(0, 0, 0, 0);
    dcButton = makeRadio("DC Coupled", row0);
    acButton = makeRadio("AC Coupled", row0);
    row0->addStretch(1);
    auto setCoupling = [this](bool ac) {
        if (plotSelection < (int) scope->visiblePlots.size())
            scope->visiblePlots[plotSelection]->setAcCoupled(ac);
        changed();
    };
    connect(dcButton, &QRadioButton::clicked, this, [setCoupling] { setCoupling(false); });
    connect(acButton, &QRadioButton::clicked, this, [setCoupling] { setCoupling(true); });
    vContent->addWidget(vScaleRow0);

    // Position row
    vScaleRow1 = new QWidget();
    QHBoxLayout *row1 = new QHBoxLayout(vScaleRow1);
    row1->setContentsMargins(0, 0, 0, 0);
    positionLabel = new QLabel();
    row1->addWidget(positionLabel);
    positionBar = new QSlider(Qt::Horizontal);
    positionBar->setRange(-V_POSITION_STEPS, V_POSITION_STEPS);
    positionBar->setValue(0);
    connect(positionBar, &QSlider::valueChanged, this, [this] {
        if (!updating)
            positionBarChanged();
    });
    row1->addWidget(positionBar, 1);
    QPushButton *resetPosBtn = new QPushButton(LS("Reset Position"));
    connect(resetPosBtn, &QPushButton::clicked, this, [this] {
        updating = true;
        positionBar->setValue(0);
        updating = false;
        positionBarChanged();
        changed();
    });
    row1->addWidget(resetPosBtn);
    vContent->addWidget(vScaleRow1);

    // Manual scale row
    vScaleRow2 = new QWidget();
    QHBoxLayout *row2 = new QHBoxLayout(vScaleRow2);
    row2->setContentsMargins(0, 0, 0, 0);
    row2->setSpacing(4);
    manualScaleIdLabel = new QLabel();
    row2->addWidget(manualScaleIdLabel);
    scaleDownButton = new QPushButton(QString::fromUtf8("▼"));
    connect(scaleDownButton, &QPushButton::clicked, this, [this] { scaleDown(); });
    row2->addWidget(scaleDownButton);
    manualScaleTextBox = new QLineEdit();
    manualScaleTextBox->setFixedWidth(80);
    connect(manualScaleTextBox, &QLineEdit::editingFinished, this, [this] {
        apply();
        changed();
    });
    row2->addWidget(manualScaleTextBox);
    scaleUpButton = new QPushButton(QString::fromUtf8("▲"));
    connect(scaleUpButton, &QPushButton::clicked, this, [this] { scaleUp(); });
    row2->addWidget(scaleUpButton);
    manualScaleLabel = new QLabel();
    row2->addWidget(manualScaleLabel);
    applyButton = new QPushButton(LS("Apply"));
    connect(applyButton, &QPushButton::clicked, this, [this] { apply(); });
    row2->addWidget(applyButton);
    row2->addStretch(1);
    vContent->addWidget(vScaleRow2);

    // Divisions row
    divisionsRow = new QWidget();
    QHBoxLayout *divLayout = new QHBoxLayout(divisionsRow);
    divLayout->setContentsMargins(0, 0, 0, 0);
    divLayout->addWidget(new QLabel(LS("# of Divisions")));
    divisionsTextBox = new QLineEdit();
    divisionsTextBox->setFixedWidth(50);
    connect(divisionsTextBox, &QLineEdit::editingFinished, this, [this] {
        apply();
        changed();
    });
    divLayout->addWidget(divisionsTextBox);
    QPushButton *applyDivBtn = new QPushButton(LS("Apply"));
    connect(applyDivBtn, &QPushButton::clicked, this, [this] { apply(); });
    divLayout->addWidget(applyDivBtn);
    divLayout->addStretch(1);
    vContent->addWidget(divisionsRow);

    // ---- Horizontal Scale ----
    QVBoxLayout *hContent = makeSection(hScaleSection, "Horizontal Scale", displayScales, fp);
    QHBoxLayout *hRow = new QHBoxLayout();
    speedBar = new QSlider(Qt::Horizontal);
    speedBar->setRange(0, 11);
    speedBar->setValue(2);
    connect(speedBar, &QSlider::valueChanged, this, [this] {
        if (!updating)
            scrollbarChanged();
    });
    hRow->addWidget(speedBar, 1);
    scopeSpeedLabel = new QLabel();
    scopeSpeedLabel->setMinimumWidth(80);
    scopeSpeedLabel->setAlignment(Qt::AlignRight | Qt::AlignVCenter);
    hRow->addWidget(scopeSpeedLabel);
    hContent->addLayout(hRow);

    // ---- Trigger ----
    QVBoxLayout *tContent = makeSection(triggerSection, "Trigger", false, fp);
    QHBoxLayout *trigModePDiv = new QHBoxLayout();
    trigFreeRunButton = makeRadio("Free Run", trigModePDiv);
    trigNormalButton = makeRadio("Normal", trigModePDiv);
    trigAutoButton = makeRadio("Auto", trigModePDiv);
    trigModePDiv->addStretch(1);
    tContent->addLayout(trigModePDiv);
    auto setTrigMode = [this](int mode) {
        scope->setTriggerMode(mode);
        changed();
    };
    connect(trigFreeRunButton, &QRadioButton::clicked, this, [setTrigMode] { setTrigMode(ScopeTrigger::TRIGGER_FREERUN); });
    connect(trigNormalButton, &QRadioButton::clicked, this, [setTrigMode] { setTrigMode(ScopeTrigger::TRIGGER_NORMAL); });
    connect(trigAutoButton, &QRadioButton::clicked, this, [setTrigMode] { setTrigMode(ScopeTrigger::TRIGGER_AUTO); });

    trigEdgeDiv = new QWidget();
    QHBoxLayout *edgeLayout = new QHBoxLayout(trigEdgeDiv);
    edgeLayout->setContentsMargins(0, 0, 0, 0);
    edgeLayout->addWidget(new QLabel(LS("Edge") + ": "));
    trigRisingButton = makeRadio("Rising", edgeLayout);
    trigFallingButton = makeRadio("Falling", edgeLayout);
    edgeLayout->addStretch(1);
    auto setEdge = [this](int edge) {
        scope->trigger.edge = edge;
        scope->resetGraph();
        app->repaint();
    };
    connect(trigRisingButton, &QRadioButton::clicked, this, [setEdge] { setEdge(ScopeTrigger::TRIGGER_EDGE_RISING); });
    connect(trigFallingButton, &QRadioButton::clicked, this, [setEdge] { setEdge(ScopeTrigger::TRIGGER_EDGE_FALLING); });
    tContent->addWidget(trigEdgeDiv);

    trigSourceDiv = new QWidget();
    QHBoxLayout *srcLayout = new QHBoxLayout(trigSourceDiv);
    srcLayout->setContentsMargins(0, 0, 0, 0);
    srcLayout->addWidget(new QLabel(LS("Source:")));
    trigSourceBox = new QComboBox();
    srcLayout->addWidget(trigSourceBox);
    srcLayout->addStretch(1);
    connect(trigSourceBox, &QComboBox::activated, this, [this](int i) {
        int idx = i < 0 ? -1 : trigSourceBox->itemData(i).toInt();
        if (idx >= 0) {
            scope->trigger.source = idx;
            scope->resetGraph();
        }
        app->repaint();
    });
    tContent->addWidget(trigSourceDiv);

    trigLevelDiv = new QWidget();
    QHBoxLayout *lvlLayout = new QHBoxLayout(trigLevelDiv);
    lvlLayout->setContentsMargins(0, 0, 0, 0);
    lvlLayout->addWidget(new QLabel(LS("Level") + ": "));
    triggerLevelTextBox = new QLineEdit();
    triggerLevelTextBox->setFixedWidth(80);
    connect(triggerLevelTextBox, &QLineEdit::returnPressed, this, [this] { applyTriggerLevel(); });
    lvlLayout->addWidget(triggerLevelTextBox);
    QPushButton *trigApplyBtn = new QPushButton(LS("Apply"));
    connect(trigApplyBtn, &QPushButton::clicked, this, [this] { applyTriggerLevel(); });
    lvlLayout->addWidget(trigApplyBtn);
    lvlLayout->addStretch(1);
    tContent->addWidget(trigLevelDiv);

    // ---- Plots ----
    QVBoxLayout *plotsContent = makeSection(plotsSection, "Plots", displayAll, fp);
    QGridLayout *plotsGrid = new QGridLayout();
    plotsGrid->setHorizontalSpacing(16);
    plotsContent->addLayout(plotsGrid);
    int n = 0;
    if (!transistor) {
        voltageBox = makeCheckBox("Show Voltage", "showvoltage", plotsGrid, n);
        currentBox = makeCheckBox("Show Current", "showcurrent", plotsGrid, n);
    } else {
        ibBox = makeCheckBox("Show Ib", "showib", plotsGrid, n);
        icBox = makeCheckBox("Show Ic", "showic", plotsGrid, n);
        ieBox = makeCheckBox("Show Ie", "showie", plotsGrid, n);
        vbeBox = makeCheckBox("Show Vbe", "showvbe", plotsGrid, n);
        vbcBox = makeCheckBox("Show Vbc", "showvbc", plotsGrid, n);
        vceBox = makeCheckBox("Show Vce", "showvce", plotsGrid, n);
    }
    powerBox = makeCheckBox("Show Power Consumed", "showpower", plotsGrid, n);
    if (capacitor)
        chargeBox = makeCheckBox("Show Charge", "showcharge", plotsGrid, n);
    resistanceBox = makeCheckBox("Show Resistance", "showresistance", plotsGrid, n);
    spectrumBox = makeCheckBox("Show Spectrum", "showfft", plotsGrid, n);
    logSpectrumBox = makeCheckBox("Log Spectrum", "logspectrum", plotsGrid, n);
    if (transistor)
        vceIcBox = makeCheckBox("Show Vce vs Ic", "showvcevsic", plotsGrid, n);

    // ---- XY Plots ----
    QVBoxLayout *xyContent = makeSection(xyPlotsSection, "X-Y Plots", displayAll, fp);
    QGridLayout *xyBasicGrid = new QGridLayout();
    xyBasicGrid->setHorizontalSpacing(16);
    xyContent->addLayout(xyBasicGrid);
    n = 0;
    viBox = makeCheckBox("Show V vs I", "showvvsi", xyBasicGrid, n);
    xyBox = makeCheckBox("Plot X/Y", "plotxy", xyBasicGrid, n);
    xyOriginBox = makeCheckBox("Include Origin", "xyorigin", xyBasicGrid, n);
    xyAlignBox = makeCheckBox("Align X", "xyalignx", xyBasicGrid, n);

    xySettingsDiv = new QWidget();
    xySettingsGrid = new QGridLayout(xySettingsDiv);
    xySettingsGrid->setContentsMargins(0, 4, 0, 0);
    xyContent->addWidget(xySettingsDiv);
    int row = 0, col = 0;
    xyPlotXBox = makeXYSelect("X Axis:", row, col, [](Scope *s, int idx) {
        if (idx >= 0)
            s->plot2d.plotX = idx;
    });
    xyPlotYBox = makeXYSelect("Y Axis:", row, col, [](Scope *s, int idx) {
        if (idx >= 0)
            s->plot2d.plotY = idx;
    });
    xyBrightnessBox = makeXYSelect("Brightness:", row, col, [](Scope *s, int idx) { s->plot2d.plotBrightness = idx; });
    xyRedBox = makeXYSelect("Red:", row, col, [](Scope *s, int idx) { s->plot2d.plotColorR = idx; });
    xyGreenBox = makeXYSelect("Green:", row, col, [](Scope *s, int idx) { s->plot2d.plotColorG = idx; });
    xyBlueBox = makeXYSelect("Blue:", row, col, [](Scope *s, int idx) { s->plot2d.plotColorB = idx; });

    // Trail Persistence (inside XY Plots section)
    QHBoxLayout *trailDiv = new QHBoxLayout();
    trailDiv->addWidget(new QLabel(LS("Trail Persistence")));
    // slider 0 = default (frame-based fade); 1..TRAIL_MAX = 1/100 to 10x the scope's
    // horizontal time span, logarithmic, 20 steps per decade
    trailBar = new QSlider(Qt::Horizontal);
    trailBar->setRange(0, TRAIL_MAX);
    trailBar->setValue(trailTimeToSlider(scope->plot2d.trailTime()));
    connect(trailBar, &QSlider::valueChanged, this, [this](int v) {
        if (updating)
            return;
        scope->plot2d.trailPersistence = trailSliderToSteps(v);
        setTrailLabel();
    });
    trailDiv->addWidget(trailBar, 1);
    trailLabel = new QLabel();
    trailLabel->setMinimumWidth(60);
    trailDiv->addWidget(trailLabel);
    xyContent->addLayout(trailDiv);

    // ---- Show Info ----
    QVBoxLayout *infoContent = makeSection(showInfoSection, "Show Info", displayAll, fp);
    QGridLayout *infoGrid = new QGridLayout();
    infoGrid->setHorizontalSpacing(16);
    infoContent->addLayout(infoGrid);
    n = 0;
    scaleBox = makeCheckBox("Show Scale", "showscale", infoGrid, n);
    peakBox = makeCheckBox("Show Peak Value", "showpeak", infoGrid, n);
    negPeakBox = makeCheckBox("Show Negative Peak Value", "shownegpeak", infoGrid, n);
    p2pBox = makeCheckBox("Show Peak-to-Peak", "showp2p", infoGrid, n);
    freqBox = makeCheckBox("Show Frequency", "showfreq", infoGrid, n);
    averageBox = makeCheckBox("Show Average", "showaverage", infoGrid, n);
    rmsBox = makeCheckBox("Show RMS Average", "showrms", infoGrid, n);
    dutyBox = makeCheckBox("Show Duty Cycle", "showduty", infoGrid, n);
    phaseAngleBox = makeCheckBox("Show Phase Angle", "showphaseangle", infoGrid, n);
    elmInfoBox = makeCheckBox("Show Extended Info", "showelminfo", infoGrid, n);

    // ---- Custom Label ----
    QVBoxLayout *labelContent = makeSection(labelSection, "Custom Label", displayAll, fp);
    QHBoxLayout *labelRow = new QHBoxLayout();
    labelTextBox = new QLineEdit();
    if (scope->getText())
        labelTextBox->setText(QString::fromStdString(*scope->getText()));
    connect(labelTextBox, &QLineEdit::returnPressed, this, [this] { apply(); });
    labelRow->addWidget(labelTextBox, 1);
    QPushButton *applyLabelBtn = new QPushButton(LS("Apply"));
    connect(applyLabelBtn, &QPushButton::clicked, this, [this] { apply(); });
    labelRow->addWidget(applyLabelBtn);
    labelContent->addLayout(labelRow);

    // ---- Buttons row ----
    QHBoxLayout *btnRow = new QHBoxLayout();
    btnRow->setContentsMargins(0, 12, 0, 0);
    QPushButton *okBtn = new QPushButton(LS("OK"));
    okBtn->setAutoDefault(false);
    connect(okBtn, &QPushButton::clicked, this, &QDialog::accept);
    btnRow->addWidget(okBtn);
    btnRow->addStretch(1);
    QPushButton *saveDefaultBtn = new QPushButton(LS("Save as Default"));
    saveDefaultBtn->setAutoDefault(false);
    connect(saveDefaultBtn, &QPushButton::clicked, this, [this] { scope->saveAsDefault(); });
    btnRow->addWidget(saveDefaultBtn);
    fp->addLayout(btnRow);

    // Return in a text box applies that box; don't let it also close the dialog
    for (QPushButton *b : findChildren<QPushButton *>())
        b->setAutoDefault(false);

    updateChannelButtons();
    setTrailLabel();
    updateUi();

    // keep the auto scale value current while the simulation runs
    QTimer *timer = new QTimer(this);
    connect(timer, &QTimer::timeout, this, [this] {
        refreshDraw();
        if (scope->plot2d.enabled)
            refreshTrail();
    });
    timer->start(200);
}

// ---- Helpers ----

QVBoxLayout *ScopePropertiesDialog::makeSection(ExpandingSection &sec, const std::string &label, bool expanded,
                                                QVBoxLayout *parent) {
    sec.expanded = expanded;
    QHBoxLayout *header = new QHBoxLayout();
    header->setContentsMargins(0, 8, 0, 0);
    sec.btn = new QPushButton(expanded ? "-" : "+");
    sec.btn->setFixedWidth(28);
    QLabel *lbl = new QLabel(LS(label));
    QFont bold = lbl->font();
    bold.setBold(true);
    lbl->setFont(bold);
    header->addWidget(sec.btn);
    header->addWidget(lbl);
    header->addStretch(1);
    parent->addLayout(header);
    sec.content = new QWidget();
    QVBoxLayout *v = new QVBoxLayout(sec.content);
    v->setContentsMargins(20, 0, 0, 0);
    v->setSpacing(4);
    sec.content->setVisible(expanded);
    parent->addWidget(sec.content);
    ExpandingSection *sp = &sec;
    connect(sec.btn, &QPushButton::clicked, this, [this, sp] {
        sp->expanded = !sp->expanded;
        sp->btn->setText(sp->expanded ? "-" : "+");
        sp->content->setVisible(sp->expanded);
        updateUi();
    });
    return v;
}

// radio buttons are grouped by the layout they're in
QRadioButton *ScopePropertiesDialog::makeRadio(const std::string &label, QHBoxLayout *container) {
    QRadioButton *rb = new QRadioButton(LS(label));
    QButtonGroup *group = container->findChild<QButtonGroup *>();
    if (group == nullptr) {
        group = new QButtonGroup(this);
        group->setParent(container);
    }
    group->addButton(rb);
    container->addWidget(rb);
    return rb;
}

ScopePropertiesDialog::ScopeCheckBox *ScopePropertiesDialog::makeCheckBox(const std::string &label,
                                                                        const std::string &menuCmd,
                                                                        QGridLayout *grid, int &count) {
    auto cb = std::make_unique<ScopeCheckBox>();
    cb->menuCmd = menuCmd;
    cb->box = new QCheckBox(LS(label));
    grid->addWidget(cb->box, count / 3, count % 3);
    count++;
    ScopeCheckBox *p = cb.get();
    connect(cb->box, &QCheckBox::clicked, this, [this, p] { onCheckboxChange(p); });
    checkBoxes.push_back(std::move(cb));
    return p;
}

QComboBox *ScopePropertiesDialog::makeXYSelect(const std::string &label, int &row, int &col,
                                               void (*handler)(Scope *, int)) {
    xySettingsGrid->addWidget(new QLabel(LS(label)), row, col);
    QComboBox *sel = new QComboBox();
    xySettingsGrid->addWidget(sel, row, col + 1);
    connect(sel, &QComboBox::activated, this, [this, sel, handler](int i) {
        handler(scope, i < 0 ? -1 : sel->itemData(i).toInt());
        scope->resetGraph();
        app->repaint();
    });
    col += 2;
    if (col == 4) {
        col = 0;
        row++;
    }
    return sel;
}

void ScopePropertiesDialog::populatePlotListBox(QComboBox *sel, int selectedIdx, bool includeNone) {
    sel->clear();
    if (includeNone)
        sel->addItem(LS("None"), -1);
    for (int i = 0; i < (int) scope->plots.size(); i++) {
        ScopePlot &p = *scope->plots[i];
        std::string name = (p.elm != nullptr) ? p.elm->getScopeText(p.value) : ("Plot " + std::to_string(i + 1));
        sel->addItem(QString::fromStdString(name + " (" + Scope::getScaleUnitsTextStatic(p.units) + ")"), i);
    }
    int idx = sel->findData(selectedIdx);
    sel->setCurrentIndex(idx >= 0 ? idx : 0);
}

static QIcon dotIcon(const std::string &color) {
    QPixmap pm(12, 12);
    pm.fill(Qt::transparent);
    QPainter p(&pm);
    p.setRenderHint(QPainter::Antialiasing);
    p.setPen(Qt::NoPen);
    p.setBrush(QColor(QString::fromStdString(color)));
    p.drawEllipse(1, 1, 10, 10);
    return QIcon(pm);
}

void ScopePropertiesDialog::updateChannelButtons() {
    int nvis = (int) scope->visiblePlots.size();
    if (plotSelection >= nvis)
        plotSelection = 0;
    // remove extra buttons
    while ((int) chanButtons.size() > nvis) {
        delete chanButtons.back();
        chanButtons.pop_back();
    }
    for (int i = 0; i < nvis; i++) {
        if (i >= (int) chanButtons.size()) {
            QPushButton *b = new QPushButton();
            b->setCheckable(true);
            b->setAutoDefault(false);
            connect(b, &QPushButton::clicked, this, [this, i] {
                plotSelection = i;
                updateUi();
            });
            chanButtons.push_back(b);
            // before the trailing stretch
            channelButtonsLayout->insertWidget(i, b);
        }
        ScopePlot &p = *scope->visiblePlots[i];
        std::string label = "CH " + std::to_string(i + 1);
        if (p.units == UNITS_V)
            label += " (V)";
        else if (p.units == UNITS_A)
            label += " (I)";
        else if (p.units == UNITS_OHMS)
            label += " (R)";
        else if (p.units == UNITS_W)
            label += " (P)";
        else if (p.units == UNITS_C)
            label += " (Q)";
        chanButtons[i]->setIcon(dotIcon(p.color));
        chanButtons[i]->setText(QString::fromStdString(label));
        chanButtons[i]->setChecked(i == plotSelection);
        // the checked look is subtle on some styles, so also bold the selected channel
        QFont f = chanButtons[i]->font();
        f.setBold(i == plotSelection);
        chanButtons[i]->setFont(f);
    }
}

void ScopePropertiesDialog::positionBarChanged() {
    if (!scope->isManualScale() || plotSelection >= (int) scope->visiblePlots.size())
        return;
    scope->setPlotPosition(plotSelection, positionBar->value());
    app->repaint();
}

void ScopePropertiesDialog::scrollbarChanged() {
    int newsp = (int) std::pow(2, 10 - speedBar->value());
    if (scope->speed != newsp)
        scope->setSpeed(newsp);
    setScopeSpeedLabel();
    // the trail keeps its time; its slider range moves with the horizontal span
    {
        QSignalBlocker block(trailBar);
        trailBar->setValue(trailTimeToSlider(scope->plot2d.trailTime()));
    }
    setTrailLabel();
    app->repaint();
}

void ScopePropertiesDialog::setScopeSpeedLabel() {
    scopeSpeedLabel->setText(QString::fromStdString(CircuitElm::getUnitText(scope->calcGridStepX(), "s") + "/div"));
}

void ScopePropertiesDialog::setTrailLabel() {
    if (scope->plot2d.trailPersistence <= 0) {
        // measured value: 2 significant figures, so it doesn't flicker in the last digits
        double t = scope->plot2d.defaultTrailTime();
        double r = t > 0 ? jsParseFloat(jsToPrecision(t, 2)) : 0;
        std::string text = Locale::LS("default");
        if (r > 0)
            text += " (\u2248" + CircuitElm::getUnitText(r, "s") + ")";
        trailLabel->setText(QString::fromStdString(text));
    } else {
        trailLabel->setText(QString::fromStdString(CircuitElm::getUnitText(scope->plot2d.trailTime(), "s")));
    }
}

void ScopePropertiesDialog::refreshTrail() {
    if (scope->plot2d.trailPersistence > 0)
        return;
    double now = app->currentTimeMillis();
    if (now - lastTrailRefresh < 500)
        return;
    lastTrailRefresh = now;
    setTrailLabel();
}

void ScopePropertiesDialog::applyTriggerLevel() {
    try {
        scope->trigger.level = EditDialog::parseUnits(triggerLevelTextBox->text().toStdString());
        scope->resetGraph();
        app->repaint();
    } catch (std::exception &) {
    }
}

void ScopePropertiesDialog::onCheckboxChange(ScopeCheckBox *cb) {
    scope->handleMenu(cb->menuCmd, cb->box->isChecked());
    changed();
}

// a setting changed: refresh the dialog and the scope
void ScopePropertiesDialog::changed() {
    updateUi();
    app->repaint();
}

void ScopePropertiesDialog::scaleDown() {
    if (!scope->isManualScale() || plotSelection >= (int) scope->visiblePlots.size())
        return;
    double d = getManualScaleValue();
    if (d == 0)
        return;
    double s = MIN_MAN_SCALE, lasts = s;
    double target = d * 0.999;
    for (int a = 0; s < target; a++) {
        lasts = s;
        s *= multa[a % 3];
    }
    scope->setManualScaleValue(plotSelection, lasts);
    changed();
}

void ScopePropertiesDialog::scaleUp() {
    if (!scope->isManualScale() || plotSelection >= (int) scope->visiblePlots.size())
        return;
    double d = getManualScaleValue();
    if (d == 0)
        return;
    scope->setManualScaleValue(plotSelection, Scope::nextHighestScale(d));
    changed();
}

void ScopePropertiesDialog::updateUi() {
    updating = true;

    speedBar->setValue(10 - (int) std::round(std::log(scope->speed) / std::log(2)));

    if (voltageBox != nullptr) {
        voltageBox->setValue(scope->showV && scope->hasPlotValue(VAL_VOLTAGE));
        currentBox->setValue(scope->showI && scope->hasPlotValue(VAL_CURRENT));
    }
    powerBox->setValue(scope->hasPlotValue(VAL_POWER));
    scaleBox->setValue(scope->showScale);
    peakBox->setValue(scope->showMax);
    negPeakBox->setValue(scope->showMin);
    p2pBox->setValue(scope->showP2P);
    freqBox->setValue(scope->showFreq);
    spectrumBox->setValue(scope->fftPlot.enabled);
    logSpectrumBox->setValue(scope->fftPlot.logSpectrum);
    rmsBox->setValue(scope->showRMS);
    averageBox->setValue(scope->showAverage);
    dutyBox->setValue(scope->showDutyCycle);
    phaseAngleBox->setValue(scope->fftPlot.showPhaseAngle);
    elmInfoBox->setValue(scope->showElmInfo);
    rmsBox->setEnabled(scope->canShowRMS());
    viBox->setValue(scope->plot2d.enabled && !scope->plot2d.plotXY);
    xyBox->setValue(scope->plot2d.plotXY);
    xyOriginBox->setValue(scope->plot2d.includeOrigin);
    xyOriginBox->setEnabled(scope->plot2d.enabled && !scope->isManualScale());
    xyAlignBox->setValue(scope->plot2d.alignX);
    xyAlignBox->setEnabled(scope->plot2d.enabled && !scope->isManualScale());
    resistanceBox->setValue(scope->hasPlotValue(VAL_R));
    resistanceBox->setEnabled(scope->canShowResistance());
    if (chargeBox != nullptr)
        chargeBox->setValue(scope->hasPlotValue(VAL_CHARGE));
    if (ibBox != nullptr) {
        ibBox->setValue(scope->hasPlotValue(VAL_IB));
        icBox->setValue(scope->hasPlotValue(VAL_IC));
        ieBox->setValue(scope->hasPlotValue(VAL_IE));
        vbeBox->setValue(scope->hasPlotValue(VAL_VBE));
        vbcBox->setValue(scope->hasPlotValue(VAL_VBC));
        vceBox->setValue(scope->hasPlotValue(VAL_VCE));
        vceIcBox->setValue(scope->isShowingVceAndIc());
    }

    // Vertical scale mode
    if (scope->isManualScale()) {
        manualButton->setChecked(true);
        applyButton->setVisible(true);
    } else {
        (scope->maxScale ? maxButton : autoButton)->setChecked(true);
        applyButton->setVisible(false);
    }
    updateManualScaleUi();

    // Trigger section visibility
    bool trigActive = scope->trigger.isActive();
    trigFreeRunButton->setChecked(scope->trigger.mode == ScopeTrigger::TRIGGER_FREERUN);
    trigNormalButton->setChecked(scope->trigger.mode == ScopeTrigger::TRIGGER_NORMAL);
    trigAutoButton->setChecked(scope->trigger.mode == ScopeTrigger::TRIGGER_AUTO);
    trigRisingButton->setChecked(scope->trigger.edge == ScopeTrigger::TRIGGER_EDGE_RISING);
    trigFallingButton->setChecked(scope->trigger.edge == ScopeTrigger::TRIGGER_EDGE_FALLING);
    if (!triggerLevelTextBox->hasFocus())
        triggerLevelTextBox->setText(QString::fromStdString(EditDialog::unitStringVal(nullptr, scope->trigger.level)));
    trigEdgeDiv->setVisible(trigActive);
    trigLevelDiv->setVisible(trigActive);
    trigSourceDiv->setVisible(trigActive);
    if (trigActive) {
        ScopePlot *src = scope->triggerSourcePlot();
        int srcIdx = -1;
        for (int i = 0; i < (int) scope->plots.size(); i++)
            if (scope->plots[i].get() == src)
                srcIdx = i;
        populatePlotListBox(trigSourceBox, srcIdx, false);
    }

    // XY settings visibility
    bool xyActive = scope->plot2d.plotXY;
    xySettingsDiv->setVisible(xyActive);
    if (xyActive) {
        populatePlotListBox(xyPlotXBox, scope->plot2d.plotX, false);
        populatePlotListBox(xyPlotYBox, scope->plot2d.plotY, false);
        populatePlotListBox(xyBrightnessBox, scope->plot2d.plotBrightness, true);
        populatePlotListBox(xyRedBox, scope->plot2d.plotColorR, true);
        populatePlotListBox(xyGreenBox, scope->plot2d.plotColorG, true);
        populatePlotListBox(xyBlueBox, scope->plot2d.plotColorB, true);
    }

    setScopeSpeedLabel();
    updating = false;
}

void ScopePropertiesDialog::updateManualScaleUi() {
    bool wasUpdating = updating;
    updating = true;
    updateChannelButtons();
    bool manual = scope->isManualScale();
    bool havePlot = plotSelection < (int) scope->visiblePlots.size();
    // channel selection and AC/DC coupling are available in both manual and auto scale modes
    vScaleRow0->setVisible(havePlot);
    vScaleRow1->setVisible(manual && havePlot);
    vScaleRow2->setVisible(!manual || havePlot);
    divisionsRow->setVisible(manual);
    scaleUpButton->setVisible(manual);
    scaleDownButton->setVisible(manual);

    if (manual && havePlot) {
        ScopePlot &p = *scope->visiblePlots[plotSelection];
        std::string ch = "CH " + std::to_string(plotSelection + 1) + " ";
        manualScaleIdLabel->setText(QString::fromStdString(ch) + LS("Scale"));
        manualScaleLabel->setText(QString::fromStdString(Scope::getScaleUnitsTextStatic(p.units)) + LS("/div"));
        if (!manualScaleTextBox->hasFocus())
            manualScaleTextBox->setText(QString::fromStdString(EditDialog::unitStringVal(nullptr, p.manScale)));
        manualScaleTextBox->setEnabled(true);
        if (!divisionsTextBox->hasFocus())
            divisionsTextBox->setText(QString::number(scope->manDivisions));
        divisionsTextBox->setEnabled(true);
        positionLabel->setText(QString::fromStdString(ch) + LS("Position"));
        positionBar->setValue(p.manVPosition);
        positionBar->setEnabled(true);
    } else if (manual) {
        manualScaleIdLabel->setText("");
        manualScaleLabel->setText("");
        manualScaleTextBox->setText("");
        manualScaleTextBox->setEnabled(false);
        positionLabel->setText("");
        positionBar->setEnabled(false);
    } else {
        manualScaleIdLabel->setText("");
        manualScaleLabel->setText(LS("Max Value") + " (" + QString::fromStdString(scope->getScaleUnitsText()) + ")");
        manualScaleTextBox->setText(QString::fromStdString(EditDialog::unitStringVal(nullptr, scope->getScaleValue())));
        manualScaleTextBox->setEnabled(false);
        positionLabel->setText("");
        positionBar->setEnabled(false);
    }

    if (havePlot) {
        ScopePlot &p = *scope->visiblePlots[plotSelection];
        dcButton->setEnabled(true);
        acButton->setEnabled(p.canAcCouple());
        (p.isAcCoupled() ? acButton : dcButton)->setChecked(true);
    } else {
        dcButton->setEnabled(false);
        acButton->setEnabled(false);
    }
    setScopeSpeedLabel();
    updating = wasUpdating;
}

void ScopePropertiesDialog::refreshDraw() {
    if (!scope->isManualScale())
        updateManualScaleUi();
}

void ScopePropertiesDialog::done(int r) {
    apply();
    QDialog::done(r);
}

double ScopePropertiesDialog::getManualScaleValue() {
    try {
        double d = EditDialog::parseUnits(manualScaleTextBox->text().toStdString());
        return d < MIN_MAN_SCALE ? MIN_MAN_SCALE : d;
    } catch (std::exception &) {
        return 0;
    }
}

int ScopePropertiesDialog::getDivisionsValue() {
    try {
        return parseIntStrict(divisionsTextBox->text().toStdString());
    } catch (std::exception &) {
        return 0;
    }
}

bool ScopePropertiesDialog::apply() {
    std::string label = labelTextBox->text().toStdString();
    if (label.empty())
        scope->text.reset();
    else
        scope->setText(label);
    if (scope->isManualScale()) {
        double d = getManualScaleValue();
        if (d > 0)
            scope->setManualScaleValue(plotSelection, d);
        int n = getDivisionsValue();
        if (n > 0)
            scope->setManDivisions(n);
    }
    app->repaint();
    return true;
}

int ScopePropertiesDialog::trailSliderToSteps(int v) {
    if (v <= 0)
        return 0;
    double t = scope->plot2d.fitWindow() * jsmath::pow(10, (v - 1) / 20. - 2);
    return std::max(1, (int) jsmath::round(t / scope->sim->maxTimeStep));
}

int ScopePropertiesDialog::trailTimeToSlider(double t) {
    if (t <= 0)
        return 0;
    int v = 1 + (int) jsmath::round(20 * (jsmath::log10(t / scope->plot2d.fitWindow()) + 2));
    return std::max(1, std::min(TRAIL_MAX, v));
}
