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

#include <array>
#include <cstdlib>
#include <optional>
#include <vector>

#include "Point.h"
#include "Rectangle.h"

class CircuitElm;

// routes RoutedWireElms around other elements on a grid: tries a few simple
// L/Z-shaped patterns first, then falls back to A*
class WireRouter {
public:
    WireRouter();

    void setTurnPenalty(double penalty) { turnPenalty = penalty; }
    void addObstacle(int px1, int py1, int px2, int py2);
    // the bounding box of some points (TS: addObstacle(pts))
    void addObstacle(const std::vector<Point> &pts);
    void addObstaclePoint(int px, int py);
    void addWire(int px1, int py1, int px2, int py2);
    void initGrid(CircuitElm *wire, int gridSize, const std::vector<CircuitElm *> &elmList,
                  const std::optional<Rectangle> &bounds);
    std::vector<Point> routeWire(int px1, int py1, int px2, int py2);
    void placeWire(const std::vector<std::vector<int>> &path);

    static WireRouter *lastRouter;

private:
    struct AStarNode {
        int r, c, dir;
        double gScore, fScore;
    };

    int rows = 0;
    int cols = 0;
    std::vector<std::vector<int>> grid;

    static constexpr int OBSTACLE = 1;
    static constexpr int HORIZONTAL = 2;
    static constexpr int VERTICAL = 4;

    static constexpr int NONE = 0;
    static constexpr int UP = 1;
    static constexpr int DOWN = 2;
    static constexpr int LEFT = 3;
    static constexpr int RIGHT = 4;

    double turnPenalty = 4.0;
    int gridSize = 16;
    int originX = 0;
    int originY = 0;

    static constexpr double ESCAPE_BONUS = -0.4;

    int dr(int dir) const;
    int dc(int dir) const;
    std::vector<int> getPreferredEscapeDirections(int r, int c);
    std::vector<Point> tryPatternRouting(int startR, int startC, int goalR, int goalC);
    double evaluatePath(const std::vector<std::vector<int>> &corners, int initialDir, const std::vector<int> &startPrefs);
    std::vector<Point> pixelsFromGridPoints(const std::vector<std::vector<int>> &gridPoints);
    std::vector<std::vector<int>> compressPath(const std::vector<std::vector<int>> &fullPath);
    bool isValid(int r, int c) const { return r >= 0 && r < rows && c >= 0 && c < cols; }
    bool canMoveTo(int r, int c, int moveDir) const;
    int getMoveDir(int dr, int dc) const;
    int opposite(int d) const;
    int manhattan(int r1, int c1, int r2, int c2) const { return std::abs(r1 - r2) + std::abs(c1 - c2); }
    std::vector<std::array<int, 3>> neighbors(int r, int c) const;
    long key(int r, int c, int d) const { return ((long) r * cols + c) * 8 + d; }
};
