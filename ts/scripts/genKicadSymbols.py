#!/usr/bin/env python3
# Generates KicadSymbols.ts from an installed KiCad's symbol libraries.
# The symbols are flattened (extends resolved) and written in KiCad 9
# (20250114) syntax so the exported schematics open in KiCad 9 and later.
#
# usage: python3 scripts/genKicadSymbols.py [path/to/kicad/symbols] > KicadSymbols.ts

import re, sys, json

SYMDIR = sys.argv[1] if len(sys.argv) > 1 else \
    "/Applications/KiCad/KiCad.app/Contents/SharedSupport/symbols"

# key used by KicadExporter -> library symbol
SYMBOLS = {
    "R":     "Device:R",
    "C":     "Device:C",
    "CP":    "Device:C_Polarized",
    "L":     "Device:L",
    "D":     "Device:D",
    "LED":   "Device:LED",
    "DZ":    "Device:D_Zener",
    "NPN":   "Transistor_BJT:2N3904",
    "PNP":   "Transistor_BJT:2N3906",
    "NMOS":  "Transistor_FET:2N7000",
    "PMOS":  "Transistor_FET:BS250",
    "NJFET": "Device:Q_NJFET_DGS",
    "PJFET": "Device:Q_PJFET_DGS",
    "OPAMP": "Simulation_SPICE:OPAMP",
    "POT":   "Device:R_Potentiometer",
    "SPST":  "Switch:SW_SPST",
    "SPDT":  "Switch:SW_SPDT",
    "PUSH":  "Switch:SW_Push",
    "VDC":   "Simulation_SPICE:VDC",
    "VSIN":  "Simulation_SPICE:VSIN",
    "VPULSE": "Simulation_SPICE:VPULSE",
    "IDC":   "Simulation_SPICE:IDC",
    "BAT":   "Device:Battery",
    "LAMP":  "Device:Lamp",
    "FUSE":  "Device:Fuse",
    "XTAL":  "Device:Crystal",
    "GND":   "power:GND",
    "VCC":   "power:VCC",
    "SCR":   "Device:Q_SCR_AKG",
    "TRIAC": "Device:Q_Triac",
    "DIAC":  "Device:DIAC",
    "VARACTOR": "Device:D_Capacitance",
    "TUNNEL": "Device:D_Tunnel",
    "MEMRISTOR": "Device:Memristor",
    "NTC":   "Device:Thermistor_NTC",
    "LDR":   "Device:R_Photo",
    "XFMR":  "Device:Transformer_1P_1S",
    "XFMR_CT": "Device:Transformer_1P_SS",
    # relays with their contacts flipped (see flip_contacts)
    "RELAY1": "Relay:Relay_SPDT",
    "RELAY2": "Relay:Relay_DPDT",
    "555":   "Timer:NE555P",
    # two triodes and a heater unit
    "TRIODE": "Valve:ECC83",
    # logic, by CircuitJS gate name and input count
    "AND2":  "74xx:74LS08",
    "AND3":  "74xx:74LS11",
    "AND4":  "74xx:74LS21",
    "NAND2": "74xx:74HC00",
    "NAND3": "74xx:74LS10",
    "NAND4": "74xx:74LS20",
    "NAND8": "74xx:74LS30",
    "NAND13": "74xx:74LS133",
    "AND8":  "4xxx_IEEE:4068",
    "OR8":   "4xxx_IEEE:4078",
    "OR2":   "74xx:74LS32",
    "OR3":   "4xxx:4075",
    "OR4":   "4xxx:4072",
    "NOR2":  "74xx:74HC02",
    "NOR3":  "74xx:74LS27",
    "NOR4":  "4xxx:4002",
    "XOR2":  "74xx:74HC86",
    "XNOR2": "4xxx:4077",
    "INV":   "74xx:74HC04",
    "SCHMITTINV": "74xx:74HC14",
    "SCHMITT": "74xx:74HC7014",
    "DFF":   "74xx:74HC74",
    "7SEG_CC": "Display_Character:SC39-11EWA",
    "7SEG_CA": "Display_Character:SA39-11EWA",
    "JKFF":  "74xx:74LS107",
    # active-high set and reset
    "DFF_H": "4xxx:4013",
    # 9-bit parity, for XOR and XNOR gates with more than 2 inputs
    "PARITY9": "74xx:74LS280",
    "COUNTER161": "74xx:74LS161",
    "COUNTER160": "74xx:74LS160",
    "COUNTER4520": "4xxx:4520",
    "COUNTER4518": "4xxx:4518",
    "COUNTER4040": "4xxx:4040",
    "REG175": "74xx:74LS175",
    "REG273": "74xx:74HC273",
    "LATCH373": "74xx:74HC373",
    "ASW": "4xxx:4066",
    "ASW2": "4xxx:4053",
    "DARL_NPN": "Transistor_BJT:TIP120",
    "DARL_PNP": "Transistor_BJT:TIP125",
    "BSOURCE": "Simulation_SPICE:BSOURCE",
    "VRANDOM": "Simulation_SPICE:VTRRANDOM",
}

# symbols changed from the library's, under a library name of our own so updating from
# KiCad's library doesn't undo the change: key -> (new lib id, function to apply)
MODIFIED = {}

# tokens newer than KiCad 9 that we drop
DROP = {"show_name", "do_not_autoplace", "in_pos_files", "duplicate_pin_numbers_are_jumpers"}

tok = re.compile(r'\s*(\(|\)|"(?:[^"\\]|\\.)*"|[^\s()"]+)')

def parse(s):
    stack = [[]]
    pos = 0
    while True:
        m = tok.match(s, pos)
        if not m:
            break
        t = m.group(1)
        pos = m.end()
        if t == '(':
            stack.append([])
        elif t == ')':
            x = stack.pop()
            stack[-1].append(x)
        else:
            stack[-1].append(t)
    return stack[0][0]

def dump(x, ind):
    tabs = '\t' * ind
    i = 0
    while i < len(x) and not isinstance(x[i], list):
        i += 1
    s = '(' + ' '.join(x[:i])
    if i == len(x):
        return s + ')'
    for c in x[i:]:
        s += '\n' + tabs + '\t' + (dump(c, ind + 1) if isinstance(c, list) else c)
    return s + '\n' + tabs + ')'

def child(x, key):
    for c in x:
        if isinstance(c, list) and c and c[0] == key:
            return c
    return None

libs = {}
def lib(name):
    if name not in libs:
        with open(f"{SYMDIR}/{name}.kicad_sym") as f:
            libs[name] = parse(f.read())
    return libs[name]

def find(libname, name):
    for c in lib(libname)[1:]:
        if isinstance(c, list) and c[0] == 'symbol' and c[1] == f'"{name}"':
            return c
    raise SystemExit(f"symbol {libname}:{name} not found")

def flatten(libname, name):
    sym = find(libname, name)
    ext = child(sym, 'extends')
    if not ext:
        return sym
    # derived symbol: parent's flags and drawing, child's properties
    parent = flatten(libname, ext[1].strip('"'))
    pname = parent[1].strip('"')
    out = ['symbol', sym[1]]
    # the child's properties, plus any of the parent's it doesn't override
    props = [c for c in sym if isinstance(c, list) and c[0] == 'property']
    names = {c[1] for c in props}
    props += [c for c in parent if isinstance(c, list) and c[0] == 'property' and c[1] not in names]
    for c in parent[2:]:
        if not isinstance(c, list) or c[0] == 'property':
            continue
        if c[0] == 'symbol':
            c = ['symbol', '"' + name + c[1].strip('"')[len(pname):] + '"'] + c[2:]
        out.append(c)
    # properties go after the flags, before the unit symbols
    first_unit = next(i for i, c in enumerate(out) if isinstance(c, list) and c[0] == 'symbol')
    out[first_unit:first_unit] = props
    return out

# KiCad's relays draw each pole's normally closed contact on the coil's side of the common,
# CircuitJS's on the far side.  mirror each pole's arm and contacts about its common (pins
# x1, x2 NC, x4 NO) so the two match, and extend the dashed linkage to the moved arms
def flip_contacts(sym, poles):
    units = [u for u in sym if isinstance(u, list) and u[0] == 'symbol']
    pin = {}
    for u in units:
        for p in u:
            if isinstance(p, list) and p[0] == 'pin':
                pin[child(p, 'number')[1].strip('"')] = child(p, 'at')
    fmt = lambda v: ('%.4f' % v).rstrip('0').rstrip('.')
    for u in units:
        shapes = [g for g in u if isinstance(g, list) and g[0] == 'polyline']
        def xy(g):
            return [c for c in child(g, 'pts')[1:]]
        dashes = [g for g in shapes if len(xy(g)) == 2 and all(float(c[2]) == 0 for c in xy(g))]
        for n in range(1, poles + 1):
            cx = float(pin[f"{n}1"][1])
            for g in shapes:
                if g in dashes or not all(abs(float(c[1]) - cx) <= 2.54 for c in xy(g)):
                    continue
                for c in xy(g):
                    c[1] = fmt(2 * cx - float(c[1]))
        if dashes:
            dash_end = max(float(c[1]) for g in dashes for c in xy(g))
            template = dashes[-1]
            # the last pole's arm crosses the linkage this far past its common
            cx = float(pin[f"{poles}1"][1])
            arm = next(g for g in shapes if g not in dashes and len(xy(g)) == 2 and
                       float(xy(g)[0][1]) == cx and float(xy(g)[0][2]) < 0 < float(xy(g)[1][2]))
            (x0, y0), (x1, y1) = [(float(c[1]), float(c[2])) for c in xy(arm)]
            cross = x0 + (x1 - x0) * (0 - y0) / (y1 - y0)
            x = dash_end + 0.635
            while x + 0.635 <= cross - 0.5:
                d = json.loads(json.dumps(template))
                xy(d)[0][1], xy(d)[1][1] = fmt(x), fmt(x + 0.635)
                u.insert(u.index(template) + 1, d)
                template = d
                x += 1.27
    for n in range(1, poles + 1):
        nc, no = pin[f"{n}2"], pin[f"{n}4"]
        nc[1], no[1] = no[1], nc[1]
    return sym

MODIFIED["RELAY1"] = ("CircuitJS:Relay_SPDT", lambda s: flip_contacts(s, 1))
MODIFIED["RELAY2"] = ("CircuitJS:Relay_DPDT", lambda s: flip_contacts(s, 2))

def rename(sym, libid):
    old = sym[1].strip('"').split(':')[-1]
    new = libid.split(':')[1]
    sym[1] = f'"{libid}"'
    for u in sym:
        if isinstance(u, list) and u[0] == 'symbol':
            u[1] = '"' + new + u[1].strip('"')[len(old):] + '"'
    return sym

def to_kicad9(x):
    if not isinstance(x, list):
        return x
    if x[0] == 'power':
        return ['power']
    out = []
    hide = None
    for c in x:
        if isinstance(c, list) and c and c[0] in DROP:
            continue
        if x[0] == 'property' and isinstance(c, list) and c[0] == 'hide':
            hide = c
            continue
        out.append(to_kicad9(c))
    if hide is not None:
        effects = child(out, 'effects')
        effects.append(hide)
    return out

# pin number -> (position, name, electrical type, unit), from the normal (not De Morgan) body
def pins(sym):
    res = {}
    for u in sym:
        if isinstance(u, list) and u[0] == 'symbol':
            m = re.match(r'"(.*)_(\d+)_(\d+)"', u[1])
            unit, style = m.group(2), m.group(3)
            if style == '2':
                continue
            for p in u:
                if isinstance(p, list) and p[0] == 'pin':
                    at = child(p, 'at')
                    res[child(p, 'number')[1].strip('"')] = ([float(at[1]), float(at[2])],
                        json.loads(child(p, 'name')[1]), p[1], int(unit), int(float(at[3])))
    return res

def prop(sym, name):
    for c in sym:
        if isinstance(c, list) and c[0] == 'property' and c[1] == f'"{name}"':
            return json.loads(c[2])
    return ""

print("// Generated by scripts/genKicadSymbols.py from the KiCad symbol libraries.  Do not edit.")
print("// The KiCad libraries are licensed CC-BY-SA 4.0 with an exception for designs")
print("// that use them: https://www.kicad.org/libraries/license/")
print()
print("export interface KicadSymbol {")
print("    libId: string;")
print("    ref: string;")
print("    footprint: string;")
print("    // pin number -> connection point in symbol coordinates (mm, y up)")
print("    pins: Record<string, [number, number]>;")
print("    // pin number -> name, electrical type, and unit (0 = in every unit)")
print("    names: Record<string, string>;")
print("    types: Record<string, string>;")
print("    units: Record<string, number>;")
print("    // pin number -> direction from its end toward the body (degrees, 0 = +x)")
print("    angles: Record<string, number>;")
print("    // definition for the schematic's lib_symbols section")
print("    def: string;")
print("}")
print()
print("export const KICAD_SYMBOLS: Record<string, KicadSymbol> = {")
for key, libid in SYMBOLS.items():
    libname, name = libid.split(':')
    sym = to_kicad9(flatten(libname, name))
    if key in MODIFIED:
        libid, change = MODIFIED[key]
        sym = rename(change(sym), libid)
    sym[1] = f'"{libid}"'
    entry = {
        "libId": libid,
        "ref": prop(sym, "Reference"),
        "footprint": prop(sym, "Footprint"),
        "pins": {n: v[0] for n, v in pins(sym).items()},
        "names": {n: v[1] for n, v in pins(sym).items()},
        "types": {n: v[2] for n, v in pins(sym).items()},
        "units": {n: v[3] for n, v in pins(sym).items()},
        "angles": {n: v[4] for n, v in pins(sym).items()},
        "def": dump(sym, 2),
    }
    print(f"    {json.dumps(key)}: {json.dumps(entry)},")
print("};")
