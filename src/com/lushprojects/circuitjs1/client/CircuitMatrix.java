package com.lushprojects.circuitjs1.client;

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
}
