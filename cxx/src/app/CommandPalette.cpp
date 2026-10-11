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

#include "CommandPalette.h"

#include <QAbstractTextDocumentLayout>
#include <QAction>
#include <QKeyEvent>
#include <QLineEdit>
#include <QListWidget>
#include <QMenu>
#include <QPainter>
#include <QStyledItemDelegate>
#include <QTextDocument>
#include <QTimer>
#include <QVBoxLayout>

#include "CirSim.h"
#include "CommandPaletteHistory.h"
#include "CommandPaletteRegistry.h"
#include "core/Locale.h"

static QString LSq(const QString &s) { return QString::fromStdString(Locale::LS(s.toStdString())); }

enum {
    ROLE_SECTION = Qt::UserRole,  // a section label ("Recent"), not a command
    ROLE_HTML,                    // the label, with the matched part in <b>
    ROLE_HINT,
};

// draws the rows the way style.css draws .command-palette-item and friends
class PaletteItemDelegate : public QStyledItemDelegate {
public:
    using QStyledItemDelegate::QStyledItemDelegate;

    void paint(QPainter *p, const QStyleOptionViewItem &opt, const QModelIndex &index) const override {
        p->save();
        QRect r = opt.rect.adjusted(14, 0, -14, 0);
        if (index.data(ROLE_SECTION).toBool()) {
            QFont f = opt.font;
            f.setPixelSize(11);
            f.setWeight(QFont::DemiBold);
            f.setLetterSpacing(QFont::PercentageSpacing, 105);
            p->setFont(f);
            p->setPen(QColor("#888"));
            p->drawText(r.adjusted(0, 6, 0, -4), Qt::AlignLeft | Qt::AlignVCenter,
                        index.data(Qt::DisplayRole).toString().toUpper());
            p->restore();
            return;
        }
        bool selected = opt.state & QStyle::State_Selected;
        if (selected)
            p->fillRect(opt.rect, QColor("#007bff"));
        else if (opt.state & QStyle::State_MouseOver)
            p->fillRect(opt.rect, QColor("#f0f0f0"));

        QString hint = index.data(ROLE_HINT).toString();
        int hintWidth = 0;
        if (!hint.isEmpty()) {
            QFont f = opt.font;
            f.setPixelSize(11);
            p->setFont(f);
            p->setPen(selected ? QColor(255, 255, 255, 191) : QColor("#999"));
            hintWidth = QFontMetrics(f).horizontalAdvance(hint) + 8;
            p->drawText(r, Qt::AlignRight | Qt::AlignVCenter, hint);
        }

        QTextDocument doc;
        QFont f = opt.font;
        f.setPixelSize(13);
        doc.setDefaultFont(f);
        doc.setDocumentMargin(0);
        doc.setHtml(index.data(ROLE_HTML).toString());
        QAbstractTextDocumentLayout::PaintContext ctx;
        ctx.palette.setColor(QPalette::Text, selected ? QColor(Qt::white) : QColor("#333"));
        QRect labelRect = r.adjusted(0, 0, -hintWidth, 0);
        p->setClipRect(labelRect);
        p->translate(labelRect.left(), labelRect.top() + (labelRect.height() - doc.size().height()) / 2);
        doc.documentLayout()->draw(p, ctx);
        p->restore();
    }

    QSize sizeHint(const QStyleOptionViewItem &, const QModelIndex &index) const override {
        return QSize(CommandPalette::WIDTH, index.data(ROLE_SECTION).toBool() ? 24 : 32);
    }
};

CommandPalette::CommandPalette(CirSim *s) : QFrame(s, Qt::Popup | Qt::FramelessWindowHint), sim(s) {
    setAttribute(Qt::WA_DeleteOnClose);
    setObjectName("commandPalette");
    setStyleSheet("QFrame#commandPalette { background: #fff; border: 1px solid #ccc; }"
                  "QLineEdit { border: none; border-bottom: 1px solid #e0e0e0; padding: 12px 14px;"
                  "  font-size: 14px; background: #fff; color: #000; }"
                  "QListWidget { border: none; background: #fff; outline: none; }");
    setFixedWidth(WIDTH);

    QVBoxLayout *layout = new QVBoxLayout(this);
    layout->setContentsMargins(1, 1, 1, 1);
    layout->setSpacing(0);

    filterBox = new QLineEdit();
    filterBox->setPlaceholderText(LSq("Type a command..."));
    filterBox->setAttribute(Qt::WA_MacShowFocusRect, false);
    filterBox->installEventFilter(this);
    layout->addWidget(filterBox);

    listPanel = new QListWidget();
    listPanel->setItemDelegate(new PaletteItemDelegate(listPanel));
    listPanel->setFocusPolicy(Qt::NoFocus);
    listPanel->setHorizontalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
    listPanel->setSelectionMode(QAbstractItemView::SingleSelection);
    listPanel->setMouseTracking(true);
    layout->addWidget(listPanel);

    connect(filterBox, &QLineEdit::textChanged, this, [this] { onFilterTextChanged(); });
    connect(listPanel, &QListWidget::itemClicked, this, [this](QListWidgetItem *item) {
        auto it = std::find(commandRows.begin(), commandRows.end(), listPanel->row(item));
        if (it == commandRows.end())
            return;
        selectedIndex = (int) (it - commandRows.begin());
        executeSelected();
    });
}

void CommandPalette::show() {
    lastQuery.clear();
    filterBox->clear();
    refreshList();
    // centered horizontally, a fifth of the way down the window
    QPoint topLeft = sim->mapToGlobal(QPoint(std::max(0, (sim->width() - WIDTH) / 2), sim->height() / 5));
    move(topLeft);
    QFrame::show();
    filterBox->setFocus();
}

// Arrow keys, Enter and Escape go to the filter box, which has the focus
bool CommandPalette::eventFilter(QObject *o, QEvent *e) {
    if (o == filterBox && e->type() == QEvent::KeyPress) {
        QKeyEvent *ke = static_cast<QKeyEvent *>(e);
        switch (ke->key()) {
        case Qt::Key_Down:
            moveSelection(1);
            return true;
        case Qt::Key_Up:
            moveSelection(-1);
            return true;
        case Qt::Key_Return:
        case Qt::Key_Enter:
            executeSelected();
            return true;
        case Qt::Key_Escape:
            close();
            return true;
        default:
            break;
        }
    }
    return QFrame::eventFilter(o, e);
}

void CommandPalette::onFilterTextChanged() {
    QString query = filterBox->text();
    if (query == lastQuery)
        return;
    lastQuery = query;
    refreshList();
}

void CommandPalette::refreshList() {
    QString query = filterBox->text();
    listPanel->clear();
    visibleCommands.clear();
    commandRows.clear();
    selectedIndex = 0;

    if (query.trimmed().isEmpty()) {
        std::vector<PaletteCommand *> recent = CommandPaletteRegistry::recentCommands();
        if (!recent.empty()) {
            addSectionLabel(LSq("Recent"));
            for (PaletteCommand *cmd : recent)
                addCommandRow(cmd, query);
        }
    } else {
        for (PaletteCommand *cmd : CommandPaletteRegistry::search(query, MAX_RESULTS))
            addCommandRow(cmd, query);
    }
    updateSelectionHighlight();
    fitList();
}

void CommandPalette::addSectionLabel(const QString &text) {
    QListWidgetItem *item = new QListWidgetItem(text);
    item->setData(ROLE_SECTION, true);
    item->setFlags(Qt::NoItemFlags);
    listPanel->addItem(item);
}

void CommandPalette::addCommandRow(PaletteCommand *cmd, const QString &query) {
    visibleCommands.push_back(cmd);
    commandRows.push_back(listPanel->count());
    QListWidgetItem *item = new QListWidgetItem(cmd->label);
    // (the labels and hints are translated already, since they come from the menus)
    item->setData(ROLE_HTML, CommandPaletteRegistry::highlightMatch(cmd->label, query));
    if (!cmd->hint.isEmpty())
        item->setData(ROLE_HINT, cmd->hint);
    listPanel->addItem(item);
}

// shrink the list to its rows, up to MAX_LIST_HEIGHT
void CommandPalette::fitList() {
    int h = 0;
    for (int i = 0; i < listPanel->count(); i++)
        h += listPanel->sizeHintForRow(i);
    listPanel->setFixedHeight(std::min(h, MAX_LIST_HEIGHT));
    listPanel->setVisible(h > 0);
    adjustSize();
}

void CommandPalette::moveSelection(int delta) {
    if (visibleCommands.empty())
        return;
    selectedIndex += delta;
    if (selectedIndex < 0)
        selectedIndex = (int) visibleCommands.size() - 1;
    if (selectedIndex >= (int) visibleCommands.size())
        selectedIndex = 0;
    updateSelectionHighlight();
}

void CommandPalette::updateSelectionHighlight() {
    if (visibleCommands.empty())
        return;
    QListWidgetItem *item = listPanel->item(commandRows[selectedIndex]);
    listPanel->setCurrentItem(item);
    // keep the "Recent" label in view when the first row is selected
    listPanel->scrollToItem(selectedIndex == 0 ? listPanel->item(0) : item);
}

void CommandPalette::executeSelected() {
    if (visibleCommands.empty() || selectedIndex < 0 || selectedIndex >= (int) visibleCommands.size())
        return;
    PaletteCommand *cmd = visibleCommands[selectedIndex];
    // Close before running the command, and run it once the popup is gone, so it
    // doesn't get in the way of the dialogs some commands open (Open File, Save As, etc.).
    CirSim *app = sim;
    close();
    QTimer::singleShot(0, app, [cmd] { execute(cmd); });
}

void CommandPalette::execute(PaletteCommand *cmd) {
    if (cmd->custom) {
        cmd->custom();
    } else if (cmd->action) {
        // The menus refresh their check marks and enabled items when they open, so do
        // that first; then the item does just what it would from the menu.
        for (QObject *o : cmd->action->associatedObjects())
            if (QMenu *m = qobject_cast<QMenu *>(o))
                emit m->aboutToShow();
        if (!cmd->action->isEnabled())
            return;
        cmd->action->trigger();
    }
    CommandPaletteHistory::record(cmd->id);
}
