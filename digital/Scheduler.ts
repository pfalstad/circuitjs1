/*
    Two-phase (delta-cycle) discrete event scheduler, ported from cycle4's
    scheduler.py. See doc.txt section 8 for the full rationale.

    Generic over any Schedulable: an object with prepare()/commit() and an
    optional commit_after() used to order same-timestamp dependencies. This
    file has no knowledge of circuits, gates, or anything digital-specific.
*/

/** Sentinel commit_after() can return: this object depends on the ENTIRE
 * rest of its batch having committed first, rather than on any specific
 * other object. For a pure observer (e.g. a periodic sampler that just
 * reads current state) that isn't part of the dependency graph at all,
 * listing every other object that happens to share its timestamp isn't
 * possible (commit_after() is called per-object, without visibility into
 * the rest of the batch) - and isn't the right model anyway, since an
 * observer wants "after everything real has settled," not "after these
 * specific things." */
export const LAST = Symbol("LAST");

export interface Schedulable {
    /**
     * Phase 1: decide what this event WOULD do, using only state already
     * committed from before this timestamp's current delta round. Must not
     * mutate anything. Returns an opaque pending record for commit().
     */
    prepare(arg: unknown): unknown;
    /**
     * Phase 2: apply what prepare() decided. Safe to mutate - every object
     * in this delta round has already finished prepare() by the time any
     * commit() runs.
     */
    commit(pending: unknown): void;
    /**
     * Which objects from the same delta-round batch (if present) this
     * object's own commit depends on having already happened. Return the
     * LAST sentinel for a pure observer that must run after everything
     * else in the batch. Objects with no same-batch dependency (the common
     * case) may omit this entirely.
     */
    commit_after?(): Set<Schedulable> | typeof LAST;
}

interface QueueEntry {
    time: number;
    order: number;
    obj: Schedulable;
    arg: unknown;
}

/** Binary min-heap keyed by (time, order), so scheduling/popping stays
 * O(log n) even with a large number of pending events. */
class EventHeap {
    private heap: QueueEntry[] = [];

    get size(): number { return this.heap.length; }
    peekTime(): number { return this.heap[0].time; }

    push(entry: QueueEntry): void {
        const heap = this.heap;
        heap.push(entry);
        let i = heap.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.before(heap[i], heap[parent])) {
                [heap[i], heap[parent]] = [heap[parent], heap[i]];
                i = parent;
            } else break;
        }
    }

    pop(): QueueEntry {
        const heap = this.heap;
        const top = heap[0];
        const last = heap.pop()!;
        if (heap.length > 0) {
            heap[0] = last;
            let i = 0;
            for (;;) {
                const l = 2 * i + 1, r = 2 * i + 2;
                let smallest = i;
                if (l < heap.length && this.before(heap[l], heap[smallest])) smallest = l;
                if (r < heap.length && this.before(heap[r], heap[smallest])) smallest = r;
                if (smallest === i) break;
                [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
                i = smallest;
            }
        }
        return top;
    }

    private before(a: QueueEntry, b: QueueEntry): boolean {
        return a.time !== b.time ? a.time < b.time : a.order < b.order;
    }
}

export class Scheduler {
    currentTime = 0;
    private queue = new EventHeap();
    private orderCounter = 0;

    schedule(time: number, obj: Schedulable, arg: unknown = null): void {
        if (time < this.currentTime)
            throw new Error("Cannot schedule an event in the past.");
        this.queue.push({ time, order: this.orderCounter++, obj, arg });
    }

    /**
     * Run in time order. Within one timestamp, events are dispatched in
     * delta rounds: every event queued for time T is first prepare()d
     * (reading only state committed before T), then committed - if
     * committing produces MORE events at exactly T, that's a new delta
     * round, repeated until no more same-T events remain, before finally
     * advancing to the next T. See this file's header and doc.txt section 8.
     */
    run(): void {
        this.runWhile(() => this.queue.size > 0);
    }

    /** Like run(), but stops once no event remains at or before maxTime -
     * needed for anything that schedules itself forever (a free-running
     * clock), which run() would otherwise never return from. */
    runUntil(maxTime: number): void {
        this.runWhile(() => this.queue.size > 0 && this.queue.peekTime() <= maxTime);
    }

    private runWhile(shouldContinue: () => boolean): void {
        while (shouldContinue()) {
            const time = this.queue.peekTime();
            this.currentTime = time;
            while (this.queue.size > 0 && this.queue.peekTime() === time) {
                const batch: { obj: Schedulable; arg: unknown }[] = [];
                while (this.queue.size > 0 && this.queue.peekTime() === time) {
                    const e = this.queue.pop();
                    batch.push({ obj: e.obj, arg: e.arg });
                }
                this.commitByTiers(batch);
            }
        }
    }

    private commitAfter(obj: Schedulable): Set<Schedulable> | typeof LAST {
        return obj.commit_after ? obj.commit_after() : new Set();
    }

    private commitByTiers(batch: { obj: Schedulable; arg: unknown }[]): void {
        const deferred = batch.filter(e => this.commitAfter(e.obj) === LAST);
        let remaining = batch.filter(e => this.commitAfter(e.obj) !== LAST);
        while (remaining.length > 0) {
            const objSet = new Set(remaining.map(e => e.obj));
            let tier = remaining.filter(e => {
                const deps = this.commitAfter(e.obj) as Set<Schedulable>;
                for (const d of deps) if (objSet.has(d)) return false;
                return true;
            });
            if (tier.length === 0)
                // A same-batch dependency cycle - shouldn't happen for a real
                // trust relationship (a DAG by construction), but fall back
                // to processing everything together rather than looping forever.
                tier = remaining;
            const tierSet = new Set(tier.map(e => e.obj));
            remaining = remaining.filter(e => !tierSet.has(e.obj));
            this.commitTier(tier);
        }
        this.commitTier(deferred);
    }

    private commitTier(tier: { obj: Schedulable; arg: unknown }[]): void {
        const prepared = tier.map(e => ({ obj: e.obj, pending: e.obj.prepare(e.arg) }));
        for (const { obj, pending } of prepared)
            obj.commit(pending);
    }
}
