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

#include "SliderDialog.h"

#include <QCheckBox>
#include <QComboBox>
#include <QHBoxLayout>
#include <QLabel>
#include <QLineEdit>
#include <QPushButton>
#include <QVBoxLayout>
#include <regex>

#include "CirSim.h"
#include "EditDialog.h"
#include "core/Adjustable.h"
#include "core/CircuitElm.h"
#include "core/Locale.h"
#include "core/SimulationManager.h"

static QString LS(const std::string &s) { return QString::fromStdString(Locale::LS(s)); }

SliderDialog::SliderDialog(CircuitElm *ce, CirSim *f) : QDialog(f), elm(ce), sim(f) {
    setWindowTitle(LS("Add Sliders"));
    setMinimumWidth(300);
    QVBoxLayout *v = new QVBoxLayout(this);

    QLabel *title = new QLabel(LS("Add Sliders"));
    QFont bold = title->font();
    bold.setBold(true);
    title->setFont(bold);
    v->addWidget(title);

    content = new QWidget();
    contentLayout = new QVBoxLayout(content);
    contentLayout->setContentsMargins(0, 0, 0, 0);
    v->addWidget(content);

    QHBoxLayout *hp = new QHBoxLayout();
    QPushButton *applyButton = new QPushButton(LS("Apply"));
    connect(applyButton, &QPushButton::clicked, this, [this] { apply(); });
    QPushButton *okButton = new QPushButton(LS("OK"));
    connect(okButton, &QPushButton::clicked, this, [this] {
        apply();
        accept();
    });
    QPushButton *cancelButton = new QPushButton(LS("Cancel"));
    connect(cancelButton, &QPushButton::clicked, this, &QDialog::reject);
    hp->addWidget(applyButton);
    hp->addWidget(okButton);
    hp->addStretch(1);
    hp->addWidget(cancelButton);
    v->addLayout(hp);

    buildDialog();
}

static QLabel *makeLabel(const std::string &text) {
    QLabel *l = new QLabel(LS(text));
    QFont f = l->font();
    f.setPointSizeF(f.pointSizeF() * .9);
    l->setFont(f);
    return l;
}

void SliderDialog::buildDialog() {
    rows.clear();
    for (int i = 0;; i++) {
        rows.emplace_back();
        rows[i].ei = elm->getEditInfo(i);
        if (!rows[i].ei)
            break;
        EditInfo &ei = *rows[i].ei;
        if (!ei.canCreateAdjustable())
            continue;
        Adjustable *adj = findAdjustable(i);

        // remove HTML tags from name
        std::string name = std::regex_replace(ei.name, std::regex("<[^>]*>"), "");

        QWidget *row = new QWidget();
        QVBoxLayout *rl = new QVBoxLayout(row);
        rl->setContentsMargins(0, 4, 0, 0);
        rl->setSpacing(2);

        // checkbox to enable/disable slider for this item
        QCheckBox *cb = new QCheckBox(LS(name));
        cb->setChecked(adj != nullptr);
        connect(cb, &QCheckBox::toggled, this, [this, i](bool checked) { checkboxChanged(i, checked); });
        rows[i].checkbox = cb;
        rl->addWidget(cb);

        if (adj != nullptr) {
            if (!adj->sliderBeingShared()) {
                // choice for slider sharing
                QComboBox *sel = new QComboBox();
                sel->addItem(LS("New Slider"));
                int ct = 0;
                for (Adjustable *adji : sim->adjustables) {
                    // don't share with an object sharing with someone else
                    if (adji->sharedSlider != nullptr)
                        break;
                    // don't share with ourselves
                    if (adji == adj)
                        continue;
                    sel->addItem(LS("Share Slider: ") + QString::fromStdString(adji->sliderText));
                    ct++;
                    if (adji == adj->sharedSlider)
                        sel->setCurrentIndex(ct);
                }
                connect(sel, &QComboBox::currentIndexChanged, this, [this, i](int idx) { choiceChanged(i, idx); });
                rl->addWidget(sel);
            }

            // min/max/step/log/label inputs
            auto addBox = [&](const std::string &label, const std::string &value) {
                rl->addWidget(makeLabel(label));
                QLineEdit *box = new QLineEdit(QString::fromStdString(value));
                rl->addWidget(box);
                return box;
            };
            rows[i].minBox = addBox("Min Value", EditDialog::unitStringVal(&ei, adj->minValue));
            rows[i].maxBox = addBox("Max Value", EditDialog::unitStringVal(&ei, adj->maxValue));
            rows[i].stepBox = addBox("Step (0=continuous)", EditDialog::unitStringVal(&ei, adj->sliderStep));

            QCheckBox *logCb = new QCheckBox(LS("Logarithmic"));
            logCb->setChecked(adj->logarithmic);
            rows[i].logCheckbox = logCb;
            rl->addWidget(logCb);

            if (adj->sharedSlider == nullptr)
                rows[i].labelBox = addBox("Label", adj->sliderText);
        }

        contentLayout->addWidget(row);
    }
    einfocount = (int) rows.size() - 1;
    adjustSize();
}

Adjustable *SliderDialog::findAdjustable(int item) {
    return sim->findAdjustable(elm, item);
}

bool SliderDialog::apply() {
    for (int i = 0; i != einfocount; i++) {
        Adjustable *adj = findAdjustable(i);
        if (adj == nullptr)
            continue;
        Row &r = rows[i];
        EditInfo &ei = *r.ei;
        try {
            adj->sliderText = r.labelBox == nullptr ? "" : r.labelBox->text().toStdString();
            if (adj->slider != nullptr) {
                adj->slider->label = adj->sliderText;
                adj->slider->draw();
            }
            if (r.minBox != nullptr)
                adj->minValue = EditDialog::parseUnits(r.minBox->text().toStdString());
            if (r.maxBox != nullptr)
                adj->maxValue = EditDialog::parseUnits(r.maxBox->text().toStdString());
            if (r.stepBox != nullptr) {
                double d = EditDialog::parseUnits(r.stepBox->text().toStdString());
                adj->sliderStep = d;
                if (adj->slider != nullptr && adj->maxValue != adj->minValue)
                    adj->slider->setStepSize(d * 100 / (adj->maxValue - adj->minValue));
            }
            if (r.logCheckbox != nullptr)
                adj->logarithmic = r.logCheckbox->isChecked();
            // guard: logarithmic requires minValue > 0
            if (adj->logarithmic && adj->minValue <= 0)
                adj->logarithmic = false;
            adj->setSliderValue(ei.value);
        } catch (std::exception &e) {
            SimulationManager::console(e.what());
        }
    }
    return true;
}

void SliderDialog::checkboxChanged(int i, bool checked) {
    if (!rows[i].ei)
        return;
    EditInfo ei = *rows[i].ei;
    apply();
    if (checked) {
        Adjustable *adj = new Adjustable(elm, i);
        adj->sliderText = std::regex_replace(ei.name, std::regex(" \\(.*\\)$"), "");
        adj->createSliderWithValue(sim, ei.value);
        sim->adjustables.push_back(adj);
    } else {
        Adjustable *adj = findAdjustable(i);
        if (adj != nullptr) {
            adj->deleteSlider(sim);
            sim->adjustables.erase(std::find(sim->adjustables.begin(), sim->adjustables.end(), adj));
            sim->retiredAdjustables.push_back(adj);  // others may share it
        }
    }
    Adjustable::reorderAdjustables(sim);
    // rebuilding deletes the widget that sent this signal, so wait until it returns
    QMetaObject::invokeMethod(this, [this] {
        clearDialog();
        buildDialog();
    }, Qt::QueuedConnection);
}

void SliderDialog::choiceChanged(int i, int selectedIndex) {
    if (!rows[i].ei)
        return;
    EditInfo ei = *rows[i].ei;
    apply();
    Adjustable *adj = findAdjustable(i);
    if (adj != nullptr) {
        if (selectedIndex == 0) {
            // new slider
            adj->sharedSlider = nullptr;
            if (adj->sliderText.empty())
                adj->sliderText = std::regex_replace(ei.name, std::regex(" \\(.*\\)$"), "");
            adj->createSliderWithValue(sim, ei.value);
        } else {
            int ct = 0;
            for (Adjustable *adji : sim->adjustables) {
                if (adji->sharedSlider != nullptr)
                    break;
                if (adji == adj)
                    continue;
                if (++ct == selectedIndex) {
                    adj->sharedSlider = adji;
                    adj->deleteSlider(sim);
                }
            }
        }
    }
    Adjustable::reorderAdjustables(sim);
    QMetaObject::invokeMethod(this, [this] {
        clearDialog();
        buildDialog();
    }, Qt::QueuedConnection);
}

void SliderDialog::clearDialog() {
    while (QLayoutItem *item = contentLayout->takeAt(0)) {
        delete item->widget();
        delete item;
    }
    rows.clear();
}
