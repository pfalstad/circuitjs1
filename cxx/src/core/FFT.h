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

#include <vector>

class FFT {
public:
    explicit FFT(int n);

    /*
     * This uses the radix-2 decimation-in-time FFT algorithm.
     * Based on
     * http://www.ee.columbia.edu/~ronw/code/MEAPsoft/doc/html/FFT_8java-source.html
     * Douglas L. Jones
     * University of Illinois at Urbana-Champaign
     * January 19, 1992
     * http://cnx.rice.edu/content/m12016/latest/
     */
    void fft(std::vector<double> &real, std::vector<double> &imag, bool windowed);

    int getSize() const { return size; }

    double magnitude(double real, double imag) const;

private:
    int size;
    int bits;
    std::vector<double> cosTable;
    std::vector<double> sinTable;
    std::vector<double> winTable;
};
