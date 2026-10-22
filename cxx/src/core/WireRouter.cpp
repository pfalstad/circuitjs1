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
#include <functional>
#include <limits>
#include <unordered_map>

#include "CircuitElm.h"

WireRouter *WireRouter::lastRouter = nullptr;

namespace {

// Simple min-heap for A* priority queue (the same algorithm as the TS version, so ties
// come out in the same order)
template <class T>
class MinHeap {
public:
    explicit MinHeap(std::function<double(const T &, const T &)> cmp) : compare(std::move(cmp)) {}
    void offer(const T &item) {
        data.push_back(item);
        bubbleUp((int) data.size() - 1);
    }
    T poll() {
        T top = data[0];
        T last = data.back();
        data.pop_back();
        if (!data.empty()) {
            data[0] = last;
            sinkDown(0);
        }
        return top;
    }
    bool isEmpty() const { return data.empty(); }

private:
    std::vector<T> data;
    std::function<double(const T &, const T &)> compare;
    void bubbleUp(int i) {
        while (i > 0) {
            int parent = (i - 1) >> 1;
            if (compare(data[i], data[parent]) < 0) {
                std::swap(data[i], data[parent]);
                i = parent;
            } else
                break;
        }
    }
    void sinkDown(int i) {
        int n = (int) data.size();
        while (true) {
            int smallest = i;
            int l = 2 * i + 1, r = 2 * i + 2;
            if (l < n && compare(data[l], data[smallest]) < 0) smallest = l;
            if (r < n && compare(data[r], data[smallest]) < 0) smallest = r;
            if (smallest == i)
                break;
            std::swap(data[i], data[smallest]);
            i = smallest;
        }
    }
};

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
                grid[r][c] |= OBSTACLE;
}

void WireRouter::addObstaclePoint(int px, int py) {
    int r = idiv(py - originY, gridSize);
    int c = idiv(px - originX, gridSize);
    if (isValid(r, c))
        grid[r][c] |= OBSTACLE;
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
                grid[r1][c] |= HORIZONTAL;
    } else {
        for (int r = minR; r <= maxR; r++)
            if (isValid(r, c1))
                grid[r][c1] |= VERTICAL;
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

    grid.assign(rows, std::vector<int>(cols, 0));

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
    grid[idiv(wire->y - originY, gridSize)][idiv(wire->x - originX, gridSize)] = 0;
    grid[idiv(wire->y2 - originY, gridSize)][idiv(wire->x2 - originX, gridSize)] = 0;
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

    MinHeap<AStarNode> openSet([](const AStarNode &a, const AStarNode &b) { return a.fScore - b.fScore; });
    std::unordered_map<long, double> gScore;
    std::unordered_map<long, long> cameFrom;
    auto getG = [&](long k) {
        auto it = gScore.find(k);
        return it == gScore.end() ? std::numeric_limits<double>::infinity() : it->second;
    };

    std::vector<int> startPrefs = getPreferredEscapeDirections(startR, startC);

    for (int d : {UP, DOWN, LEFT, RIGHT}) {
        if (!canMoveTo(startR + dr(d), startC + dc(d), d))
            continue;
        double initG = 0.0;
        if (std::find(startPrefs.begin(), startPrefs.end(), d) != startPrefs.end())
            initG += ESCAPE_BONUS;
        long k = key(startR, startC, d);
        double h = manhattan(startR, startC, goalR, goalC);
        openSet.offer({startR, startC, d, initG, initG + h});
        gScore[k] = initG;
    }

    std::optional<AStarNode> bestGoalNode;

    while (!openSet.isEmpty()) {
        AStarNode current = openSet.poll();
        long currKey = key(current.r, current.c, current.dir);

        if (current.gScore > getG(currKey))
            continue;

        if (current.r == goalR && current.c == goalC) {
            if (!bestGoalNode || current.gScore < bestGoalNode->gScore)
                bestGoalNode = current;
        }

        for (const auto &neigh : neighbors(current.r, current.c)) {
            int nr = neigh[0], nc = neigh[1], moveDir = neigh[2];
            if (!canMoveTo(nr, nc, moveDir))
                continue;

            double moveCost = 1.0;
            if (current.dir != NONE && moveDir != current.dir && moveDir != opposite(current.dir))
                moveCost += turnPenalty;

            long nKey = key(nr, nc, moveDir);
            double tentG = current.gScore + moveCost;
            if (tentG < getG(nKey)) {
                cameFrom[nKey] = currKey;
                gScore[nKey] = tentG;
                double h = manhattan(nr, nc, goalR, goalC);
                openSet.offer({nr, nc, moveDir, tentG, tentG + h});
            }
        }
    }

    if (!bestGoalNode)
        return {};

    std::vector<std::vector<int>> fullPath;
    std::optional<long> currentKey = key(bestGoalNode->r, bestGoalNode->c, bestGoalNode->dir);
    while (currentKey) {
        long k = *currentKey;
        int d = (int) (k % 8);
        long rc = (k - d) / 8;
        fullPath.insert(fullPath.begin(), {(int) (rc / cols), (int) (rc % cols)});
        auto it = cameFrom.find(k);
        currentKey = it == cameFrom.end() ? std::nullopt : std::optional<long>(it->second);
    }

    std::vector<std::vector<int>> compressed = compressPath(fullPath);
    std::vector<Point> out;
    for (const auto &pt : compressed)
        out.emplace_back(pt[1] * gridSize + originX, pt[0] * gridSize + originY);
    return out;
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
    grid[s[0]][s[1]] |= (HORIZONTAL | VERTICAL);
    grid[e[0]][e[1]] |= (HORIZONTAL | VERTICAL);
    int prevDir = NONE;
    for (size_t i = 1; i < path.size(); i++) {
        const auto &prev = path[i - 1], &curr = path[i];
        int dR = curr[0] - prev[0], dC = curr[1] - prev[1];
        int thisDir = getMoveDir(dR, dC);
        int flag = (thisDir == LEFT || thisDir == RIGHT) ? HORIZONTAL : VERTICAL;
        grid[curr[0]][curr[1]] |= flag;
        if (prevDir != NONE && thisDir != prevDir && thisDir != opposite(prevDir))
            grid[prev[0]][prev[1]] |= (HORIZONTAL | VERTICAL);
        prevDir = thisDir;
    }
}

bool WireRouter::canMoveTo(int r, int c, int moveDir) const {
    if (!isValid(r, c))
        return false;
    int cell = grid[r][c];
    if ((cell & OBSTACLE) != 0)
        return false;
    int flag = (moveDir == LEFT || moveDir == RIGHT) ? HORIZONTAL : VERTICAL;
    return (cell & flag) == 0;
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

std::vector<std::array<int, 3>> WireRouter::neighbors(int r, int c) const {
    std::vector<std::array<int, 3>> list;
    if (r > 0) list.push_back({r - 1, c, UP});
    if (r < rows - 1) list.push_back({r + 1, c, DOWN});
    if (c > 0) list.push_back({r, c - 1, LEFT});
    if (c < cols - 1) list.push_back({r, c + 1, RIGHT});
    return list;
}
