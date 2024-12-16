package com.lushprojects.circuitjs1.client;

public interface ElementFactory {
    CircuitElm create(String className, int x1, int y1);
    CircuitElm create(String className, int x1, int y1, int x2, int y2, int f, StringTokenizer st);
    //String [] getClassList();
}
