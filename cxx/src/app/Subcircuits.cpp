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

// the subcircuit UI: viewing a subcircuit's components (UIManager.pushSubcircuit() etc.),
// editing a model's circuit in place of the circuit (CirSim.pushContext() etc.), creating
// subcircuits, and the Draw menu's Subcircuits submenu

#include <QActionGroup>
#include <QMenu>

#include "CirSim.h"
#include "EditSubcircuitModelDialog.h"
#include "SubcircuitBar.h"
#include "core/CircuitElm.h"
#include "core/Locale.h"
#include "elements/SubcircuitElm.h"

void CirSim::pushSubcircuit(CircuitElm *cce, const std::vector<CircuitElm *> &allElms) {
    mouse.clearMouseElm();
    mouse.clearSelection();
    subcircuitStack.push_back(cce);
    subcircuitElmList = allElms;
    uiElmList = &subcircuitElmList;
    updateSubcircuitPath();
    needAnalyze();
    needCenter = true;
}

void CirSim::popSubcircuit() {
    if (subcircuitStack.empty())
        return;
    mouse.clearMouseElm();
    subcircuitStack.pop_back();
    if (subcircuitStack.empty()) {
        uiElmList = &elmList;
        subcircuitElmList.clear();
    } else {
        // re-enter the current top of stack
        subcircuitElmList = static_cast<SubcircuitElm *>(subcircuitStack.back())->buildDisplayElmList();
    }
    updateSubcircuitPath();
    needAnalyze();
    needCenter = true;
}

// (CircuitLoader.clearCircuit() in the TS version)
void CirSim::resetSubcircuitView() {
    if (subcircuitStack.empty())
        return;
    mouse.clearMouseElm();
    subcircuitStack.clear();
    subcircuitElmList.clear();
    uiElmList = &elmList;
    updateSubcircuitPath();
}

void CirSim::updateSubcircuitPath() {
    if (subcircuitBar == nullptr)
        return;
    if (subcircuitStack.empty()) {
        subcircuitBar->setSubcircuitPath(std::nullopt);
    } else {
        std::string sb = Locale::LS("Viewing: ");
        for (size_t i = 0; i < subcircuitStack.size(); i++) {
            if (i > 0)
                sb += " > ";
            sb += static_cast<SubcircuitElm *>(subcircuitStack[i])->modelName;
        }
        subcircuitBar->setSubcircuitPath(sb);
    }
}

void CirSim::updateContextButtons() {
    if (subcircuitBar != nullptr)
        subcircuitBar->setContextInfo(getEditingModelName());
}

void CirSim::pushContext(const std::string &modelName) {
    CircuitContext ctx;
    ctx.circuitDump = dumpCircuit();
    ctx.undoStack = std::move(undoManager->undoStack);
    ctx.redoStack = std::move(undoManager->redoStack);
    std::copy(transform, transform + 6, ctx.transform.begin());
    ctx.modelName = modelName;
    contextStack.push_back(std::move(ctx));
    undoManager->undoStack.clear();
    undoManager->redoStack.clear();
    undoManager->enableUndoRedo();
    updateContextButtons();
}

std::vector<SubcircuitModelRef> CirSim::popContextAndGetChangedModels() {
    if (contextStack.empty())
        return {};
    CircuitContext ctx = std::move(contextStack.back());
    contextStack.pop_back();
    readCircuit(ctx.circuitDump, CircuitLoader::RC_NO_CENTER);
    std::copy(ctx.transform.begin(), ctx.transform.end(), transform);
    undoManager->undoStack = std::move(ctx.undoStack);
    undoManager->redoStack = std::move(ctx.redoStack);
    undoManager->enableUndoRedo();
    updateContextButtons();
    return ctx.changedModels;
}

void CirSim::resetEditingContext() {
    contextStack.clear();
    updateContextButtons();
}

std::optional<std::string> CirSim::getEditingModelName() {
    if (contextStack.empty())
        return std::nullopt;
    return contextStack.back().modelName;
}

void CirSim::refreshModels(const std::string &modelName) {
    for (CircuitElm *ce : elmList) {
        if (ce->isSubcircuitElm() && static_cast<SubcircuitElm *>(ce)->modelName == modelName)
            ce->updateModels();  // (clears the model first, so it's re-fetched)
    }
    needAnalyze();
}

void CirSim::editSubcircuitPinLayout(const SubcircuitModelRef &model) {
    EditSubcircuitModelDialog *dlg = new EditSubcircuitModelDialog(this);
    dlg->setModel(model);
    dlg->createDialog();
}

void CirSim::doCreateSubcircuit() {
    // (the subcircuit is made from the whole circuit, not what we're viewing)
    resetSubcircuitView();
    EditSubcircuitModelDialog *dlg = new EditSubcircuitModelDialog(this);
    if (!dlg->createModel()) {
        delete dlg;
        return;
    }
    dlg->createDialog();
}

// the Draw menu's Subcircuits submenu, rebuilt when the model list changes
void CirSim::composeSubcircuitMenu() {
    if (subcircuitMenu == nullptr || lastSubcircuitMenuUpdate == SubcircuitModel::sequenceNumber)
        return;
    for (QAction *a : subcircuitMenu->actions())
        modeActions->removeAction(a);
    subcircuitMenu->clear();
    for (const SubcircuitModelRef &m : SubcircuitModel::getModelList()) {
        QAction *a = getClassCheckItem(subcircuitMenu, QString::fromStdString(Locale::LS("Add ") + m->name),
                                       QString::fromStdString("SubcircuitElm:" + m->name));
        if (a->data().toString() == mouseModeStr)
            a->setChecked(true);
    }
    lastSubcircuitMenuUpdate = SubcircuitModel::sequenceNumber;
}
