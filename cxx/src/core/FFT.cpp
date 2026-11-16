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

#include "FFT.h"

#include <cmath>

#include "JsMath.h"

FFT::FFT(int n) : size(n) {
    bits = (int) std::floor(jsmath::log(size) / jsmath::log(2));
    cosTable.resize(size / 2);
    sinTable.resize(size / 2);
    double dtheta = -2 * M_PI / size;
    for (size_t i = 0; i < cosTable.size(); i++) {
        cosTable[i] = jsmath::cos(dtheta * i);
        sinTable[i] = jsmath::sin(dtheta * i);
    }

    /* Scale the sine window up for unity gain. */
    const double gainCompensation = 1.5707963267961471;

    winTable.resize(size);
    for (size_t i = 0; i < winTable.size(); i++) {
        double weight = jsmath::sin(i * M_PI / winTable.size());
        winTable[i] = weight * gainCompensation;
    }
}

void FFT::fft(std::vector<double> &real, std::vector<double> &imag, bool windowed) {
    int len = (int) real.size();
    if (windowed) {
        for (int i = 0; i < len; i++) {
            real[i] *= winTable[i];
            imag[i] *= winTable[i];
        }
    }

    int j = 0;
    int n2 = len / 2;
    for (int i = 1; i < len - 1; i++) {
        int n1 = n2;
        while (j >= n1) {
            j -= n1;
            n1 /= 2;
        }
        j += n1;
        if (i < j) {
            double t1 = real[i];
            real[i] = real[j];
            real[j] = t1;
            t1 = imag[i];
            imag[i] = imag[j];
            imag[j] = t1;
        }
    }
    n2 = 1;
    for (int i = 0; i < bits; i++) {
        int n1 = n2;
        n2 <<= 1;
        int a = 0;
        for (j = 0; j < n1; j++) {
            double c = cosTable[a];
            double s = sinTable[a];
            a += 1 << (bits - i - 1);
            for (int k = j; k < len; k += n2) {
                int t = k + n1;
                double t1 = c * real[t] - s * imag[t];
                double t2 = s * real[t] + c * imag[t];
                real[k + n1] = real[k] - t1;
                imag[k + n1] = imag[k] - t2;
                real[k] += t1;
                imag[k] += t2;
            }
        }
    }
}

double FFT::magnitude(double real, double imag) const {
    return std::sqrt(real * real + imag * imag) / size;
}
