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

export class FFT {
    private size: number;
    private bits: number;
    private cosTable: number[];
    private sinTable: number[];
    private winTable: number[];

    constructor(n: number) {
        this.size = n;
        this.bits = Math.floor(Math.log(this.size) / Math.log(2));
        this.cosTable = new Array(this.size / 2);
        this.sinTable = new Array(this.size / 2);
        const dtheta = -2 * Math.PI / this.size;
        for (let i = 0; i < this.cosTable.length; i++) {
            this.cosTable[i] = Math.cos(dtheta * i);
            this.sinTable[i] = Math.sin(dtheta * i);
        }

        /* Scale the sine window up for unity gain. */
        const gainCompensation = 1.5707963267961471;

        this.winTable = new Array(this.size);
        for (let i = 0; i < this.winTable.length; i++) {
            const weight = Math.sin(i * Math.PI / this.winTable.length);
            this.winTable[i] = weight * gainCompensation;
        }
    }

    /*
     * This uses the radix-2 decimation-in-time FFT algorithm.
     * Based on
     * http://www.ee.columbia.edu/~ronw/code/MEAPsoft/doc/html/FFT_8java-source.html
     * Douglas L. Jones
     * University of Illinois at Urbana-Champaign
     * January 19, 1992
     * http://cnx.rice.edu/content/m12016/latest/
     */
    fft(real: number[], imag: number[], windowed: boolean): void {
        if (windowed) {
            for (let i = 0; i < real.length; i++) {
                real[i] *= this.winTable[i];
                imag[i] *= this.winTable[i];
            }
        }

        let j = 0;
        let n2 = real.length / 2;
        for (let i = 1; i < real.length - 1; i++) {
            let n1 = n2;
            while (j >= n1) {
                j -= n1;
                n1 /= 2;
            }
            j += n1;
            if (i < j) {
                let t1 = real[i];
                real[i] = real[j];
                real[j] = t1;
                t1 = imag[i];
                imag[i] = imag[j];
                imag[j] = t1;
            }
        }
        n2 = 1;
        for (let i = 0; i < this.bits; i++) {
            const n1 = n2;
            n2 <<= 1;
            let a = 0;
            for (j = 0; j < n1; j++) {
                const c = this.cosTable[a];
                const s = this.sinTable[a];
                a += 1 << (this.bits - i - 1);
                for (let k = j; k < real.length; k += n2) {
                    const t = k + n1;
                    const t1 = c * real[t] - s * imag[t];
                    const t2 = s * real[t] + c * imag[t];
                    real[k + n1] = real[k] - t1;
                    imag[k + n1] = imag[k] - t2;
                    real[k] += t1;
                    imag[k] += t2;
                }
            }
        }
    }

    getSize(): number { return this.size; }

    magnitude(real: number, imag: number): number {
        return Math.sqrt(real * real + imag * imag) / this.size;
    }
}
