// Circular queue. When an item is inserted into a full queue, the oldest item is evicted.
// Ported verbatim from dice-ts/src/cirque.ts (a straight TS port of DICE's cirque<T>).
//
// The original C++ `cirque<T>::index` is a value type that bundles a raw position with the
// queue's mask. Since every index used in this codebase is only ever used against the queue
// it came from, we drop the bundled mask and just pass around plain (already-wrapped) numbers,
// masking on every queue operation instead. `index.getRawIndex()` in the C++ becomes a no-op
// (the number already *is* the raw index).
export class Cirque<T> {
    private queue: T[];
    private mask: number;
    private first: number;
    private next: number;

    constructor(queueSize: number, fill?: () => T) {
        this.mask = queueSize - 1;
        this.queue = fill ? new Array(queueSize).fill(0).map(() => fill()) : new Array(queueSize);
        this.first = 0;
        this.next = 0;
    }

    empty(): boolean { return this.first === this.next; }
    full(): boolean { return ((this.next + 1) & this.mask) === this.first; }
    size(): number { return (this.next - this.first) & this.mask; }
    getQueueSize(): number { return this.mask + 1; }

    push_back(x: T): void {
        this.queue[this.next] = x;
        this.next = (this.next + 1) & this.mask;
        if (this.next === this.first) this.pop_front();
    }

    pop_front(): void { this.first = (this.first + 1) & this.mask; }
    pop_back(): void { this.next = (this.next - 1) & this.mask; }
    clear(): void { this.first = this.next; }

    // Erase values up to, but not including, index i.
    erase_front(i: number): void { this.first = i; }
    // Erase values after, but not including, index i.
    erase_back(i: number): void { this.next = (i + 1) & this.mask; }

    get(i: number): T { return this.queue[i]; }
    set(i: number, v: T): void { this.queue[i] = v; }

    front(): T { return this.queue[this.first]; }
    back(): T { return this.queue[(this.next - 1) & this.mask]; }

    begin(): number { return this.first; }
    end(): number { return this.next; }

    inc(i: number, n = 1): number { return (i + n) & this.mask; }
    dec(i: number, n = 1): number { return (i - n) & this.mask; }
    neq(a: number, b: number): boolean { return a !== b; }
}

// Numeric specialization of Cirque.
//
// This is a separate class, not `Cirque<number>`, on purpose. Generics erase at runtime, so a
// shared class means `get()`'s `this.queue[i]` load sees both an array of Event objects
// (PACKED_ELEMENTS) and an array of numbers (PACKED_DOUBLE_ELEMENTS). That makes the load
// polymorphic and stops V8 specializing it -- Cirque.get was ~8.6% of total runtime with one
// shared class, despite being a one-line array read. Keeping the numeric queues in their own
// class leaves every Cirque<T> site monomorphic on Event.
//
// A plain number[] is deliberate: a Float64Array measured identically, because the whole win
// comes from the class split, not the backing store -- once get() only ever sees one elements
// kind, V8 specializes it regardless. These hold both small raw queue indexes and tick
// timestamps, so the values stay numeric either way.
export class CirqueNum {
    private queue: number[];
    private mask: number;
    private first: number;
    private next: number;

    constructor(queueSize: number) {
        this.mask = queueSize - 1;
        this.queue = new Array(queueSize).fill(0);
        this.first = 0;
        this.next = 0;
    }

    empty(): boolean { return this.first === this.next; }
    full(): boolean { return ((this.next + 1) & this.mask) === this.first; }
    size(): number { return (this.next - this.first) & this.mask; }
    getQueueSize(): number { return this.mask + 1; }

    push_back(x: number): void {
        this.queue[this.next] = x;
        this.next = (this.next + 1) & this.mask;
        if (this.next === this.first) this.pop_front();
    }

    pop_front(): void { this.first = (this.first + 1) & this.mask; }
    pop_back(): void { this.next = (this.next - 1) & this.mask; }
    clear(): void { this.first = this.next; }

    erase_front(i: number): void { this.first = i; }
    erase_back(i: number): void { this.next = (i + 1) & this.mask; }

    get(i: number): number { return this.queue[i]; }
    set(i: number, v: number): void { this.queue[i] = v; }

    front(): number { return this.queue[this.first]; }
    back(): number { return this.queue[(this.next - 1) & this.mask]; }

    begin(): number { return this.first; }
    end(): number { return this.next; }

    inc(i: number, n = 1): number { return (i + n) & this.mask; }
    dec(i: number, n = 1): number { return (i - n) & this.mask; }
    neq(a: number, b: number): boolean { return a !== b; }
}
