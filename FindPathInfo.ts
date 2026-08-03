// Stub — to be implemented from FindPathInfo.java

import { CircuitNode } from "./CircuitNode";

export class FindPathInfo {
    static readonly INDUCT  = 1;
    static readonly VOLTAGE = 2;
    static readonly SHORT   = 3;
    static readonly CAP_V   = 4;

    visited: boolean[];
    dest: CircuitNode;
    firstElm: any;  // CircuitElm — typed as any to avoid circular import
    type: number;
    sim: any;  // SimulationManager — typed as any to avoid circular import

    // State object to help find loops in circuit subject to various conditions (depending on type_)
    // elm_ = source and destination element.  dest_ = destination node.
    constructor(type_: number, elm_: any, dest_: CircuitNode, sim_: any) {
        this.dest = dest_;
        this.type = type_;
        this.firstElm = elm_;
        this.sim = sim_;
        this.visited = new Array(sim_.nodeList.length).fill(false);
    }

    // look through circuit for loop starting at node n1 of firstElm, for a path back to
    // dest node of firstElm
    findPath(n1: CircuitNode): boolean {
        if (n1 === this.dest)
            return true;

        // depth first search, don't need to revisit already visited nodes!
        if (this.visited[n1.index])
            return false;

        this.visited[n1.index] = true;
        for (let i = 0; i < n1.links.length; i++) {
            const cnl = n1.links[i];
            const ce = cnl.elm;
            if (this.checkElm(n1, ce))
                return true;
        }
        if (n1 === CircuitNode.ground) {
            for (let i = 0; i < this.sim.nodesWithGroundConnection.length; i++)
                if (this.checkElm(CircuitNode.ground, this.sim.nodesWithGroundConnection[i]))
                    return true;
        }
        return false;
    }

    checkElm(n1: CircuitNode, ce: any): boolean {
        if (ce === this.firstElm)
            return false;
        if (this.type === FindPathInfo.INDUCT) {
            // inductors need a path free of current sources
            if (ce.isCurrentElm())
                return false;
        }
        if (this.type === FindPathInfo.VOLTAGE) {
            // when checking for voltage loops, we only care about voltage sources/wires/ground
            if (!(ce.isWireEquivalent() || ce.isVoltageElm() || ce.isLogicInputElm() || ce.isGroundElm()))
                return false;
        }
        // when checking for shorts, just check wires
        if (this.type === FindPathInfo.SHORT && !ce.isWireEquivalent())
            return false;
        if (this.type === FindPathInfo.CAP_V) {
            // checking for capacitor/voltage source loops
            if (!(ce.isWireEquivalent() || ce.isIdealCapacitor() || ce.isVoltageElm() || ce.isLogicInputElm()))
                return false;
        }
        if (n1 === CircuitNode.ground) {
            // look for posts which have a ground connection;
            // our path can go through ground
            for (let j = 0; j < ce.getPostCount(); j++)
                if (ce.hasGroundConnection(j) && this.findPath(ce.getNode(j)))
                    return true;
        }
        for (let j = 0; j < ce.getPostCount(); j++) {
            if (ce.getNode(j) === n1) {
                if (ce.hasGroundConnection(j) && this.findPath(CircuitNode.ground))
                    return true;
                if (this.type === FindPathInfo.INDUCT && ce.isInductorElm()) {
                    // inductors can use paths with other inductors of matching current
                    let c = ce.getCurrent();
                    if (j === 0)
                        c = -c;
                    if (Math.abs(c - this.firstElm.getCurrent()) > 1e-10)
                        continue;
                }
                for (let k = 0; k < ce.getPostCount(); k++) {
                    if (j === k)
                        continue;
                    if (ce.getConnection(j, k) && this.findPath(ce.getNode(k))) {
                        //System.out.println("got findpath " + n1);
                        return true;
                    }
                }
            }
        }
        return false;
    }
}
