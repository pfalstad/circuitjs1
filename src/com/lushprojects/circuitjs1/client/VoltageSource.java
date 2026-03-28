package com.lushprojects.circuitjs1.client;

class VoltageSource {
    int index;
    CircuitElm elm;  // owning element, set during assignment
    CircuitMatrix matrix;
    int row;  // row in matrix (nodeCount + 1-based offset)
    CircuitNode n1, n2;  // nodes this VS is stamped between

    // save the nodes this voltage source is stamped between.
    // used later to determine which matrix it belongs to.
    void setNodes(CircuitNode n1, CircuitNode n2) {
	this.n1 = n1;
	this.n2 = n2;
    }

    // assign matrix from saved nodes (use non-ground node's matrix)
    void assignMatrix() {
	if (n1 != null && n1 != CircuitNode.ground && n1.matrix != null)
	    matrix = n1.matrix;
	else if (n2 != null && n2 != CircuitNode.ground && n2.matrix != null)
	    matrix = n2.matrix;
	else
	    // fallback: use element's last node
	    matrix = elm.getNode(elm.getPostCount()-1).matrix;
	if (matrix == null) {
	    CirSim.console("null matrix! " + elm + " n1=" + (n1 == null ? "null" : n1.index + " m=" + n1.matrix) + " n2=" + (n2 == null ? "null" : n2.index + " m=" + n2.matrix) + " fallback=" + elm.getNode(elm.getPostCount()-1).index);
	}
    }
}
