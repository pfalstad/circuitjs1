// JS parseInt/parseFloat silently return NaN on malformed input, unlike Java's
// Integer.parseInt/Double.parseDouble, which throw NumberFormatException. Code ported
// from Java often relies on that throw (e.g. a try/catch that falls back to a preset
// default), so use these instead of the built-ins wherever that behavior is needed.

export function parseIntStrict(s: string, radix?: number): number {
    const n = parseInt(s, radix);
    if (isNaN(n))
        throw new Error("invalid integer: " + JSON.stringify(s));
    return n;
}

export function parseFloatStrict(s: string): number {
    const n = parseFloat(s);
    if (isNaN(n))
        throw new Error("invalid float: " + JSON.stringify(s));
    return n;
}
