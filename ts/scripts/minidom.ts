// Just enough of the DOM's XML support for the simulator's XML loading and models to work
// under Node: documents, elements, text, a parser and a serializer.  It reads well-formed
// XML as CircuitJS writes it (attributes, nested elements, text, entities, comments and
// processing instructions); it doesn't check it.

const ELEMENT_NODE = 1, TEXT_NODE = 3;

const decode = (s: string) => s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-fA-F]+);/g, (_, e: string) =>
    e === "lt" ? "<" : e === "gt" ? ">" : e === "quot" ? '"' : e === "apos" ? "'" : e === "amp" ? "&" :
    String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1))));
const encode = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

class MiniText {
    nodeType = TEXT_NODE;
    constructor(public nodeValue: string) {}
    get textContent(): string { return this.nodeValue; }
    cloneNode(): MiniText { return new MiniText(this.nodeValue); }
}

class MiniElement {
    nodeType = ELEMENT_NODE;
    private attrs = new Map<string, string>();
    childNodes: (MiniElement | MiniText)[] = [];
    constructor(public tagName: string) {}
    get nodeName(): string { return this.tagName; }
    get localName(): string { return this.tagName; }
    get children(): MiniElement[] { return this.childNodes.filter((n): n is MiniElement => n.nodeType === ELEMENT_NODE); }
    get firstChild(): MiniElement | MiniText | null { return this.childNodes[0] ?? null; }
    get firstElementChild(): MiniElement | null { return this.children[0] ?? null; }
    get attributes(): { name: string; value: string }[] { return [...this.attrs].map(([name, value]) => ({ name, value })); }
    get textContent(): string { return this.childNodes.map(n => n.textContent).join(""); }
    getAttribute(name: string): string | null { return this.attrs.get(name) ?? null; }
    setAttribute(name: string, value: string): void { this.attrs.set(name, String(value)); }
    hasAttribute(name: string): boolean { return this.attrs.has(name); }
    removeAttribute(name: string): void { this.attrs.delete(name); }
    appendChild<T extends MiniElement | MiniText>(n: T): T { this.childNodes.push(n); return n; }
    getElementsByTagName(tag: string): MiniElement[] {
        return this.children.flatMap(c => [...(tag === "*" || c.tagName === tag ? [c] : []), ...c.getElementsByTagName(tag)]);
    }
    cloneNode(deep = false): MiniElement {
        const e = new MiniElement(this.tagName);
        for (const [k, v] of this.attrs)
            e.attrs.set(k, v);
        if (deep)
            e.childNodes = this.childNodes.map(n => n.cloneNode(true));
        return e;
    }
}

class MiniDocument {
    nodeType = 9;
    documentElement: MiniElement;
    constructor(root: string) { this.documentElement = new MiniElement(root); }
    createElement(tag: string): MiniElement { return new MiniElement(tag); }
    createTextNode(s: string): MiniText { return new MiniText(s); }
    importNode<T extends MiniElement | MiniText>(n: T, deep = false): T { return n.cloneNode(deep) as T; }
    getElementsByTagName(tag: string): MiniElement[] {
        const r = this.documentElement;
        return [...(tag === "*" || r.tagName === tag ? [r] : []), ...r.getElementsByTagName(tag)];
    }
}

function parse(text: string): MiniDocument {
    let doc: MiniDocument | null = null;
    const stack: MiniElement[] = [];
    const re = /<!--[^]*?-->|<\?[^]*?\?>|<!\[CDATA\[([^]*?)\]\]>|<!DOCTYPE[^>]*>|<\/\s*([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
    for (let m; (m = re.exec(text)) !== null; ) {
        const [, cdata, close, open, attrs, selfClose, chars] = m;
        const top = stack[stack.length - 1];
        if (close !== undefined)
            stack.pop();
        else if (open !== undefined) {
            const e = new MiniElement(open);
            for (const a of attrs.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
                e.setAttribute(a[1], decode(a[2] ?? a[3]));
            if (top)
                top.appendChild(e);
            else if (!doc) {
                doc = new MiniDocument(open);
                doc.documentElement = e;
            }
            if (!selfClose)
                stack.push(e);
        } else if (top && (cdata !== undefined || chars !== undefined))
            top.appendChild(new MiniText(cdata ?? decode(chars)));
    }
    if (!doc)
        throw new Error("no XML document element");
    return doc;
}

function serialize(n: MiniDocument | MiniElement | MiniText): string {
    if (n instanceof MiniDocument)
        return serialize(n.documentElement);
    if (n instanceof MiniText)
        return encode(n.nodeValue);
    const attrs = n.attributes.map(a => ` ${a.name}="${encode(a.value)}"`).join("");
    return n.childNodes.length === 0 ? `<${n.tagName}${attrs}/>`
                                     : `<${n.tagName}${attrs}>${n.childNodes.map(serialize).join("")}</${n.tagName}>`;
}

export const miniImplementation = {
    createDocument: (_ns: string | null, root: string) => new MiniDocument(root),
};

// puts the DOM's XML classes on the global object
export function installMiniDom(g: any = globalThis): void {
    g.DOMParser = class { parseFromString(text: string) { return parse(text); } };
    g.XMLSerializer = class { serializeToString(n: any) { return serialize(n); } };
    g.Node = { ELEMENT_NODE, TEXT_NODE };
    if (g.window)
        Object.assign(g.window, { DOMParser: g.DOMParser, XMLSerializer: g.XMLSerializer });
}
