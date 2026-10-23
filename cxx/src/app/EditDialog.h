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
#include <optional>
#include <vector>

#include "core/EditInfo.h"

class CirSim;
class QGridLayout;
class QHBoxLayout;
class QLabel;
class QVBoxLayout;
class QWidget;

// the property editor for an element or model (EditDialog.ts).  Element editors are
// non-modal: they stay up while you work on the circuit, and clicking another element
// retargets them.  Editors for models and Other Options are modal.
class EditDialog : public QDialog {
public:
    EditDialog(Editable *ce, CirSim *f);

    Editable *elm;

    // reapply the fields (returns false and shows an error if a value is invalid)
    bool apply();
    void resetDialog();
    void closeDialog();

    static constexpr double E12[] = {1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2};
    // step to the next/previous value (in direction dir) in the E12 preferred-value series
    static double stepE12(double value, int dir);
    static std::string unitStringVal(const EditInfo *ei, double v);
    // parse "2k2", "10u", "1meg", "5rms", ...; throws on bad input
    static double parseUnits(std::string s);

protected:
    void keyPressEvent(QKeyEvent *e) override;
    void closeEvent(QCloseEvent *e) override;
    bool eventFilter(QObject *obj, QEvent *e) override;

private:
    struct Field {
        EditInfo ei;
        QWidget *widget = nullptr;  // the input widget (line edit, checkbox, combo, ...)
    };

    void buildDialog();
    void clearDialog();
    QVBoxLayout *addColumn();
    QWidget *makeValueStepperRow(int idx);
    void stepValue(int idx, int dir);
    // copy the widget's current state into the field's EditInfo
    void syncFromWidget(Field &f);
    std::string unitString(const EditInfo &ei);
    double parseUnitsEi(Field &f);
    void itemStateChanged(int idx);
    void passShortcutsThrough();

    CirSim *cframe;
    std::vector<Field> fields;
    QLabel *errorLabel;
    QHBoxLayout *colsRow;
    QWidget *colsHolder = nullptr;
    QVBoxLayout *activeCol = nullptr;
    int activeColCount = 0;
    QWidget *firstInput = nullptr;
    bool firstInputNumeric = false;
    // the first field, while letters typed into it may be tool shortcuts (passShortcutsThrough())
    QWidget *shortcutInput = nullptr;
    bool shortcutInputUntouched = false;
    bool closeOnEnter = true;
    bool building = false;
};
