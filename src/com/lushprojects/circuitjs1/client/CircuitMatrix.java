package com.lushprojects.circuitjs1.client;

import java.util.Vector;
import com.lushprojects.circuitjs1.client.matrix.SparseLU;

class CircuitMatrix {
    double matrix[][];
    double rightSide[];
    double origRightSide[];
    double origMatrix[][];
    int permute[];
    int size;
    int nodeCount;   // number of node rows (vs rows come after)
    boolean nonLinear;
    double nodeVoltages[];
    double lastNodeVoltages[];
    SparseLU sparseLU;
    Vector<CircuitNode> nodeList = new Vector<CircuitNode>();
    Vector<VoltageSource> voltageSourceList = new Vector<VoltageSource>();
}
