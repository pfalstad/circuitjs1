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

#include "ChipPinEditor.h"

#include <QHBoxLayout>
#include <QLabel>
#include <QMouseEvent>
#include <QPainter>
#include <QPushButton>
#include <algorithm>
#include <climits>
#include <cmath>
#include <set>

#include "CirSim.h"
#include "QtGraphics.h"
#include "core/CircuitElm.h"
#include "core/Locale.h"

static QString LS(const char *s) { return QString::fromStdString(Locale::LS(s)); }

ChipPinEditor::ChipPinEditor(CirSim *a, std::vector<PinLayoutEntry> &e, int &sx, int &sy,
                             ChipPinEditorOptions opts)
    : app(a), entries(e), sizeX(sx), sizeY(sy), options(std::move(opts)) {
    setFixedSize(400, 400);
    setMouseTracking(true);

    chip.reset(SubcircuitChipElm::create(50, 50));
    chip->x2 = 200;
    chip->y2 = 50;
    createPins();
}

QLayout *ChipPinEditor::createSizeControls() {
    QHBoxLayout *hp = new QHBoxLayout();
    auto addBtn = [&](const QString &label, int dx, int dy) {
        QPushButton *b = new QPushButton(label);
        b->setAutoDefault(false);
        connect(b, &QPushButton::clicked, this, [this, dx, dy] { adjustChipSize(dx, dy); });
        hp->addWidget(b);
    };
    hp->addWidget(new QLabel(LS("Width")));
    addBtn("+", 1, 0);
    addBtn("-", -1, 0);
    hp->addSpacing(12);
    hp->addWidget(new QLabel(LS("Height")));
    addBtn("+", 0, 1);
    addBtn("-", 0, -1);
    hp->addStretch(1);
    return hp;
}

void ChipPinEditor::createPins() {
    postCount = (int) entries.size();
    chip->allocPins(postCount);
    chip->sizeX = sizeX;
    chip->sizeY = sizeY;
    chip->allocNodes();
    for (int i = 0; i < postCount; i++) {
        const PinLayoutEntry &pin = entries[i];
        chip->setPin(i, pin.pos, pin.side, pin.name);
        chip->pins[i].busWidth = pin.busWidth;
        chip->pins[i].busZ = pin.busZ;
        if (options.decoratePin)
            options.decoratePin(chip->pins[i], i);
        if (isPinSelected(i))
            chip->pins[i].selected = true;
    }
    chip->setPoints();

    // (the TS version does this in draw(); the mouse handlers need it before the next paint)
    const Rectangle &bb = chip->boundingBox;
    double scalew = 400.0 / (bb.width + bb.x * 2);
    double scaleh = 400.0 / (bb.height + bb.y * 2);
    scale = 1 / std::min(scalew, scaleh);
}

void ChipPinEditor::paintEvent(QPaintEvent *) {
    QPainter painter(this);
    QtGraphics g(painter);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.setColor(app->getBackgroundColor());
    g.fillRect(0, 0, width(), height());
    g.setTransform(1 / scale, 0, 0, 1 / scale, 0, 0);
    g.setFont(CircuitElm::unitsFont);
    g.setLineCap(Graphics::CAP_ROUND);
    chip->setLabel(options.getLabel ? options.getLabel() : std::nullopt);
    chip->draw(g);

    if (rubberBand) {
        int x1 = std::min(rubberBandX1, rubberBandX2);
        int y1 = std::min(rubberBandY1, rubberBandY2);
        int w = std::abs(rubberBandX2 - rubberBandX1);
        int h = std::abs(rubberBandY2 - rubberBandY1);
        painter.setTransform(QTransform());
        painter.fillRect(QRectF(x1, y1, w, h), QColor(68, 136, 255, 38));
        painter.setPen(QPen(QColor(0x44, 0x88, 0xff), 1));
        painter.setBrush(Qt::NoBrush);
        painter.drawRect(QRectF(x1 + .5, y1 + .5, w, h));
    }
}

void ChipPinEditor::mousePressEvent(QMouseEvent *e) {
    if (e->button() == Qt::LeftButton)
        onMouseDown((int) e->position().x(), (int) e->position().y(), e->modifiers() & Qt::ShiftModifier);
}

void ChipPinEditor::mouseMoveEvent(QMouseEvent *e) {
    mouseMoved((int) e->position().x(), (int) e->position().y());
}

void ChipPinEditor::mouseReleaseEvent(QMouseEvent *) {
    onMouseUp();
}

void ChipPinEditor::adjustChipSize(int dx, int dy) {
    if (dx < 0) {
        for (int i = 0; i < postCount; i++) {
            const Pin &p = chip->pins[i];
            if (p.busZ > 0)
                continue;
            if ((p.side == ChipElm::SIDE_N || p.side == ChipElm::SIDE_S) && p.pos >= chip->sizeX + dx)
                return;
        }
    }
    if (dy < 0) {
        bool needShift = false;
        for (int i = 0; i < postCount; i++) {
            const Pin &p = chip->pins[i];
            if (p.busZ > 0)
                continue;
            if ((p.side == ChipElm::SIDE_E || p.side == ChipElm::SIDE_W) && p.pos >= chip->sizeY + dy) {
                needShift = true;
                break;
            }
        }
        if (needShift) {
            for (int i = 0; i < postCount; i++) {
                const Pin &p = chip->pins[i];
                if (p.busZ > 0)
                    continue;
                if ((p.side == ChipElm::SIDE_E || p.side == ChipElm::SIDE_W) && p.pos == 0)
                    return;
            }
            for (PinLayoutEntry &pe : entries)
                if (pe.side == ChipElm::SIDE_E || pe.side == ChipElm::SIDE_W)
                    pe.pos -= 1;
        }
    }
    if (chip->sizeX + dx < 1 || chip->sizeY + dy < 1)
        return;
    sizeX += dx;
    sizeY += dy;
    createPins();
    draw();
}

int ChipPinEditor::findNearestPin(int x, int y) {
    double bestDist = 20;
    int best = -1;
    for (int i = 0; i < postCount; i++) {
        const Pin &p = chip->pins[i];
        if (p.busZ > 0)
            continue;
        double dx = x * scale - p.textloc.x;
        double dy = y * scale - p.textloc.y;
        double dist = std::hypot(dx, dy);
        if (dist < bestDist) {
            bestDist = dist;
            best = i;
        }
    }
    return best;
}

void ChipPinEditor::updatePinHighlight() {
    for (int i = 0; i < postCount; i++)
        chip->pins[i].selected = isPinSelected(i);
}

bool ChipPinEditor::isPinSelected(int i) const {
    return std::find(selectedPins.begin(), selectedPins.end(), i) != selectedPins.end();
}

void ChipPinEditor::selectPin(int i) {
    if (!isPinSelected(i))
        selectedPins.push_back(i);
}

void ChipPinEditor::deselectPin(int i) {
    selectedPins.erase(std::remove(selectedPins.begin(), selectedPins.end(), i), selectedPins.end());
}

int ChipPinEditor::firstSelectedSide() const {
    return selectedPins.empty() ? -1 : entries[selectedPins[0]].side;
}

// is pin i's label inside the rubber band (in canvas coordinates)?
bool ChipPinEditor::inRubberBand(int i, int x1, int y1, int x2, int y2) const {
    int px = (int) (chip->pins[i].textloc.x / scale);
    int py = (int) (chip->pins[i].textloc.y / scale);
    return px >= x1 && px <= x2 && py >= y1 && py <= y2;
}

void ChipPinEditor::onMouseUp() {
    if (rubberBand) {
        int x1 = std::min(rubberBandX1, rubberBandX2);
        int x2 = std::max(rubberBandX1, rubberBandX2);
        int y1 = std::min(rubberBandY1, rubberBandY2);
        int y2 = std::max(rubberBandY1, rubberBandY2);
        int selSide = firstSelectedSide();
        for (int i = 0; i < postCount; i++) {
            if (chip->pins[i].busZ > 0)
                continue;
            if (inRubberBand(i, x1, y1, x2, y2)) {
                if (selSide == -1)
                    selSide = entries[i].side;
                if (entries[i].side == selSide)
                    selectPin(i);
            }
        }
        rubberBand = false;
        updatePinHighlight();
        draw();
    }
    dragging = false;
}

void ChipPinEditor::mouseMoved(int x, int y) {
    if (rubberBand) {
        rubberBandX2 = x;
        rubberBandY2 = y;
        int x1 = std::min(rubberBandX1, rubberBandX2);
        int x2 = std::max(rubberBandX1, rubberBandX2);
        int y1 = std::min(rubberBandY1, rubberBandY2);
        int y2 = std::max(rubberBandY1, rubberBandY2);
        int selSide2 = firstSelectedSide();
        if (selSide2 == -1) {
            for (int i = 0; i < postCount; i++) {
                if (chip->pins[i].busZ > 0)
                    continue;
                if (inRubberBand(i, x1, y1, x2, y2)) {
                    selSide2 = entries[i].side;
                    break;
                }
            }
        }
        for (int i = 0; i < postCount; i++) {
            chip->pins[i].selected = isPinSelected(i);
            if (chip->pins[i].busZ > 0)
                continue;
            if (inRubberBand(i, x1, y1, x2, y2) && entries[i].side == selSide2)
                chip->pins[i].selected = true;
        }
        draw();
        return;
    }
    if (dragging) {
        if (selectedPin < 0)
            return;
        int pos[2] = {0, 0};
        if (!chip->getPinPos((int) (x * scale), (int) (y * scale), dragCurrentSide, pos))
            return;
        dragCurrentSide = pos[1];

        // Reset to drag-start snapshot so each call is idempotent
        for (int i = 0; i < postCount; i++) {
            entries[i].pos = dragStartPosArr[i];
            entries[i].side = dragStartSideArr[i];
        }
        int newSide = pos[1];
        int maxNewPos = (newSide == ChipElm::SIDE_N || newSide == ChipElm::SIDE_S) ? chip->sizeX - 1 : chip->sizeY - 1;
        int minOff = INT_MAX, maxOff = INT_MIN;
        int sameSideCount = 0;
        for (int idx : selectedPins) {
            if (dragStartSideArr[idx] != dragStartSide)
                continue;
            sameSideCount++;
            int off = dragStartPosArr[idx] - dragStartPos;
            minOff = std::min(minOff, off);
            maxOff = std::max(maxOff, off);
        }
        int groupSize = maxOff - minOff + 1;
        int effectiveSide = newSide;
        int effectiveMaxPos = maxNewPos;
        if (groupSize > maxNewPos + 1) {
            effectiveSide = dragStartSide;
            effectiveMaxPos = (effectiveSide == ChipElm::SIDE_N || effectiveSide == ChipElm::SIDE_S) ? chip->sizeX - 1
                                                                                                   : chip->sizeY - 1;
        }
        int anchor = std::max(-minOff, std::min(effectiveMaxPos - maxOff, pos[0]));
        int delta = anchor - dragStartPos;
        bool sameSide = (effectiveSide == dragStartSide);
        bool contiguous = (groupSize == sameSideCount);

        // move a pin, along with the other pins of its bus
        auto updateBusGroup = [this](PinLayoutEntry &pj, int newPos, std::optional<int> newSideVal) {
            pj.pos = newPos;
            if (newSideVal)
                pj.side = *newSideVal;
            if (pj.busWidth <= 1)
                return;
            for (PinLayoutEntry &pjj : entries) {
                if (pjj.name == pj.name && pjj.busWidth == pj.busWidth) {
                    pjj.pos = newPos;
                    if (newSideVal)
                        pjj.side = *newSideVal;
                }
            }
        };

        if (sameSide && contiguous) {
            for (int i = 0; i < postCount; i++) {
                if (isPinSelected(i) || chip->pins[i].busZ > 0)
                    continue;
                if (dragStartSideArr[i] != dragStartSide)
                    continue;
                int origPos = dragStartPosArr[i];
                int newPos;
                if (delta >= 0)
                    newPos = (origPos >= dragStartPos + maxOff + 1 && origPos <= anchor + maxOff) ? origPos - groupSize : origPos;
                else
                    newPos = (origPos >= anchor + minOff && origPos <= dragStartPos + minOff - 1) ? origPos + groupSize : origPos;
                if (newPos != origPos)
                    updateBusGroup(entries[i], newPos, std::nullopt);
            }
        } else {
            std::set<int> groupPos;
            for (int idx : selectedPins) {
                if (dragStartSideArr[idx] != dragStartSide)
                    continue;
                groupPos.insert(anchor + dragStartPosArr[idx] - dragStartPos);
            }
            std::vector<int> displaced;
            for (int i = 0; i < postCount; i++) {
                if (isPinSelected(i) || chip->pins[i].busZ > 0)
                    continue;
                if (dragStartSideArr[i] != effectiveSide)
                    continue;
                if (groupPos.count(dragStartPosArr[i]))
                    displaced.push_back(i);
            }
            std::set<int> taken;
            for (int i = 0; i < postCount; i++) {
                if (isPinSelected(i) || chip->pins[i].busZ > 0)
                    continue;
                if (dragStartSideArr[i] == effectiveSide && !groupPos.count(dragStartPosArr[i]))
                    taken.insert(dragStartPosArr[i]);
            }
            std::vector<int> available;
            for (int slot = 0; slot <= effectiveMaxPos; slot++)
                if (!groupPos.count(slot) && !taken.count(slot))
                    available.push_back(slot);
            std::stable_sort(displaced.begin(), displaced.end(),
                             [this](int a, int b) { return dragStartPosArr[a] < dragStartPosArr[b]; });
            std::vector<int> freeSlots;
            int na = (int) available.size();
            if (delta >= 0) {
                for (int k = na - 1; k >= 0 && freeSlots.size() < displaced.size(); k--)
                    if (available[k] < anchor)
                        freeSlots.push_back(available[k]);
                for (int k = 0; k < na && freeSlots.size() < displaced.size(); k++)
                    if (available[k] > anchor + maxOff)
                        freeSlots.push_back(available[k]);
            } else {
                for (int k = 0; k < na && freeSlots.size() < displaced.size(); k++)
                    if (available[k] > anchor + maxOff)
                        freeSlots.push_back(available[k]);
                for (int k = na - 1; k >= 0 && freeSlots.size() < displaced.size(); k--)
                    if (available[k] < anchor)
                        freeSlots.push_back(available[k]);
            }
            std::sort(freeSlots.begin(), freeSlots.end());
            for (size_t k = 0; k < displaced.size() && k < freeSlots.size(); k++)
                updateBusGroup(entries[displaced[k]], freeSlots[k], std::nullopt);
        }
        // Move selected pins to their new positions
        for (int idx : selectedPins) {
            if (dragStartSideArr[idx] != dragStartSide)
                continue;
            int newPos = anchor + dragStartPosArr[idx] - dragStartPos;
            updateBusGroup(entries[idx], newPos, effectiveSide);
        }
        createPins();
        draw();
    } else {
        // hover: highlight nearest pin without disturbing selectedPins
        int hoveredPin = findNearestPin(x, y);
        for (int i = 0; i < postCount; i++)
            chip->pins[i].selected = isPinSelected(i) || i == hoveredPin;
        draw();
    }
}

void ChipPinEditor::onMouseDown(int x, int y, bool shift) {
    int hoveredPin = findNearestPin(x, y);

    if (hoveredPin < 0) {
        if (!shift)
            selectedPins.clear();
        rubberBand = true;
        rubberBandX1 = rubberBandX2 = x;
        rubberBandY1 = rubberBandY2 = y;
        updatePinHighlight();
        draw();
        return;
    }

    rubberBand = false;
    if (shift) {
        if (isPinSelected(hoveredPin)) {
            deselectPin(hoveredPin);
        } else {
            int hSide = entries[hoveredPin].side;
            bool ok = selectedPins.empty();
            if (!ok)
                ok = (firstSelectedSide() == hSide);
            if (ok)
                selectPin(hoveredPin);
        }
    } else {
        if (!isPinSelected(hoveredPin)) {
            selectedPins.clear();
            selectPin(hoveredPin);
        }
    }
    selectedPin = hoveredPin;

    dragStartPosArr.assign(postCount, 0);
    dragStartSideArr.assign(postCount, 0);
    for (int i = 0; i < postCount; i++) {
        dragStartPosArr[i] = entries[i].pos;
        dragStartSideArr[i] = entries[i].side;
    }
    const PinLayoutEntry &sp = entries[selectedPin];
    dragStartPos = sp.pos;
    dragStartSide = dragCurrentSide = sp.side;

    updatePinHighlight();
    dragging = true;
    draw();
}
