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

#include <QDialog>
#include <memory>
#include <string>
#include <vector>

class CirSim;
class Scope;
class QCheckBox;
class QComboBox;
class QGridLayout;
class QHBoxLayout;
class QLabel;
class QLineEdit;
class QPushButton;
class QRadioButton;
class QSlider;
class QVBoxLayout;

// scope settings dialog (ScopePropertiesDialog.ts)
class ScopePropertiesDialog : public QDialog {
public:
    ScopePropertiesDialog(CirSim *app, Scope *scope);

    void updateUi();
    // called periodically so the auto scale value stays current
    void refreshDraw();
    bool apply();

    static constexpr int TRAIL_MAX = 61;
    // slider 1..TRAIL_MAX -> span * 10^((v-1)/20 - 2), stored as timesteps; 0 = default
    int trailSliderToSteps(int v);
    int trailTimeToSlider(double t);

protected:
    void done(int r) override;

private:
    // a checkbox with an associated scope menu command string
    struct ScopeCheckBox {
        QCheckBox *box = nullptr;
        std::string menuCmd;
        void setValue(bool b);
        void setEnabled(bool b);
    };
    // bold label + +/- toggle button, controls visibility of a content widget
    struct ExpandingSection {
        bool expanded = false;
        QPushButton *btn = nullptr;
        QWidget *content = nullptr;
    };

    QVBoxLayout *makeSection(ExpandingSection &sec, const std::string &label, bool expanded, QVBoxLayout *parent);
    QRadioButton *makeRadio(const std::string &label, QHBoxLayout *container);
    ScopeCheckBox *makeCheckBox(const std::string &label, const std::string &menuCmd, QGridLayout *grid, int &count);
    QComboBox *makeXYSelect(const std::string &label, int &row, int &col, void (*handler)(Scope *, int));
    void populatePlotListBox(QComboBox *sel, int selectedIdx, bool includeNone);
    void updateChannelButtons();
    void updateManualScaleUi();
    void positionBarChanged();
    void scrollbarChanged();
    void setScopeSpeedLabel();
    void setTrailLabel();
    // the default trail time is measured live from the sim speed (twice a second is plenty
    // for a readout)
    void refreshTrail();
    double lastTrailRefresh = 0;
    void applyTriggerLevel();
    void onCheckboxChange(ScopeCheckBox *cb);
    void scaleDown();
    void scaleUp();
    double getManualScaleValue();
    int getDivisionsValue();
    void changed();

    CirSim *app;
    Scope *scope;
    int plotSelection = 0;
    // set while updateUi() is changing widgets, so their signals are ignored
    bool updating = false;

    // Vertical scale
    ExpandingSection vScaleSection;
    QRadioButton *autoButton, *maxButton, *manualButton;
    QHBoxLayout *channelButtonsLayout;
    std::vector<QPushButton *> chanButtons;
    QRadioButton *dcButton, *acButton;
    QLabel *positionLabel;
    QSlider *positionBar;
    QLabel *manualScaleIdLabel;
    QLineEdit *manualScaleTextBox;
    QLabel *manualScaleLabel;
    QPushButton *scaleDownButton, *scaleUpButton, *applyButton;
    QLineEdit *divisionsTextBox;
    QWidget *divisionsRow, *vScaleRow0, *vScaleRow1, *vScaleRow2;

    // Horizontal scale
    ExpandingSection hScaleSection;
    QSlider *speedBar;
    QLabel *scopeSpeedLabel;

    // Trigger
    ExpandingSection triggerSection;
    QRadioButton *trigFreeRunButton, *trigNormalButton, *trigAutoButton;
    QWidget *trigEdgeDiv, *trigLevelDiv, *trigSourceDiv;
    QComboBox *trigSourceBox;
    QRadioButton *trigRisingButton, *trigFallingButton;
    QLineEdit *triggerLevelTextBox;

    // Trail
    QSlider *trailBar;
    QLabel *trailLabel;

    // Plots checkboxes (owned by checkBoxes)
    std::vector<std::unique_ptr<ScopeCheckBox>> checkBoxes;
    ExpandingSection plotsSection;
    ScopeCheckBox *voltageBox = nullptr, *currentBox = nullptr;
    ScopeCheckBox *ibBox = nullptr, *icBox = nullptr, *ieBox = nullptr;
    ScopeCheckBox *vbeBox = nullptr, *vbcBox = nullptr, *vceBox = nullptr, *vceIcBox = nullptr;
    ScopeCheckBox *powerBox, *chargeBox = nullptr, *resistanceBox, *spectrumBox, *logSpectrumBox;

    // XY plots
    ExpandingSection xyPlotsSection;
    ScopeCheckBox *viBox, *xyBox, *xyOriginBox, *xyAlignBox;
    QWidget *xySettingsDiv;
    QGridLayout *xySettingsGrid;
    QComboBox *xyPlotXBox, *xyPlotYBox, *xyBrightnessBox, *xyRedBox, *xyGreenBox, *xyBlueBox;

    // Show info
    ExpandingSection showInfoSection;
    ScopeCheckBox *scaleBox, *peakBox, *negPeakBox, *p2pBox, *freqBox, *averageBox, *rmsBox, *dutyBox,
        *phaseAngleBox, *elmInfoBox;

    // Custom label
    ExpandingSection labelSection;
    QLineEdit *labelTextBox;
};
