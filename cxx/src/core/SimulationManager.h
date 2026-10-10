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

#include <map>
#include <memory>
#include <optional>
#include <set>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include "CircuitMatrix.h"
#include "CircuitNode.h"
#include "Point.h"
#include "VoltageSource.h"

class CircuitElm;
class SimApp;

struct WireSegment {
    CircuitElm *wire;
    int bit;
    std::string endpoint0;
    std::optional<std::string> endpoint1;  // string keys for each endpoint
    std::vector<CircuitElm *> neighbors;        // position-based neighbors
    std::vector<WireSegment *> labelNeighbors;  // neighbors at shared label endpoint
    int post = 0;         // 0 or 1: which endpoint was used for current calc
    double current = 0;   // set by calcWireCurrents, for label neighbor use

    WireSegment(CircuitElm *w, int b, std::string ep0, std::optional<std::string> ep1)
        : wire(w), bit(b), endpoint0(std::move(ep0)), endpoint1(std::move(ep1)) {}
};

struct RoutedWireConnection {
    CircuitElm *wire;  // RoutedWireElm
    int wirePost;      // which post of the RoutedWireElm (0 or 1)
    int elmPost;       // which post of the non-routed element
};

struct NodeMapEntry {
    NodeRef node;
    NodeMapEntry() = default;
    explicit NodeMapEntry(NodeRef n) : node(std::move(n)) {}
};

class SimulationManager {
public:
    SimApp *app;
    static SimulationManager *theSim;

    // this is different than the main elmList; it has CompositeElm child elms in it
    std::vector<CircuitElm *> elmList;

    std::vector<NodeRef> nodeList;
    std::vector<std::unique_ptr<VoltageSource>> voltageSources;

    // matrices are kept alive after stop() (nodes still point into them); matricesValid
    // plays the part of the TS version's "matrices == null" check
    std::vector<std::unique_ptr<CircuitMatrix>> matrices;
    bool matricesValid = false;
    bool circuitNonLinear = false;
    int voltageSourceCount = 0;
    bool needsStamp = false;

    // mapping from elements to connected routed wires
    std::unordered_map<CircuitElm *, std::vector<RoutedWireConnection>> routedWireMap;
    std::vector<CircuitElm *> elmArr;
    double t = 0;

    // Solver type: 0=Auto, 1=Dense, 2=Sparse
    static constexpr int SOLVER_AUTO = 0;
    static constexpr int SOLVER_DENSE = 1;
    static constexpr int SOLVER_SPARSE = 2;
    static constexpr int SPARSE_THRESHOLD = 150;
    int solverType = SOLVER_AUTO;
    bool usingSparse = false;

    // current timestep (time between iterations)
    double timeStep = 0;
    // maximum timestep (== timeStep unless we reduce it because of trouble converging)
    double maxTimeStep = 0;
    double minTimeStep = 0;
    // accumulated time since we incremented timeStepCount
    double timeStepAccum = 0;
    // incremented each time we advance t by maxTimeStep
    long timeStepCount = 0;
    bool adjustTimeStep = false;
    double lastIterTime = 0;

    bool converged = false;
    int subIterations = 0;

    std::vector<int> unconnectedNodes;
    std::vector<CircuitElm *> nodesWithGroundConnection;
    int nodesWithGroundConnectionCount = 0;

    // info about each wire segment and its neighbors, used to calculate wire currents
    std::vector<std::unique_ptr<WireSegment>> wireInfoList;

    std::vector<Point> busMismatchList;

    explicit SimulationManager(SimApp *a);

    static void console(const std::string &text);

    void resetTime() { t = timeStepAccum = 0; timeStepCount = 0; }
    void resetNodes();
    CircuitNode *getCircuitNode(int n);
    CircuitElm *getElm(int n);

    void detectBusWidths() { detectBusWidthsForList(elmList); }
    void detectBusWidthsForList(std::vector<CircuitElm *> &list);
    void calculateWireClosure();
    void calculateWireClosureForList(std::vector<CircuitElm *> &list, bool uiList);
    void assignUiWireNodes();
    bool calcWireInfo();
    void setGroundNode(bool subcircuit);
    void makeNodeList();
    void addChildElms(std::vector<CircuitElm *> &list);
    void findUnconnectedNodes();
    void calculateClosures();
    void connectUnconnectedNodes();
    bool validateCircuit();
    void analyzeCircuit();
    bool preStampCircuit(bool subcircuit);
    void preStampAndStampCircuit();
    void stampCircuit();
    void makePostDrawList();
    void stop(const std::string &s, CircuitElm *ce);

    // control voltage source vs with voltage from n1 to n2 (must
    // also call stampVoltageSource())
    void stampVCVS(const NodeRef &n1, const NodeRef &n2, double coef, VoltageSource *vs);
    // stamp independent voltage source #vs, from n1 to n2, amount v
    void stampVoltageSource(const NodeRef &n1, const NodeRef &n2, VoltageSource *vs, double v);
    // use this if the amount of voltage is going to be updated in doStep(), by updateVoltageSource()
    void stampVoltageSource(const NodeRef &n1, const NodeRef &n2, VoltageSource *vs);
    void stampVoltageSourceVS(VoltageSource *vs, double v);
    // update voltage source in doStep()
    void updateVoltageSource(const NodeRef &n1, const NodeRef &n2, VoltageSource *vs, double v);
    void stampResistor(const NodeRef &n1, const NodeRef &n2, double r);
    void stampConductance(const NodeRef &n1, const NodeRef &n2, double r0);
    // specify that current from cn1 to cn2 is equal to voltage from vn1 to vn2, divided by g
    void stampVCCurrentSource(const NodeRef &cn1, const NodeRef &cn2, const NodeRef &vn1, const NodeRef &vn2, double g);
    void stampCurrentSource(const NodeRef &n1, const NodeRef &n2, double i);
    // stamp a current source from n1 to n2 depending on current through vs
    void stampCCCS(const NodeRef &n1, const NodeRef &n2, VoltageSource *vs, double gain);
    // stamp value x in row i, column j, meaning that a voltage change
    // of dv in node j will increase the current into node i by x dv.
    void stampMatrix(const NodeRef &i, const NodeRef &j, double x);
    // stamp from voltage source row to node column
    void stampMatrixNV(VoltageSource *i, const NodeRef &j, double x);
    // stamp from node row to voltage source column
    void stampMatrixVN(const NodeRef &i, VoltageSource *j, double x);
    // stamp voltage source to voltage source
    void stampMatrixVV(VoltageSource *i, VoltageSource *j, double x);
    // stamp value x on the right side of row i, representing an
    // independent current source flowing into node i
    void stampRightSide(const NodeRef &n, double x);
    void stampRightSideVS(VoltageSource *vs, double x);
    // indicate that the values on the left side of row change in doStep() (no-ops)
    void stampNonLinear(const NodeRef &) {}
    void stampNonLinearVS(VoltageSource *) {}

    void runCircuit(bool didAnalyze);
    void applySolvedRightSide(CircuitMatrix &m);
    void setNodeVoltages(CircuitMatrix &m, const std::vector<double> &nv);
    void calcWireCurrents();

    double getLabeledNodeVoltage(const std::string &name);

    static void invertMatrix(std::vector<std::vector<double>> &a, int n);
    static bool lu_factor(std::vector<std::vector<double>> &a, int n, std::vector<int> &ipvt, CircuitMatrix &cm);
    static bool lu_factor_dense(std::vector<std::vector<double>> &a, int n, std::vector<int> &ipvt);
    static void lu_solve(std::vector<std::vector<double>> &a, int n, std::vector<int> &ipvt,
                         std::vector<double> &b, CircuitMatrix &cm);
    static void lu_solve_dense(std::vector<std::vector<double>> &a, int n, std::vector<int> &ipvt,
                               std::vector<double> &b);

    static std::string pointKey(const Point &p) {
        return std::to_string(p.x) + "," + std::to_string(p.y) + "," + std::to_string(p.z);
    }

private:
    using PointMap = std::map<Point, std::shared_ptr<NodeMapEntry>>;

    // map points to node numbers
    PointMap nodeMap;
    // separate node map for UI element list (when viewing composite internals)
    PointMap uiNodeMap;

    // the element list that wireInfoList was built from
    std::unordered_set<CircuitElm *> wireInfoElmSet;
    // tracks which (element, bit) pairs have been resolved in calcWireInfo
    std::unordered_map<CircuitElm *, std::set<int>> wireInfoResolved;

    PointMap nmToPointMap(std::unordered_map<std::string, std::shared_ptr<NodeMapEntry>> &nm,
                          std::vector<CircuitElm *> &list);
    static NodeMapEntry *getFromPointMap(PointMap &map, const Point &pt);
    bool isWireInfoResolved(CircuitElm *ce, int bit);
    void setWireInfoResolved(CircuitElm *ce, int bit);
};
