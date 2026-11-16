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

#include "SubcircuitBar.h"

#include <QHBoxLayout>
#include <QLabel>
#include <QPushButton>

#include "CirSim.h"
#include "EditSubcircuitModelDialog.h"
#include "core/Locale.h"
#include "core/SubcircuitModel.h"

static QString LS(const char *s) { return QString::fromStdString(Locale::LS(s)); }

SubcircuitBar::SubcircuitBar(CirSim *a) : QWidget(a), app(a) {
    setAutoFillBackground(true);
    setStyleSheet("SubcircuitBar { background: rgb(248,248,248); border-bottom: 1px solid #ccc; }"
                  "QLabel { font-size: 14px; color: #333; padding-right: 10px; }");
    setAttribute(Qt::WA_StyledBackground);
    QHBoxLayout *h = new QHBoxLayout(this);
    h->setContentsMargins(8, 4, 8, 4);

    // subcircuit path label
    subcircuitLabel = new QLabel();
    subcircuitLabel->hide();
    h->addWidget(subcircuitLabel);

    // context editing label
    contextLabel = new QLabel();
    contextLabel->hide();
    h->addWidget(contextLabel);

    // back button (serves both subcircuit back and context back)
    backButton = new QPushButton(LS("◀ Back"));
    connect(backButton, &QPushButton::clicked, this, [this] {
        if (!app->subcircuitStack.empty())
            app->popSubcircuit();
        else
            app->popContext();
    });
    backButton->hide();
    h->addWidget(backButton);

    contextSaveButton = new QPushButton(LS("Save"));
    connect(contextSaveButton, &QPushButton::clicked, this, [this] { saveContext(false); });
    contextSaveButton->hide();
    h->addWidget(contextSaveButton);

    contextSaveCopyButton = new QPushButton(LS("Save Copy"));
    connect(contextSaveCopyButton, &QPushButton::clicked, this, [this] { saveContext(true); });
    contextSaveCopyButton->hide();
    h->addWidget(contextSaveCopyButton);
    h->addStretch(1);

    // start hidden
    hide();
}

// Save: replace the model being edited.  Save Copy: save it under a new name.
void SubcircuitBar::saveContext(bool copy) {
    std::string modelName = app->getEditingModelName().value_or("");
    EditSubcircuitModelDialog *dlg = new EditSubcircuitModelDialog(app);
    if (!dlg->createModel()) {
        delete dlg;
        return;
    }
    // Look up existing model before setName() inserts the new one under the same key
    SubcircuitModelRef existingModel = SubcircuitModel::getModelWithName(modelName);
    if (!copy)
        dlg->model->setName(modelName);
    if (existingModel != nullptr)
        EditSubcircuitModelDialog::preservePinLayout(*dlg->model, *existingModel);
    dlg->popContext = true;
    dlg->createDialog();
}

void SubcircuitBar::setSubcircuitPath(const std::optional<std::string> &path) {
    hasSubcircuit = path.has_value();
    subcircuitLabel->setVisible(hasSubcircuit);
    if (hasSubcircuit)
        subcircuitLabel->setText(QString::fromStdString(*path));
    updateVisibility();
}

void SubcircuitBar::setContextInfo(const std::optional<std::string> &modelName) {
    hasContext = modelName.has_value();
    contextLabel->setVisible(hasContext);
    contextSaveButton->setVisible(hasContext);
    contextSaveCopyButton->setVisible(hasContext);
    if (hasContext)
        contextLabel->setText(LS("Editing: ") + QString::fromStdString(*modelName));
    updateVisibility();
}

void SubcircuitBar::updateVisibility() {
    bool show = hasSubcircuit || hasContext;
    setVisible(show);
    backButton->setVisible(show);
}
