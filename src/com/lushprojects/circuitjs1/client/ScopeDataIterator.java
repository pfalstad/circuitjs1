package com.lushprojects.circuitjs1.client;

class ScopeDataIterator implements Iterable<Integer> {
    ScopePlot plot;
    int ipa, validCount;
    int currentIp;
    int startIndex;
    int scopePointCount;

    ScopeDataIterator(Scope scope, ScopePlot plot) {
	this.plot = plot;
	this.scopePointCount = scope.scopePointCount;
	ipa = scope.displayStartIndex(plot, scope.rect.width);
	validCount = scope.validDataCount(plot, ipa, scope.rect.width);
    }

    double skipNonzeroValues() {
	for (; startIndex < validCount; startIndex++) {
	    int ip = (startIndex + ipa) & (scopePointCount - 1);
	    if (plot.maxValues[ip] != 0)
		return plot.maxValues[ip];
	}
	return 0;
    }

    double getMin() { return plot.minValues[currentIp]; }
    double getMax() { return plot.maxValues[currentIp]; }

    public java.util.Iterator<Integer> iterator() {
	return new java.util.Iterator<Integer>() {
	    int i = startIndex;
	    public boolean hasNext() { return i < validCount; }
	    public Integer next() {
		currentIp = (i + ipa) & (scopePointCount - 1);
		return i++;
	    }
	    public void remove() {}
	};
    }
}
