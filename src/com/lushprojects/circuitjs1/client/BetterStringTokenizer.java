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

package com.lushprojects.circuitjs1.client;

public class BetterStringTokenizer {

    String delim;
    String text;
    int pos;
    int tlen;
    String token, tokenPreserveCase;

    public BetterStringTokenizer(String text_, String delim_) {
	text  = text_;
	delim = delim_;
	pos = 0;
	tlen = text.length();
	while (pos < tlen && (text.charAt(pos) == ' ' || text.charAt(pos) == '\t'))
	    pos++;
    }

    String nextToken() {
	if (pos == tlen) {
	    token = tokenPreserveCase = "";
	    return token;
	}
	int i = pos + 1;
	int c = text.charAt(pos);
	if (delim.indexOf(c) < 0) {
	    while (i < tlen && delim.indexOf(text.charAt(i)) < 0)
		i++;
	}
	tokenPreserveCase = text.substring(pos, i);
	token = tokenPreserveCase.toLowerCase();
	pos = i;
	while (pos < tlen && (text.charAt(pos) == ' ' || text.charAt(pos) == '\t'))
	    pos++;
	return token;
    }

    String nextTokenPreserveCase() {
	nextToken();
	return tokenPreserveCase;
    }

    void setDelimiters(String d) {
	delim = d;
    }

    boolean hasMoreTokens() {
	return pos < tlen;
    }
}
