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

#include <optional>
#include <string>
#include <vector>

// The data side of the edit dialog's widgets.  Elements fill these in from getEditInfo(),
// the dialog (in the app) shows them and copies the user's input back, and elements read
// the results in setEditValue() -- so this stays independent of any UI toolkit.

class Checkbox {
public:
    std::string name;
    bool state;
    Checkbox(std::string n, bool s) : name(std::move(n)), state(s) {}
    bool getState() const { return state; }
    void setState(bool s) { state = s; }
};

class Choice {
public:
    std::vector<std::string> items;
    int selectedIndex = 0;
    void add(const std::string &item) { items.push_back(item); }
    void select(int index) { selectedIndex = index; }
    int getSelectedIndex() const { return selectedIndex; }
    int getItemCount() const { return (int) items.size(); }
    const std::string &getItem(int index) const { return items[index]; }
};

// a single-line text field (ei.textf in the TS version)
struct TextField {
    std::string value;
};

struct TextArea {
    std::string value;
};

struct EditButton {
    std::string label;
};

class EditInfo {
public:
    std::string name;
    std::optional<std::string> text;
    double value = 0;
    bool dimensionless = false;
    // use a plain +/-1 step (rather than the E12 preferred-value series) for the EditDialog
    // stepper buttons; for quantities like voltage that aren't usually picked from E12 values
    bool unitStep = false;
    bool noSliders = false;
    bool isColor = false;
    bool newColumn = false;
    bool positive = false;
    bool nonNegative = false;
    bool integer = false;
    double minVal = 0;
    double maxVal = 0;
    std::optional<std::string> error;
    std::optional<std::string> errorFieldName;
    std::optional<Checkbox> checkbox;
    std::optional<Choice> choice;
    std::optional<EditButton> button;
    std::optional<TextArea> textArea;
    // set by setEditValue() to ask the dialog to rebuild itself (e.g. a choice changed
    // which fields exist)
    bool newDialog = false;
    // set when value comes from a slider rather than the edit dialog
    bool continuous = false;
    // the text field the dialog shows for plain values and text
    std::optional<TextField> textf;

    EditInfo(std::string n, double val, double mn, double mx)
        : name(std::move(n)), value(val), minVal(mn), maxVal(mx) {}
    EditInfo(std::string n, double val) : name(std::move(n)), value(val) {}
    EditInfo(std::string n, const std::string &txt) : name(std::move(n)), text(txt) {
        dimensionless = true;
        noSliders = true;
    }

    static EditInfo createCheckbox(const std::string &name, bool flag) {
        EditInfo ei("", 0, -1, -1);
        ei.checkbox = Checkbox(name, flag);
        return ei;
    }

    static std::string makeLink(const std::string &file, const std::string &text) {
        return "<a href=\"" + file + "\" target=\"_blank\">" + text + "</a>";
    }

    EditInfo &setDimensionless() { dimensionless = true; return *this; }
    EditInfo &setUnitStep() { unitStep = true; return *this; }
    EditInfo &disallowSliders() { noSliders = true; return *this; }
    EditInfo &setIsColor() { isColor = true; return *this; }
    EditInfo &newColumnMethod() { newColumn = true; return *this; }
    int changeFlag(int flags, int bit) const { return checkbox->getState() ? (flags | bit) : (flags & ~bit); }
    int changeFlagInverted(int flags, int bit) const { return !checkbox->getState() ? (flags | bit) : (flags & ~bit); }
    void setError(const std::string &s) { error = s; }
    EditInfo &setErrorFieldName(const std::string &s) { errorFieldName = s; return *this; }
    EditInfo &setPositive() { positive = true; return *this; }
    EditInfo &setNonNegative() { nonNegative = true; return *this; }
    // whole numbers only (implies dimensionless, so the stepper buttons step by 1)
    EditInfo &setInteger() { integer = dimensionless = true; return *this; }

    bool canCreateAdjustable() const {
        return !choice && !checkbox && !button && !textArea && !noSliders;
    }
};

// anything the edit dialog can edit (elements, models, options)
class Editable {
public:
    virtual ~Editable() = default;
    virtual std::optional<EditInfo> getEditInfo(int n) { return std::nullopt; }
    virtual void setEditValue(int n, EditInfo &ei) {}
    // the edit dialog's title, if not the default (empty)
    virtual std::string getEditTitle() { return ""; }
};
