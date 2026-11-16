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

#include "ComponentSearch.h"

#include <QKeyEvent>
#include <QListWidget>
#include <QStyledItemDelegate>
#include <QTimer>

#include "CirSim.h"
#include "CommandPalette.h"
#include "CommandPaletteRegistry.h"
#include "core/Locale.h"

static QString LSq(const char *s) { return QString::fromStdString(Locale::LS(s)); }

ComponentSearch::ComponentSearch(CirSim *a) : app(a) {
    setPlaceholderText(LSq("Search components..."));
    setAccessibleName(LSq("Search components..."));
    setClearButtonEnabled(true);
    setFixedWidth(200);
    setStyleSheet("QLineEdit { border: 1px solid #ccc; border-radius: 3px; padding: 3px 6px; background: #fff;"
                  "  color: #000; }");

    list = new QListWidget(nullptr);
    list->setWindowFlags(Qt::ToolTip | Qt::FramelessWindowHint);
    list->setAttribute(Qt::WA_ShowWithoutActivating);
    list->setFocusPolicy(Qt::NoFocus);
    list->setMouseTracking(true);
    list->setStyleSheet("QListWidget { border: 1px solid #ccc; background: #fff; outline: none; }");
    list->setItemDelegate(createPaletteItemDelegate(list, LIST_WIDTH));
    list->setHorizontalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
    connect(list, &QListWidget::itemClicked, this, [this](QListWidgetItem *item) {
        select(item->data(Qt::UserRole + 100).toInt());
    });
    connect(this, &QLineEdit::textEdited, this, [this] { refresh(); });
    // (the clear button changes the text without textEdited)
    connect(this, &QLineEdit::textChanged, this, [this](const QString &t) {
        if (t.isEmpty())
            hideList();
    });
}

ComponentSearch::~ComponentSearch() {
    delete list;
}

void ComponentSearch::focusInEvent(QFocusEvent *e) {
    QLineEdit::focusInEvent(e);
    refresh();
}

void ComponentSearch::focusOutEvent(QFocusEvent *e) {
    QLineEdit::focusOutEvent(e);
    // Delay so a click on a result still lands before the list is hidden.
    QTimer::singleShot(150, this, [this] {
        if (!hasFocus())
            hideList();
    });
}

void ComponentSearch::keyPressEvent(QKeyEvent *e) {
    switch (e->key()) {
    case Qt::Key_Down:
        moveSelection(1);
        return;
    case Qt::Key_Up:
        moveSelection(-1);
        return;
    case Qt::Key_Return:
    case Qt::Key_Enter:
        select(selected);
        return;
    case Qt::Key_Escape:
        clear();
        return;
    default:
        QLineEdit::keyPressEvent(e);
    }
}

void ComponentSearch::refresh() {
    QString query = text().trimmed();
    if (query.isEmpty()) {
        hideList();
        return;
    }
    results = CommandPaletteRegistry::searchComponents(query, MAX_RESULTS);
    selected = 0;
    render(query);
}

void ComponentSearch::render(const QString &query) {
    list->clear();
    if (results.empty()) {
        QListWidgetItem *item = new QListWidgetItem(LSq("No matching components"));
        item->setData(PALETTE_ROLE_HTML, "<i style='color:#888'>" + LSq("No matching components").toHtmlEscaped() + "</i>");
        item->setFlags(Qt::NoItemFlags);
        list->addItem(item);
    }
    for (size_t i = 0; i < results.size(); i++) {
        PaletteCommand *cmd = results[i];
        // Component entries carry the plain element name, no "Mode: " prefix like the
        // command palette.  (The labels and hints are translated already.)
        QListWidgetItem *item = new QListWidgetItem(cmd->label);
        item->setData(PALETTE_ROLE_HTML, CommandPaletteRegistry::highlightMatch(cmd->label, query));
        if (!cmd->hint.isEmpty())
            item->setData(PALETTE_ROLE_HINT, cmd->hint);
        item->setData(Qt::UserRole + 100, (int) i);
        list->addItem(item);
    }
    if (!results.empty())
        list->setCurrentRow(selected);
    int h = 0;
    for (int i = 0; i < list->count(); i++)
        h += list->sizeHintForRow(i);
    list->setFixedSize(std::max(LIST_WIDTH, width()), h + 2 * list->frameWidth());
    // right-aligned with the field, below it
    QPoint p = mapToGlobal(QPoint(width() - list->width(), height() + 2));
    list->move(p);
    list->show();
    list->raise();
}

void ComponentSearch::moveSelection(int delta) {
    if (results.empty())
        return;
    selected += delta;
    if (selected < 0)
        selected = (int) results.size() - 1;
    if (selected >= (int) results.size())
        selected = 0;
    list->setCurrentRow(selected);
    list->scrollToItem(list->currentItem());
}

void ComponentSearch::select(int index) {
    if (index < 0 || index >= (int) results.size())
        return;
    PaletteCommand *cmd = results[index];
    clear();
    CommandPalette::execute(cmd);
}

void ComponentSearch::clear() {
    QLineEdit::clear();
    hideList();
    clearFocus();
    app->focusCanvas();
}

void ComponentSearch::hideList() {
    list->hide();
    list->clear();
    results.clear();
    selected = 0;
}
