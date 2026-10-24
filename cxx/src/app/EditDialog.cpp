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

#include "EditDialog.h"

#include "core/Adjustable.h"

#include <QCheckBox>
#include <QDesktopServices>
#include <QUrl>
#include <QCloseEvent>
#include <QColorDialog>
#include <QComboBox>
#include <QAction>
#include <QHBoxLayout>
#include <QKeyEvent>
#include <QLabel>
#include <QLineEdit>
#include <QPlainTextEdit>
#include <QPushButton>
#include <QRegularExpression>
#include <QTimer>
#include <QVBoxLayout>
#include <cmath>
#include <stdexcept>

#include "CirSim.h"
#include "core/CircuitElm.h"
#include "core/JsMath.h"
#include "core/JsNumber.h"
#include "core/Locale.h"
#include "core/NumberFormat.h"
#include "elements/VoltageElm.h"

static constexpr double ROOT2 = 1.41421356237309504880;

static QString LS(const std::string &s) { return QString::fromStdString(Locale::LS(s)); }

// strip trailing zeros after decimal point
static std::string noCommaFormat(double v) {
    std::string s = jsToPrecision(v, 10);
    // toPrecision can produce scientific notation for very large/small values; fall back to toString
    if (s.find('e') != std::string::npos || s.find('E') != std::string::npos)
        return jsNumberToString(v);
    if (s.find('.') != std::string::npos) {
        while (!s.empty() && s.back() == '0')
            s.pop_back();
        if (!s.empty() && s.back() == '.')
            s.pop_back();
    }
    return s;
}

EditDialog::EditDialog(Editable *ce, CirSim *f) : QDialog(f, Qt::Tool), elm(ce), cframe(f) {
    setAttribute(Qt::WA_DeleteOnClose);

    // Title
    std::string title = "Edit Component";
    if (!ce->getEditTitle().empty())
        title = ce->getEditTitle();
    else if (CircuitElm *e = dynamic_cast<CircuitElm *>(ce)) {
        std::string name = e->getElmType();
        if (!name.empty())
            title = "Edit " + std::string(1, (char) std::toupper((unsigned char) name[0])) + name.substr(1);
    }
    setWindowTitle(LS(title));
    // Element editors are non-modal (see EditDialog.h).  Editors for anything else (models,
    // Other Options) are opened explicitly, so they are modal like other dialogs.
    if (dynamic_cast<CircuitElm *>(ce) == nullptr)
        setWindowModality(Qt::ApplicationModal);

    QVBoxLayout *main = new QVBoxLayout(this);
    errorLabel = new QLabel();
    errorLabel->setStyleSheet("QLabel { color: red; }");
    errorLabel->hide();
    main->addWidget(errorLabel);

    colsHolder = new QWidget();
    colsRow = new QHBoxLayout(colsHolder);
    colsRow->setContentsMargins(0, 0, 0, 0);
    colsRow->setSpacing(10);
    colsRow->setAlignment(Qt::AlignTop | Qt::AlignLeft);
    main->addWidget(colsHolder);
    activeCol = addColumn();

    buildDialog();

    // Buttons row
    QHBoxLayout *btnRow = new QHBoxLayout();
    QPushButton *applyBtn = new QPushButton(LS("Apply"));
    QPushButton *okBtn = new QPushButton(LS("OK"));
    QPushButton *cancelBtn = new QPushButton(LS("Cancel"));
    applyBtn->setAutoDefault(false);
    okBtn->setAutoDefault(false);
    cancelBtn->setAutoDefault(false);
    btnRow->addWidget(applyBtn);
    btnRow->addStretch(1);
    btnRow->addWidget(okBtn);
    btnRow->addWidget(cancelBtn);
    main->addLayout(btnRow);
    connect(applyBtn, &QPushButton::clicked, this, [this] { apply(); });
    connect(okBtn, &QPushButton::clicked, this, [this] {
        if (apply())
            closeDialog();
    });
    connect(cancelBtn, &QPushButton::clicked, this, [this] { closeDialog(); });

    if (firstInputNumeric && dynamic_cast<CircuitElm *>(ce) != nullptr)
        passShortcutsThrough();
}

// The editor pops up with its first field focused whenever an element is created, so you
// can place a resistor, type 10k and press Enter. But a letter can't start a numeric value,
// so if one is typed into that field before it's been touched and it's a tool shortcut,
// the user is moving on to the next element: close the editor and act on the shortcut.
void EditDialog::passShortcutsThrough() {
    shortcutInput = firstInput;
    shortcutInputUntouched = true;
    // any click in the dialog counts as touching it
    installEventFilter(this);
    for (QWidget *w : findChildren<QWidget *>())
        w->installEventFilter(this);
}

bool EditDialog::eventFilter(QObject *obj, QEvent *e) {
    if (e->type() == QEvent::MouseButtonPress)
        shortcutInputUntouched = false;
    if (e->type() != QEvent::KeyPress || obj != shortcutInput)
        return QDialog::eventFilter(obj, e);
    QKeyEvent *ke = static_cast<QKeyEvent *>(e);
    bool wasUntouched = shortcutInputUntouched;
    shortcutInputUntouched = false;
    QString text = ke->text();
    if (!wasUntouched || (ke->modifiers() & (Qt::ControlModifier | Qt::MetaModifier | Qt::AltModifier)) ||
        text.size() != 1 || !((text[0] >= 'a' && text[0] <= 'z') || (text[0] >= 'A' && text[0] <= 'Z')))
        return QDialog::eventFilter(obj, e);
    QKeySequence k(QKeyCombination(ke->modifiers() & Qt::ShiftModifier, (Qt::Key) ke->key()));
    QAction *a = cframe->findToolShortcut(k);
    if (a == nullptr)
        return QDialog::eventFilter(obj, e);
    closeDialog();
    a->trigger();
    return true;
}

QVBoxLayout *EditDialog::addColumn() {
    QVBoxLayout *col = new QVBoxLayout();
    col->setSpacing(4);
    col->setAlignment(Qt::AlignTop);
    colsRow->addLayout(col);
    activeColCount = 0;
    return col;
}

void EditDialog::buildDialog() {
    building = true;
    fields.clear();
    for (int i = 0;; i++) {
        std::optional<EditInfo> eio = elm->getEditInfo(i);
        if (!eio)
            break;
        fields.push_back(Field{*eio, nullptr});
    }
    for (int i = 0; i < (int) fields.size(); i++) {
        Field &f = fields[i];
        EditInfo &ei = f.ei;

        // Start new column when current is full or element requests it
        if (activeColCount > 15 || ei.newColumn)
            activeCol = addColumn();

        if (!ei.name.empty()) {
            QLabel *label = new QLabel(LS(ei.name));
            // names from EditInfo.makeLink() link to help pages, which we bundle
            if (ei.name.find("<a href") != std::string::npos) {
                label->setTextFormat(Qt::RichText);
                connect(label, &QLabel::linkActivated, this, [](const QString &href) {
                    QDesktopServices::openUrl(QUrl::fromLocalFile(CirSim::resourceDir() + "/help/" + href));
                });
            }
            if (activeColCount > 0)
                activeCol->addSpacing(4);
            activeCol->addWidget(label);
        }
        activeColCount++;

        if (ei.choice) {
            QComboBox *sel = new QComboBox();
            for (const std::string &item : ei.choice->items)
                sel->addItem(QString::fromStdString(item));
            sel->setCurrentIndex(ei.choice->selectedIndex);
            connect(sel, &QComboBox::currentIndexChanged, this, [this, i](int) { itemStateChanged(i); });
            f.widget = sel;
            activeCol->addWidget(sel);
        } else if (ei.checkbox) {
            QCheckBox *cb = new QCheckBox(LS(ei.checkbox->name));
            cb->setChecked(ei.checkbox->state);
            connect(cb, &QCheckBox::toggled, this, [this, i](bool) { itemStateChanged(i); });
            f.widget = cb;
            activeCol->addWidget(cb);
        } else if (ei.button) {
            QPushButton *btn = new QPushButton(LS(ei.button->label));
            btn->setAutoDefault(false);
            connect(btn, &QPushButton::clicked, this, [this, i] { itemStateChanged(i); });
            f.widget = btn;
            activeCol->addWidget(btn);
        } else if (ei.textArea) {
            QPlainTextEdit *ta = new QPlainTextEdit(QString::fromStdString(ei.textArea->value));
            ta->setMinimumSize(320, 80);
            f.widget = ta;
            if (!firstInput)
                firstInput = ta;
            activeCol->addWidget(ta);
            closeOnEnter = false;
        } else if (ei.text && ei.isColor) {
            // a swatch that opens a color picker
            QPushButton *btn = new QPushButton();
            btn->setAutoDefault(false);
            btn->setFixedWidth(180);
            auto setSwatch = [btn](const QString &c) {
                btn->setProperty("color", c);
                btn->setText(c);
                btn->setStyleSheet(QString("QPushButton { background: %1; color: %2; }")
                                       .arg(c, QColor(c).lightness() > 128 ? "black" : "white"));
            };
            setSwatch(QString::fromStdString(*ei.text));
            connect(btn, &QPushButton::clicked, this, [this, btn, setSwatch] {
                QColor c = QColorDialog::getColor(QColor(btn->property("color").toString()), this);
                if (c.isValid())
                    setSwatch(c.name());
            });
            f.widget = btn;
            activeCol->addWidget(btn);
        } else {
            // Plain text input
            QLineEdit *inp = new QLineEdit();
            inp->setFixedWidth(180);
            f.widget = inp;
            if (!firstInput) {
                firstInput = inp;
                firstInputNumeric = !ei.text;
            }
            if (ei.text) {
                inp->setText(QString::fromStdString(*ei.text));
                activeCol->addWidget(inp);
            } else {
                inp->setText(QString::fromStdString(unitString(ei)));
                activeCol->addWidget(makeValueStepperRow(i));
            }
        }
    }
    building = false;

    // Focus first text input after the dialog opens
    if (firstInput) {
        QWidget *inp = firstInput;
        QTimer::singleShot(0, inp, [inp] {
            inp->setFocus();
            if (QLineEdit *le = qobject_cast<QLineEdit *>(inp))
                le->selectAll();
        });
    }
}

// A text field with "-"/"+" buttons that step the value.  Component values (R/L/C, etc.)
// step through the E12 preferred-value series; dimensionless fields and voltage sources
// just step by 1.  Holding a button down repeats the step.
QWidget *EditDialog::makeValueStepperRow(int idx) {
    QWidget *row = new QWidget();
    QHBoxLayout *h = new QHBoxLayout(row);
    h->setContentsMargins(0, 0, 0, 0);
    h->setSpacing(2);
    auto makeButton = [&](const QString &text, int dir) {
        QPushButton *b = new QPushButton(text);
        b->setAutoDefault(false);
        b->setFixedWidth(32);
        b->setAutoRepeat(true);
        b->setAutoRepeatDelay(400);
        b->setAutoRepeatInterval(120);
        connect(b, &QPushButton::clicked, this, [this, idx, dir] { stepValue(idx, dir); });
        return b;
    };
    h->addWidget(makeButton(QString::fromUtf8("−"), -1));
    h->addWidget(fields[idx].widget);
    h->addWidget(makeButton("+", 1));
    return row;
}

void EditDialog::stepValue(int idx, int dir) {
    Field &f = fields[idx];
    double cur;
    try {
        cur = parseUnitsEi(f);
    } catch (std::exception &) {
        cur = f.ei.value;
    }
    bool linearStep = f.ei.dimensionless || f.ei.unitStep;
    double next = linearStep ? cur + dir : stepE12(cur, dir);
    // just update the displayed text, like typing a new value would; actually committing
    // it to the element happens on Apply/OK like normal, so Cancel still works correctly
    static_cast<QLineEdit *>(f.widget)->setText(QString::fromStdString(unitStringVal(&f.ei, next)));
}

double EditDialog::stepE12(double value, int dir) {
    const int n = sizeof(E12) / sizeof(E12[0]);
    if (value == 0)
        return dir > 0 ? E12[0] : -E12[0];
    double sgn = value < 0 ? -1 : 1;
    double av = std::abs(value);
    double decade = std::floor(jsmath::log10(av));
    int idx = 0;
    for (int i = 0; i < n; i++) {
        if (E12[i] * jsmath::pow(10, decade) <= av * 1.0000001)
            idx = i;
    }
    idx += dir;
    if (idx < 0) {
        idx = n - 1;
        decade--;
    } else if (idx >= n) {
        idx = 0;
        decade++;
    }
    return sgn * E12[idx] * jsmath::pow(10, decade);
}

std::string EditDialog::unitString(const EditInfo &ei) {
    if (VoltageElm *ve = dynamic_cast<VoltageElm *>(elm)) {
        if (ve->useRmsDisplay(ei.value))
            return unitStringVal(&ei, ei.value * ve->getRmsMultiplier()) + "rms";
    }
    return unitStringVal(&ei, ei.value);
}

std::string EditDialog::unitStringVal(const EditInfo *ei, double v) {
    double va = std::abs(v);
    if (ei != nullptr && ei->dimensionless) return noCommaFormat(v);
    if (!std::isfinite(va)) return noCommaFormat(v);
    if (v == 0) return "0";
    if (va < 1e-12) return noCommaFormat(v * 1e15) + "f";
    if (va < 1e-9) return noCommaFormat(v * 1e12) + "p";
    if (va < 1e-6) return noCommaFormat(v * 1e9) + "n";
    if (va < 1e-3) return noCommaFormat(v * 1e6) + "u";
    if (va < 1) return noCommaFormat(v * 1e3) + "m";
    if (va < 1e3) return noCommaFormat(v);
    if (va < 1e6) return noCommaFormat(v * 1e-3) + "k";
    if (va < 1e9) return noCommaFormat(v * 1e-6) + "M";
    return noCommaFormat(v * 1e-9) + "G";
}

static std::string trim(const std::string &s) {
    size_t a = s.find_first_not_of(" \t\r\n");
    if (a == std::string::npos)
        return "";
    size_t b = s.find_last_not_of(" \t\r\n");
    return s.substr(a, b - a + 1);
}

static bool endsWith(const std::string &s, const std::string &suffix) {
    return s.size() >= suffix.size() && s.compare(s.size() - suffix.size(), suffix.size(), suffix) == 0;
}

double EditDialog::parseUnitsEi(Field &f) {
    std::string s = trim(static_cast<QLineEdit *>(f.widget)->text().toStdString());
    if (VoltageElm *ve = dynamic_cast<VoltageElm *>(elm)) {
        if (endsWith(s, "rms")) {
            s = trim(s.substr(0, s.size() - 3));
            double rmsMult = ve->getRmsMultiplier();
            if (rmsMult > 0)
                return parseUnits(s) / rmsMult;
        }
    }
    return parseUnits(s);
}

double EditDialog::parseUnits(std::string s) {
    s = trim(s);
    double rmsMult = 1;
    if (endsWith(s, "rms")) {
        s = trim(s.substr(0, s.size() - 3));
        rmsMult = ROOT2;
    }
    QString qs = QString::fromStdString(s);
    // rewrite shorthand e.g. "2k2" -> "2.2k"
    qs.replace(QRegularExpression("([0-9]+)([pPnNuUmMkKgG])([0-9]+)"), "\\1.\\3\\2");
    // rewrite "meg" -> "M"
    qs.replace(QRegularExpression("[mM][eE][gG]$"), "M");
    s = qs.toStdString();

    // handle scientific notation before checking unit suffixes
    if (QRegularExpression("^-?[0-9]*\\.?[0-9]+[eE][+-]?[0-9]+$").match(qs).hasMatch())
        return parseFloatStrict(s) * rmsMult;

    if (s.empty())
        throw std::runtime_error("empty value");
    char uc = s.back();
    double mult = 1;
    switch (uc) {
    case 'f': case 'F': mult = 1e-15; break;
    case 'p': case 'P': mult = 1e-12; break;
    case 'n': case 'N': mult = 1e-9; break;
    case 'u': case 'U': mult = 1e-6; break;
    case 'm': mult = 1e-3; break;
    case 'k': case 'K': mult = 1e3; break;
    case 'M': mult = 1e6; break;
    case 'G': case 'g': mult = 1e9; break;
    }
    if (mult != 1)
        s = trim(s.substr(0, s.size() - 1));
    return parseFloatStrict(s) * mult * rmsMult;
}

void EditDialog::syncFromWidget(Field &f) {
    EditInfo &ei = f.ei;
    if (!f.widget)
        return;
    if (ei.choice)
        ei.choice->selectedIndex = static_cast<QComboBox *>(f.widget)->currentIndex();
    else if (ei.checkbox)
        ei.checkbox->state = static_cast<QCheckBox *>(f.widget)->isChecked();
    else if (ei.textArea)
        ei.textArea->value = static_cast<QPlainTextEdit *>(f.widget)->toPlainText().toStdString();
    else if (ei.text && ei.isColor)
        ei.textf = TextField{f.widget->property("color").toString().toStdString()};
    else if (QLineEdit *le = qobject_cast<QLineEdit *>(f.widget))
        ei.textf = TextField{le->text().toStdString()};
}

bool EditDialog::apply() {
    for (int i = 0; i != (int) fields.size(); i++) {
        Field &f = fields[i];
        EditInfo &ei = f.ei;
        syncFromWidget(f);
        ei.error.reset();
        if (ei.textf && !ei.text) {
            try {
                ei.value = parseUnitsEi(f);
            } catch (std::exception &) {
                // ignored
            }
        }
        if (ei.positive && ei.value <= 0)
            ei.setError("must be > 0");
        if (ei.nonNegative && ei.value < 0)
            ei.setError("must be >= 0");
        if (ei.integer && ei.value != std::trunc(ei.value))
            ei.setError("must be an integer");
        // choices and buttons are handled via itemStateChanged, not apply
        if (ei.button || ei.choice)
            continue;
        if (!ei.error)
            elm->setEditValue(i, ei);
        if (ei.error) {
            std::string field = ei.errorFieldName.value_or(ei.name);
            std::string msg = !field.empty() ? Locale::LS(field) + ": " + *ei.error : *ei.error;
            errorLabel->setText(QString::fromStdString(msg));
            errorLabel->show();
            return false;
        }
        // update slider if any
        if (CircuitElm *ce = dynamic_cast<CircuitElm *>(elm)) {
            Adjustable *adj = cframe->findAdjustable(ce, i);
            if (adj != nullptr)
                adj->setSliderValue(ei.value);
        }
    }
    errorLabel->hide();
    cframe->needAnalyze();
    return true;
}

void EditDialog::itemStateChanged(int idx) {
    if (building)
        return;
    Field &f = fields[idx];
    EditInfo &ei = f.ei;
    bool changed = false;
    bool applied = false;

    // for buttons and choices, apply pending text-field changes first
    if ((ei.button || ei.choice) && !ei.newDialog) {
        apply();
        applied = true;
    }

    syncFromWidget(fields[idx]);
    elm->setEditValue(idx, fields[idx].ei);
    if (fields[idx].ei.newDialog)
        changed = true;
    cframe->needAnalyze();

    if (changed) {
        if (!applied)
            apply();
        // rebuilding destroys the widget that sent this signal, so do it afterwards
        QTimer::singleShot(0, this, [this] { resetDialog(); });
    }
}

void EditDialog::resetDialog() {
    clearDialog();
    buildDialog();
    adjustSize();
}

void EditDialog::clearDialog() {
    // replace the columns holder wholesale; that deletes all the field widgets
    QLayout *main = layout();
    QWidget *fresh = new QWidget();
    QHBoxLayout *row = new QHBoxLayout(fresh);
    row->setContentsMargins(0, 0, 0, 0);
    row->setSpacing(10);
    row->setAlignment(Qt::AlignTop | Qt::AlignLeft);
    main->replaceWidget(colsHolder, fresh);
    colsHolder->deleteLater();
    colsHolder = fresh;
    colsRow = row;
    activeCol = addColumn();
    firstInput = nullptr;
    firstInputNumeric = false;
    fields.clear();
}

void EditDialog::keyPressEvent(QKeyEvent *e) {
    if (e->key() == Qt::Key_Escape) {
        closeDialog();
        return;
    }
    if ((e->key() == Qt::Key_Return || e->key() == Qt::Key_Enter) && closeOnEnter) {
        if (apply())
            closeDialog();
        return;
    }
    QDialog::keyPressEvent(e);
}

void EditDialog::closeDialog() {
    close();
}

void EditDialog::closeEvent(QCloseEvent *e) {
    cframe->editDialogClosed(this);
    QDialog::closeEvent(e);
}
