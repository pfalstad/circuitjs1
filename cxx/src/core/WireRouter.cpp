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

#include "WireRouter.h"

#include <algorithm>
#include <cmath>
#include <limits>

#include "CircuitElm.h"

WireRouter *WireRouter::lastRouter = nullptr;

namespace {

// Min-heap of A* states keyed on fScore, stored in parallel arrays.
class StateHeap {
public:
    bool isEmpty() const { return f.empty(); }
    double topG() const { return g[0]; }
    int topState() const { return s[0]; }
    void offer(double fv, double gv, int sv) {
        size_t i = f.size();
        f.push_back(fv); g.push_back(gv); s.push_back(sv);
        while (i > 0) {
            size_t p = (i - 1) >> 1;
            if (fv >= f[p])
                break;
            f[i] = f[p]; g[i] = g[p]; s[i] = s[p];
            i = p;
        }
        f[i] = fv; g[i] = gv; s[i] = sv;
    }
    void pop() {
        double lf = f.back(), lg = g.back();
        int ls = s.back();
        f.pop_back(); g.pop_back(); s.pop_back();
        size_t n = f.size();
        if (n == 0)
            return;
        size_t i = 0;
        while (true) {
            size_t l = 2 * i + 1, r = l + 1;
            size_t m = i;
            double mf = lf;
            if (l < n && f[l] < mf) { m = l; mf = f[l]; }
            if (r < n && f[r] < mf) m = r;
            if (m == i)
                break;
            f[i] = f[m]; g[i] = g[m]; s[i] = s[m];
            i = m;
        }
        f[i] = lf; g[i] = lg; s[i] = ls;
    }

private:
    std::vector<double> f, g;
    std::vector<int> s;
};

// A* search state, indexed by (r * cols + c) * 4 + (dir - 1).  Buffers are shared
// between routers and reused; a generation stamp marks which entries are valid
// so they never need to be cleared.
std::vector<double> gScoreBuf;
std::vector<int> cameFromBuf;
std::vector<uint32_t> stampBuf;
uint32_t generation = 0;

int jsSign(int x) { return (x > 0) - (x < 0); }

// JS "a / b | 0" for ints (truncates toward zero, like C++ int division)
int idiv(int a, int b) { return a / b; }

}  // namespace

WireRouter::WireRouter() {
    lastRouter = this;
}

void WireRouter::addObstacle(const std::vector<Point> &pts) {
    int minX = pts[0].x, minY = pts[0].y, maxX = pts[0].x, maxY = pts[0].y;
    for (size_t i = 1; i < pts.size(); i++) {
        if (pts[i].x < minX) minX = pts[i].x;
        if (pts[i].y < minY) minY = pts[i].y;
        if (pts[i].x > maxX) maxX = pts[i].x;
        if (pts[i].y > maxY) maxY = pts[i].y;
    }
    addObstacle(minX, minY, maxX, maxY);
}

void WireRouter::addObstacle(int px1, int py1, int px2, int py2) {
    int px1n = px1 + gridSize / 2;
    int px2n = px2 + gridSize / 2;
    int py1n = py1 + gridSize / 2;
    int py2n = py2 + gridSize / 2;
    int r1 = idiv(py1n - originY, gridSize);
    int c1 = idiv(px1n - originX, gridSize);
    int r2 = idiv(py2n - originY, gridSize);
    int c2 = idiv(px2n - originX, gridSize);
    int minR = std::min(r1, r2), maxR = std::max(r1, r2);
    int minC = std::min(c1, c2), maxC = std::max(c1, c2);
    for (int c = minC; c <= maxC; c++)
        for (int r = minR; r <= maxR; r++)
            if (isValid(r, c))
                cell(r, c) |= OBSTACLE;
}

void WireRouter::addObstaclePoint(int px, int py) {
    int r = idiv(py - originY, gridSize);
    int c = idiv(px - originX, gridSize);
    if (isValid(r, c))
        cell(r, c) |= OBSTACLE;
}

void WireRouter::clearPoint(int px, int py) {
    int r = idiv(py - originY, gridSize);
    int c = idiv(px - originX, gridSize);
    if (isValid(r, c))
        cell(r, c) = 0;
}

void WireRouter::addWire(int px1, int py1, int px2, int py2) {
    int r1 = idiv(py1 - originY, gridSize);
    int c1 = idiv(px1 - originX, gridSize);
    int r2 = idiv(py2 - originY, gridSize);
    int c2 = idiv(px2 - originX, gridSize);
    int minR = std::min(r1, r2), maxR = std::max(r1, r2);
    int minC = std::min(c1, c2), maxC = std::max(c1, c2);
    if (r1 == r2) {
        for (int c = minC; c <= maxC; c++)
            if (isValid(r1, c))
                cell(r1, c) |= HORIZONTAL;
    } else {
        for (int r = minR; r <= maxR; r++)
            if (isValid(r, c1))
                cell(r, c1) |= VERTICAL;
    }
}

void WireRouter::initGrid(CircuitElm *wire, int gridSize_, const std::vector<CircuitElm *> &elmList,
                          const std::optional<Rectangle> &bounds) {
    gridSize = gridSize_;

    double minX = std::min(wire->x, wire->x2);
    double minY = std::min(wire->y, wire->y2);
    double maxX = std::max(wire->x, wire->x2);
    double maxY = std::max(wire->y, wire->y2);
    if (bounds) {
        minX = std::min(minX, bounds->x);
        minY = std::min(minY, bounds->y);
        maxX = std::max(maxX, bounds->x + bounds->width);
        maxY = std::max(maxY, bounds->y + bounds->height);
    }

    const int margin = 2;
    originX = (int) std::trunc(minX / gridSize) * gridSize - margin * gridSize;
    originY = (int) std::trunc(minY / gridSize) * gridSize - margin * gridSize;
    rows = (int) std::trunc((maxY - originY) / gridSize + 1 + margin * 2);
    cols = (int) std::trunc((maxX - originX) / gridSize + 1 + margin * 2);

    grid.assign((size_t) rows * cols, 0);

    for (CircuitElm *ce : elmList) {
        if (wire == ce)
            continue;
        ce->addRoutingObstacle(*this);
        for (int i = 0; i < ce->getPostCount(); i++) {
            Point p = ce->getPost(i);
            addObstaclePoint(p.x, p.y);
        }
    }
    // clear start and end cells
    cell(idiv(wire->y - originY, gridSize), idiv(wire->x - originX, gridSize)) = 0;
    cell(idiv(wire->y2 - originY, gridSize), idiv(wire->x2 - originX, gridSize)) = 0;
}

int WireRouter::dr(int dir) const {
    if (dir == UP) return -1;
    if (dir == DOWN) return +1;
    return 0;
}

int WireRouter::dc(int dir) const {
    if (dir == LEFT) return -1;
    if (dir == RIGHT) return +1;
    return 0;
}

std::vector<int> WireRouter::getPreferredEscapeDirections(int r, int c) {
    std::vector<int> prefs;
    if (!canMoveTo(r - 1, c, UP)) prefs.push_back(DOWN);
    if (!canMoveTo(r + 1, c, DOWN)) prefs.push_back(UP);
    if (!canMoveTo(r, c - 1, LEFT)) prefs.push_back(RIGHT);
    if (!canMoveTo(r, c + 1, RIGHT)) prefs.push_back(LEFT);
    return prefs;
}

std::vector<Point> WireRouter::tryPatternRouting(int startR, int startC, int goalR, int goalC) {
    if (startR == goalR && startC == goalC)
        return {Point(startC * gridSize + originX, startR * gridSize + originY)};

    std::vector<int> startPrefs = getPreferredEscapeDirections(startR, startC);
    double bestCost = std::numeric_limits<double>::infinity();
    std::optional<std::vector<std::vector<int>>> bestCorners;

    auto tryPath = [&](const std::vector<std::vector<int>> &path, int initialDir) {
        double cost = evaluatePath(path, initialDir, startPrefs);
        if (cost >= 0 && cost < bestCost) {
            bestCost = cost;
            bestCorners = path;
        }
    };

    if (startR != goalR && startC != goalC) {
        tryPath({{startR, startC}, {startR, goalC}, {goalR, goalC}}, goalC > startC ? RIGHT : LEFT);
        tryPath({{startR, startC}, {goalR, startC}, {goalR, goalC}}, goalR > startR ? DOWN : UP);
    } else if (startR == goalR) {
        tryPath({{startR, startC}, {goalR, goalC}}, goalC > startC ? RIGHT : LEFT);
    } else {
        tryPath({{startR, startC}, {goalR, goalC}}, goalR > startR ? DOWN : UP);
    }

    const int maxDetour = 5;

    if (startR != goalR) {
        for (int margin = 1; margin <= maxDetour; margin++) {
            for (int side : {-1, +1}) {
                for (int base : {startC, goalC}) {
                    int detourCol = base + side * margin;
                    if (!isValid(0, detourCol))
                        continue;
                    std::vector<std::vector<int>> z = {{startR, startC}};
                    if (startC != detourCol) z.push_back({startR, detourCol});
                    if (startR != goalR) z.push_back({goalR, detourCol});
                    if (detourCol != goalC) z.push_back({goalR, goalC});
                    if (z.size() >= 2)
                        tryPath(z, detourCol > startC ? RIGHT : LEFT);
                }
            }
        }
    }

    if (startC != goalC) {
        for (int margin = 1; margin <= maxDetour; margin++) {
            for (int side : {-1, +1}) {
                for (int base : {startR, goalR}) {
                    int detourRow = base + side * margin;
                    if (!isValid(detourRow, 0))
                        continue;
                    std::vector<std::vector<int>> z = {{startR, startC}};
                    if (startR != detourRow) z.push_back({detourRow, startC});
                    if (startC != goalC) z.push_back({detourRow, goalC});
                    if (detourRow != goalR) z.push_back({goalR, goalC});
                    if (z.size() >= 2)
                        tryPath(z, detourRow > startR ? DOWN : UP);
                }
            }
        }
    }

    if (!bestCorners)
        return {};
    return pixelsFromGridPoints(*bestCorners);
}

double WireRouter::evaluatePath(const std::vector<std::vector<int>> &corners, int initialDir,
                                const std::vector<int> &startPrefs) {
    if (corners.size() < 2)
        return -1;

    double cost = 0.0;
    int prevDir = NONE;
    std::vector<int> prev = corners[0];
    for (size_t i = 1; i < corners.size(); i++) {
        const std::vector<int> &curr = corners[i];
        int dR = curr[0] - prev[0];
        int dC = curr[1] - prev[1];
        int steps = std::max(std::abs(dR), std::abs(dC));
        if (steps == 0)
            continue;

        int moveDir;
        if (dR == 0 && dC > 0) moveDir = RIGHT;
        else if (dR == 0 && dC < 0) moveDir = LEFT;
        else if (dC == 0 && dR > 0) moveDir = DOWN;
        else if (dC == 0 && dR < 0) moveDir = UP;
        else return -1;

        int r = prev[0], c = prev[1];
        // the corner cell must also be free in the new direction
        if (!canLeave(r, c, moveDir))
            return -1;
        for (int s = 0; s < steps; s++) {
            r += jsSign(dR);
            c += jsSign(dC);
            if (!isValid(r, c) || !canMoveTo(r, c, moveDir))
                return -1;
        }

        cost += steps;
        if (prevDir != NONE && moveDir != prevDir && moveDir != opposite(prevDir))
            cost += turnPenalty;
        prevDir = moveDir;
        prev = curr;
    }

    for (int p : startPrefs) {
        if (p == initialDir) {
            cost += ESCAPE_BONUS;
            break;
        }
    }
    return cost;
}

std::vector<Point> WireRouter::pixelsFromGridPoints(const std::vector<std::vector<int>> &gridPoints) {
    std::vector<Point> out;
    for (const auto &g : gridPoints)
        out.emplace_back(g[1] * gridSize + originX, g[0] * gridSize + originY);
    return out;
}

std::vector<Point> WireRouter::routeWire(int px1, int py1, int px2, int py2) {
    int startR = idiv(py1 - originY, gridSize);
    int startC = idiv(px1 - originX, gridSize);
    int goalR = idiv(py2 - originY, gridSize);
    int goalC = idiv(px2 - originX, gridSize);

    if (!isValid(startR, startC) || !isValid(goalR, goalC))
        return {};

    if (!canMoveTo(goalR, goalC, UP) && !canMoveTo(goalR, goalC, DOWN) && !canMoveTo(goalR, goalC, LEFT) &&
        !canMoveTo(goalR, goalC, RIGHT))
        return {};

    std::vector<Point> patternPath = tryPatternRouting(startR, startC, goalR, goalC);
    if (!patternPath.empty())
        return patternPath;

    std::vector<std::vector<int>> fullPath = aStar(startR, startC, goalR, goalC);
    if (fullPath.empty())
        return {};
    std::vector<std::vector<int>> compressed = compressPath(fullPath);
    std::vector<Point> out;
    for (const auto &pt : compressed)
        out.emplace_back(pt[1] * gridSize + originX, pt[0] * gridSize + originY);
    return out;
}

std::vector<std::vector<int>> WireRouter::aStar(int startR, int startC, int goalR, int goalC) {
    const int ncols = cols;
    const size_t nStates = (size_t) rows * ncols * 4;
    if (stampBuf.size() < nStates) {
        gScoreBuf.assign(nStates, 0);
        cameFromBuf.assign(nStates, 0);
        stampBuf.assign(nStates, 0);
        generation = 0;
    }
    if (++generation == 0xffffffff) {
        std::fill(stampBuf.begin(), stampBuf.end(), 0);
        generation = 1;
    }
    const uint32_t gen = generation;
    double *gScore = gScoreBuf.data();
    int *cameFrom = cameFromBuf.data();
    uint32_t *stamp = stampBuf.data();
    const uint8_t *gr = grid.data();
    StateHeap heap;

    std::vector<int> startPrefs = getPreferredEscapeDirections(startR, startC);

    for (int d : {UP, DOWN, LEFT, RIGHT}) {
        if (!canMoveTo(startR + dr(d), startC + dc(d), d))
            continue;
        double initG = 0.0;
        if (std::find(startPrefs.begin(), startPrefs.end(), d) != startPrefs.end())
            initG += ESCAPE_BONUS;
        int s = (startR * ncols + startC) * 4 + d - 1;
        heap.offer(initG + manhattan(startR, startC, goalR, goalC), initG, s);
        gScore[s] = initG;
        cameFrom[s] = -1;
        stamp[s] = gen;
    }

    // the heuristic (manhattan distance) is consistent, so the first goal state
    // popped has the lowest cost and we can stop there.
    int goalState = -1;
    while (!heap.isEmpty()) {
        double g = heap.topG();
        int s = heap.topState();
        heap.pop();
        if (g > gScore[s])
            continue;

        int cellIdx = s >> 2;
        int dir = (s & 3) + 1;
        int r = cellIdx / ncols;
        int c = cellIdx - r * ncols;
        if (r == goalR && c == goalC) {
            goalState = s;
            break;
        }

        uint8_t here = gr[cellIdx];
        for (int moveDir = 1; moveDir <= 4; moveDir++) {
            int nr = r, nc = c;
            if (moveDir == UP) nr--;
            else if (moveDir == DOWN) nr++;
            else if (moveDir == LEFT) nc--;
            else nc++;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= ncols)
                continue;
            bool horiz = moveDir >= LEFT;
            int flag = horiz ? HORIZONTAL : VERTICAL;
            // canLeave(r, c, moveDir) && canMoveTo(nr, nc, moveDir)
            if ((here & flag) != 0)
                continue;
            uint8_t there = gr[nr * ncols + nc];
            if ((there & (OBSTACLE | flag)) != 0)
                continue;

            double moveCost = 1.0;
            if (horiz != (dir >= LEFT))
                moveCost += turnPenalty;

            int ns = (nr * ncols + nc) * 4 + moveDir - 1;
            double tentG = g + moveCost;
            if (stamp[ns] != gen || tentG < gScore[ns]) {
                stamp[ns] = gen;
                cameFrom[ns] = s;
                gScore[ns] = tentG;
                heap.offer(tentG + manhattan(nr, nc, goalR, goalC), tentG, ns);
            }
        }
    }

    std::vector<std::vector<int>> fullPath;
    if (goalState < 0)
        return fullPath;
    for (int s = goalState; s >= 0; s = cameFrom[s]) {
        int cellIdx = s >> 2;
        int r = cellIdx / ncols;
        fullPath.push_back({r, cellIdx - r * ncols});
    }
    std::reverse(fullPath.begin(), fullPath.end());
    return fullPath;
}

std::vector<std::vector<int>> WireRouter::compressPath(const std::vector<std::vector<int>> &fullPath) {
    if (fullPath.size() <= 2)
        return fullPath;
    std::vector<std::vector<int>> minimal = {fullPath[0]};
    for (size_t i = 1; i < fullPath.size() - 1; i++) {
        const auto &a = fullPath[i - 1], &b = fullPath[i], &c = fullPath[i + 1];
        int dx1 = b[1] - a[1], dy1 = b[0] - a[0];
        int dx2 = c[1] - b[1], dy2 = c[0] - b[0];
        bool collinear = (dx1 * dy2 - dy1 * dx2 == 0) && (dx1 * dx2 + dy1 * dy2 > 0);
        if (!collinear)
            minimal.push_back(b);
    }
    const auto &last = fullPath.back();
    const auto &prev = minimal.back();
    if (prev[0] != last[0] || prev[1] != last[1])
        minimal.push_back(last);
    return minimal;
}

void WireRouter::placeWire(const std::vector<std::vector<int>> &path) {
    if (path.size() < 2)
        return;
    const auto &s = path[0], &e = path.back();
    cell(s[0], s[1]) |= (HORIZONTAL | VERTICAL);
    cell(e[0], e[1]) |= (HORIZONTAL | VERTICAL);
    int prevDir = NONE;
    for (size_t i = 1; i < path.size(); i++) {
        const auto &prev = path[i - 1], &curr = path[i];
        int dR = curr[0] - prev[0], dC = curr[1] - prev[1];
        int thisDir = getMoveDir(dR, dC);
        int flag = (thisDir == LEFT || thisDir == RIGHT) ? HORIZONTAL : VERTICAL;
        cell(curr[0], curr[1]) |= flag;
        if (prevDir != NONE && thisDir != prevDir && thisDir != opposite(prevDir))
            cell(prev[0], prev[1]) |= (HORIZONTAL | VERTICAL);
        prevDir = thisDir;
    }
}

bool WireRouter::canMoveTo(int r, int c, int moveDir) const {
    if (!isValid(r, c))
        return false;
    int v = cell(r, c);
    if ((v & OBSTACLE) != 0)
        return false;
    int flag = (moveDir == LEFT || moveDir == RIGHT) ? HORIZONTAL : VERTICAL;
    return (v & flag) == 0;
}

bool WireRouter::canLeave(int r, int c, int moveDir) const {
    int flag = (moveDir == LEFT || moveDir == RIGHT) ? HORIZONTAL : VERTICAL;
    return (cell(r, c) & flag) == 0;
}

int WireRouter::getMoveDir(int dR, int dC) const {
    if (dR == -1) return UP;
    if (dR == 1) return DOWN;
    if (dC == -1) return LEFT;
    if (dC == 1) return RIGHT;
    return NONE;
}

int WireRouter::opposite(int d) const {
    if (d == UP) return DOWN;
    if (d == DOWN) return UP;
    if (d == LEFT) return RIGHT;
    if (d == RIGHT) return LEFT;
    return NONE;
}
