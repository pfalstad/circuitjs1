import { parseFloatStrict } from "./NumberParse";
// Stub for GWT's com.google.gwt.i18n.client.NumberFormat

export class NumberFormat {
    private pattern: string;

    private constructor(pattern: string) {
        this.pattern = pattern;
    }

    static getFormat(pattern: string): NumberFormat {
        return new NumberFormat(pattern);
    }

    format(v: number): string {
        // Scientific notation pattern (e.g. "#.##E000")
        if (this.pattern.includes('E')) {
            const exp = v.toExponential(2).toUpperCase();
            // Pad exponent to 3 digits to match GWT "#.##E000" style
            return exp.replace(/E([+-]?)(\d+)$/, (_, sign, digits) =>
                'E' + (sign === '-' ? '-' : '') + digits.padStart(3, '0'));
        }
        const dotIdx = this.pattern.indexOf('.');
        if (dotIdx === -1)
            return Math.round(v).toString();
        const decPart = this.pattern.substring(dotIdx + 1);
        const digits = decPart.length;
        const isFixed = decPart.includes('0');
        if (isFixed)
            return v.toFixed(digits);
        // Optional digits (#) — trim trailing zeros
        return parseFloatStrict(v.toFixed(digits)).toString();
    }
}
