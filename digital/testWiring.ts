// Shared fake wiring for the digital tests: builds the same shape
// SimulationManager.makeNodeList() really hands DigitalGraphBuilder (one node object per
// electrical node, carrying a link for every post on it), without needing a real circuit stamp.

interface FakeNode { links: { num: number; elm: any }[]; v: number }

/** Ties every listed post onto one shared node.
 *
 * Merges into whatever node these posts already sit on rather than minting a fresh one per call:
 * a post wired up by more than one connect() call (a fanned-out clock, say) has to end up on ONE
 * node object carrying ALL of its links. DigitalGraphBuilder.collectOutputsByNode() indexes
 * drivers by node identity from the DRIVER's own nodes[] entry, so a driver left pointing at just
 * the last node minted for it silently loses every earlier consumer - which reads as a circuit
 * that builds fine and then never does anything. */
export function connect(...posts: { elm: any; num: number }[]): void {
    const node: FakeNode = posts.map(p => p.elm.nodes[p.num]).find((n: any) => n != null) ?? { links: [], v: 0 };
    const add = (num: number, elm: any) => {
        if (!node.links.some(l => l.elm === elm && l.num === num)) node.links.push({ num, elm });
    };
    for (const p of posts) {
        const old: FakeNode | undefined = p.elm.nodes[p.num];
        if (old != null && old !== node)
            for (const l of old.links) { add(l.num, l.elm); l.elm.nodes[l.num] = node; }
        add(p.num, p.elm);
        p.elm.nodes[p.num] = node;
    }
}
