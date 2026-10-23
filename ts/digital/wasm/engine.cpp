// The digital engine (digital/chip.ts, digital/circuit.ts, digital/cirque.ts) ported to C++
// for WebAssembly. A line-by-line port: the TypeScript engine is the reference, and the two must
// produce bit-identical state (scripts/bench-wasm.ts checks). Comments here are deliberately
// thin - the TypeScript source carries the explanations, and every function below has the same
// name there.
//
// Numeric notes:
//  - Times are doubles, exactly like the TS `number` times, so every comparison, modulo and
//    Infinity (MAX_U64) behaves the same. Do not build with -ffast-math.
//  - Bit masks are int32_t, matching JS's 32-bit bitwise operators. Shifts go through shl1()/
//    sra() so a shift count is masked to 5 bits the way JS masks it.
//
// The custom (CUSTOM_CHIP) cells are built-in kinds here, mirroring digital/nativeKinds.ts.
// Building: scripts/build-wasm.sh.

#include <cstdint>
#include <cstring>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <vector>
#include <emscripten.h>
#include <emscripten/html5.h> // emscripten_date_now()

typedef double Time;
static const Time MAX_U64 = INFINITY;

static inline int32_t shl1(int n) { return (int32_t)(1u << (n & 31)); }
static inline int32_t sra(int32_t x, int n) { return x >> (n & 31); }
static inline int nextBit(int32_t x) { return x == 0 ? 0 : __builtin_ctz((uint32_t)x); }

[[noreturn]] static void fatal(const char* msg) {
    fprintf(stderr, "digital engine: %s\n", msg);
    abort();
}

// chip.ts's module-level mask watchdog: a lifetime count, never reset (same as the TS).
static int maskWatchCount = 0;
static inline void globalMaskWatchdog() {
    if (++maskWatchCount > 3000000) fatal("mask-scan loop exceeded watchdog limit");
}

static const int SKIP_MULT = 2;

enum ChipType { SIMPLE_CHIP = 0, BASIC_CHIP = 1, CUSTOM_CHIP = 2 };
enum ChipState { ACTIVE = 0, PASSIVE = 1, ASLEEP = 2 };

// Matches netlist.ts's NetKind.
enum Kind { K_LUT = 0, K_VCC = 1, K_GND = 2, K_DEOPT = 3, K_NOP = 4, K_CLOCK = 5, K_SOURCE = 6,
            K_SRAM = 7, K_MONO_Q = 8, K_MONO_EXP = 9 };

// ---------------------------------------------------------------- cirque.ts

template <class T>
struct Cirque {
    T* queue = nullptr;
    int mask = 0, first = 0, next = 0;

    void init(int queueSize) {
        mask = queueSize - 1;
        queue = new T[queueSize]();
        first = next = 0;
    }

    bool empty() const { return first == next; }
    bool full() const { return ((next + 1) & mask) == first; }
    int size() const { return (next - first) & mask; }
    int getQueueSize() const { return mask + 1; }

    void push_back(const T& x) {
        queue[next] = x;
        next = (next + 1) & mask;
        if (next == first) pop_front();
    }

    void pop_front() { first = (first + 1) & mask; }
    void pop_back() { next = (next - 1) & mask; }
    void clear() { first = next; }

    void erase_front(int i) { first = i; }
    void erase_back(int i) { next = (i + 1) & mask; }

    T& get(int i) { return queue[i]; }
    void set(int i, const T& v) { queue[i] = v; }

    T& front() { return queue[first]; }
    T& back() { return queue[(next - 1) & mask]; }

    int begin() const { return first; }
    int end() const { return next; }

    int inc(int i, int n = 1) const { return (i + n) & mask; }
    int dec(int i, int n = 1) const { return (i - n) & mask; }
};

// ---------------------------------------------------------------- chip.ts

struct LinkMask {
    uint32_t* words;
    int n;
    uint32_t inl;

    LinkMask() : words(&inl), n(1), inl(0) {}
    LinkMask(const LinkMask&) = delete;
    LinkMask& operator=(const LinkMask&) = delete;

    void resize(int nwords, bool keep) {
        uint32_t* w = new uint32_t[nwords]();
        if (keep) memcpy(w, words, sizeof(uint32_t) * (n < nwords ? n : nwords));
        if (words != &inl) delete[] words;
        words = w;
        n = nwords;
    }

    uint32_t word(int w) const { return w < n ? words[w] : 0; }

    void setBit(int i) {
        int w = i >> 5;
        if (w >= n) resize(w + 1, true);
        words[w] |= 1u << (i & 31);
    }

    void clearBit(int i) {
        int w = i >> 5;
        if (w < n) words[w] &= ~(1u << (i & 31));
    }

    bool testBit(int i) const {
        int w = i >> 5;
        return w < n && (words[w] & (1u << (i & 31))) != 0;
    }

    bool isZero() const {
        if (n == 1) return words[0] == 0;
        for (int k = 0; k < n; k++) if (words[k] != 0) return false;
        return true;
    }

    void copyFrom(const LinkMask& o) {
        if (n == 1 && o.n == 1) { words[0] = o.words[0]; return; }
        if (n < o.n) { resize(o.n, false); memcpy(words, o.words, sizeof(uint32_t) * o.n); return; }
        memcpy(words, o.words, sizeof(uint32_t) * o.n);
        for (int k = o.n; k < n; k++) words[k] = 0;
    }

    void setLow(int nb) {
        int need = (nb + 31) >> 5;
        if (need < 1) need = 1;
        if (n < need) resize(need, true);
        for (int k = 0; k < n; k++) {
            int lo = k << 5;
            if (lo + 32 <= nb) words[k] = ~0u;
            else if (lo >= nb) words[k] = 0;
            else words[k] = (1u << (nb - lo)) - 1;
        }
    }
};

struct Chip;
struct Cycle;

struct ChipLink {
    Chip* chip;
    int32_t mask;
};

struct Event {
    Time time;
    Cycle* subCycle;
    int32_t state;
    int32_t type;
};

static inline Event mkEvent(Time time, int32_t state = 0, int32_t type = 0, Cycle* subCycle = nullptr) {
    Event e;
    e.time = time; e.subCycle = subCycle; e.state = state; e.type = type;
    return e;
}

struct SubcycleAllocator {
    uint64_t bits = 0;
    int size = 0;
    uint64_t fullMask = 0;

    void init(int s) {
        size = s;
        fullMask = s >= 64 ? ~0ull : ((1ull << s) - 1);
    }

    bool full() const { return bits == fullMask; }
    void deallocate(const SubcycleAllocator& a) { bits &= ~a.bits; }

    int allocate() {
        int i = 0;
        uint64_t b = bits;
        while (b & 1) {
            if (i >= 63 || i + 1 > 1000) fatal("SubcycleAllocator.allocate stuck");
            b >>= 1; i++;
        }
        bits |= (1ull << i);
        return i;
    }

    void orEq(const SubcycleAllocator& a) { bits |= a.bits; }
    void clear() { bits = 0; }
    void set(int n) { bits |= (1ull << n); }
};

struct Cycle {
    Cycle* parentCycle = nullptr;
    SubcycleAllocator allocatedSubCycles;

    Cirque<Event> outputEvents;
    int firstOutputEvent;
    int currentOutputEvent;

    Time activationTime = 0;
    Time cycleTime = 0;
    Time cycleDuration = 0;
    Time endTime = 0;
    LinkMask activeOutputs;

    Cycle(int queueSize, int subcycleSize) {
        outputEvents.init(queueSize);
        firstOutputEvent = outputEvents.begin();
        currentOutputEvent = outputEvents.begin();
        allocatedSubCycles.init(subcycleSize);
    }

    Time nextOutputEventDelay() {
        if (currentOutputEvent == firstOutputEvent) {
            return outputEvents.get(firstOutputEvent).time + cycleTime - outputEvents.back().time;
        } else {
            int prev = outputEvents.dec(currentOutputEvent);
            return outputEvents.get(currentOutputEvent).time - outputEvents.get(prev).time;
        }
    }

    Cycle* nextOutputCycle(Time time) {
        Event& ev = outputEvents.get(currentOutputEvent);

        if (ev.type) {
            Cycle* cycle = ev.subCycle;

            currentOutputEvent = outputEvents.inc(currentOutputEvent);
            if (currentOutputEvent == outputEvents.end()) currentOutputEvent = firstOutputEvent;

            cycle->endTime = time + cycle->cycleDuration;
            if (cycle->endTime > endTime) cycle->endTime = endTime;
            cycle->activationTime = time;
            cycle->activeOutputs.copyFrom(activeOutputs);
            cycle->currentOutputEvent = cycle->firstOutputEvent;

            return cycle->nextOutputCycle(time);
        }

        currentOutputEvent = outputEvents.inc(currentOutputEvent);
        if (currentOutputEvent == outputEvents.end()) currentOutputEvent = firstOutputEvent;

        return this;
    }
};

// A backfill replay position: frames[0] is the chip itself (outermost), frames.back() the
// innermost. The TS keeps this as a linked list; a vector of frames is the same thing.
struct Frame {
    Cycle* level;
    int idx;
    Time entryTime;
    Time exitBound;
};
typedef std::vector<Frame> BackfillPos;

static void pushEnteredCycle(BackfillPos& frames, Cycle* cycle, Time absTime, Time exitBound) {
    Cycle* level = cycle;
    Time bound = exitBound;
    for (;;) {
        Cirque<Event>& oe = level->outputEvents;
        Event& ev = oe.get(level->firstOutputEvent);
        int after = oe.inc(level->firstOutputEvent);
        if (after == oe.end()) after = level->firstOutputEvent;
        frames.push_back({ level, after, absTime, bound });
        if (!ev.type) return;
        Cycle* sub = ev.subCycle;
        Time rawExit = absTime + sub->cycleDuration;
        bound = rawExit < bound ? rawExit : bound;
        level = sub;
    }
}

static inline Time rawDelay(Cycle* level, int idx) {
    Cirque<Event>& oe = level->outputEvents;
    return idx == level->firstOutputEvent
        ? oe.get(level->firstOutputEvent).time + level->cycleTime - oe.back().time
        : oe.get(idx).time - oe.get(oe.dec(idx)).time;
}

struct HistoryEntry { Time time; int32_t value; };

// advanceBackfillPos(). `pos`/`absTime`/`value` are the cursor, updated in place; returns
// `complete`. `record`, when non-null, receives every crossing (enumerate mode).
static bool advanceBackfillPos(BackfillPos& pos, Time& absTime, int32_t& value, Time now,
                               std::vector<HistoryEntry>* record) {
    static BackfillPos frames;
    const int maxIterations = 1000000;

    for (int iterations = 0; ; iterations++) {
        if (iterations >= maxIterations) {
            fprintf(stderr, "advanceBackfillPos: exceeded %d iterations without reaching now=%.17g (at absTime=%.17g) - deferring the rest to a later call\n",
                    maxIterations, now, absTime);
            return false;
        }

        if (record == nullptr && pos[0].level->cycleTime > 0) {
            Time ct = pos[0].level->cycleTime;
            Time periods = std::trunc((now - absTime - 1) / ct);
            periods -= std::fmod(periods, (Time)SKIP_MULT);
            if (periods > 0) {
                Time shift = periods * ct;
                absTime += shift;
                for (Frame& f : pos) { f.entryTime += shift; f.exitBound += shift; }
                continue;
            }
        }

        Frame& inner = pos.back();
        Cycle* level = inner.level;

        if (record == nullptr && level->cycleTime > 0) {
            Time bound = inner.exitBound < now ? inner.exitBound : now;
            Time elapsed = bound - absTime;
            if (elapsed > level->cycleTime) {
                Time periods = std::trunc((elapsed - 1) / level->cycleTime);
                if (periods > 0) {
                    absTime += periods * level->cycleTime;
                    continue;
                }
            }
        }

        Time delay = rawDelay(level, inner.idx);

        int climbIdx = (int)pos.size() - 1;
        while (absTime + delay >= pos[climbIdx].exitBound && climbIdx > 0) {
            Frame& abandoned = pos[climbIdx];
            climbIdx--;
            Frame& parent = pos[climbIdx];
            Time parentDelay = rawDelay(parent.level, parent.idx);
            Time consumed = absTime - abandoned.entryTime;
            if (parentDelay > consumed) delay = parentDelay - consumed;
        }

        Time candidate = absTime + delay;

        if (candidate > now) return true;
        if (candidate <= absTime) return true;

        frames.assign(pos.begin(), pos.begin() + climbIdx + 1);
        Frame climbed = frames[climbIdx];
        Cycle* climbedLevel = climbed.level;
        Cirque<Event>& climbedOe = climbedLevel->outputEvents;

        value ^= 1;
        absTime = candidate;
        if (record) record->push_back({ absTime, value });

        Event justCrossed = climbedOe.get(climbed.idx);
        int nextIdx = climbedOe.inc(climbed.idx);
        if (nextIdx == climbedOe.end()) nextIdx = climbedLevel->firstOutputEvent;
        frames.back() = { climbedLevel, nextIdx, climbed.entryTime, climbed.exitBound };

        if (justCrossed.type) {
            Cycle* subCycle = justCrossed.subCycle;
            Time rawExit = absTime + subCycle->cycleDuration;
            Time subExit = rawExit < climbed.exitBound ? rawExit : climbed.exitBound;
            pushEnteredCycle(frames, subCycle, absTime, subExit);
        }

        pos.swap(frames);
    }
}

struct Circuit;

struct SramMem { int addrBits; std::vector<int32_t> words; };
struct MonoGroup { Chip* expireChip = nullptr; bool lastT = false; };

struct Chip : Cycle {
    Circuit* circuit;

    int32_t inputs = 0;
    int32_t _output = 0;
    std::vector<HistoryEntry> history;

    int32_t eventMask = ~0;
    int32_t prevOutputMask = 0;

    Time delay[2] = { 0, 0 };
    Time pendingEvent = 0;

    std::vector<ChipLink> outputLinks;
    std::vector<ChipLink> inputLinks;

    ChipType type = CUSTOM_CHIP;
    Kind kind = K_NOP;

    uint32_t lutData = 0;
    uint32_t* lut = nullptr;

    // Kind parameters (see netlist.ts's flattenNetlist()).
    Time param[4] = { 0, 0, 0, 0 };

    bool optimizationDisabled = false;
    bool isDeoptimizer = false;
    bool isConstantSource = false;

    int maskWords = 1;
    int chipIndex = 0;

    LinkMask actOutSnap;

    ChipState state = PASSIVE;

    Cirque<Event> inputEvents;
    Cirque<Time> inputEventEndTime;
    std::vector<Cirque<int32_t>> inputEventTable;
    int firstInputTablePos = 0;

    int firstInputEvent = 0;
    int32_t firstInputMask = 0;
    int32_t activeInputs = 0;

    Time sleepTime = 0;

    BackfillPos backfillPos;
    Time backfillAbsTime = 0;
    int32_t backfillValue = 0;

    BackfillPos valuePos;
    bool valuePosSet = false;
    Time valueAbsTime = 0;
    int32_t valueValue = 0;
    Time valueSleepTime = -1;

    bool historyWatched = false;

    std::vector<Cycle*> subCycles;
    Cycle* currentCycle;

    std::vector<Cycle*> activationCycles;

    std::vector<Time> lastInputEvent;
    Time lastOutputEvent = 0;

    bool visited = false;

    Chip(int queueSize, int subcycleSize, Circuit* c) : Cycle(queueSize, subcycleSize), circuit(c) {
        currentCycle = this;
        inputEvents.init(queueSize);
        inputEventEndTime.init(queueSize);
        subCycles.assign(subcycleSize, nullptr);
        backfillPos.push_back({ this, 0, 0, MAX_U64 });
    }

    int32_t output() const { return _output; }
    void setOutput(int32_t v);

    void customUpdate(int32_t mask);
    void initialize();
    void connect(Chip* chip, int i, int32_t extraMask);
    Time climbToValidCycle(Time globalTime, Time time, Time delay);
    bool catchUpHistoryBeforeWake();
    void deactivateDiff(const LinkMask& a, const LinkMask& b);
    int32_t getNextOutput(Time time);
    void wakeUp();
    void updateInputs(int32_t mask);
    void updateInputsSimple(int32_t mask);
    void updateOutput();
    Time activationCheck(Time minTimeParam, Time maxTimeParam);
    void activateInputs();
    void deactivateOutputs();
    Time backfillHistory(Time now);
    void skipBackfillTo(Time target);
    int32_t currentValue();
    void captureBackfillPos();

    inline int32_t lutLookup() const {
        if (type == SIMPLE_CHIP) return (int32_t)((lutData >> (inputs & 31)) & 1);
        return (int32_t)((lut[inputs >> 5] >> (inputs & 0x1f)) & 1);
    }

    void growInputEventTable() {
        while ((int)inputEventTable.size() <= inputs) {
            inputEventTable.emplace_back();
            inputEventTable.back().init(outputEvents.getQueueSize());
        }
    }
};

// ---------------------------------------------------------------- circuit.ts

static const int DEADLINE_CHECK_INTERVAL = 64;

struct Circuit {
    std::vector<Chip*> chips;
    Time globalTime = 0;
    bool haltRequested = false;

    std::vector<SramMem> srams;
    std::vector<MonoGroup> monoGroups;

    // Heap, index 0 unused.
    int queueSize = 0;
    std::vector<Time> queueTime;
    std::vector<Chip*> queueChip;
    std::vector<int32_t> queueIdx;

    // Not in the TS engine's state; for the harness.
    double eventCount = 0;
    double updateCount = 0;

    Circuit() {
        queueTime.assign(4097, 0);
        queueChip.assign(4097, nullptr);
        queueIdx.assign(4097, 0);
    }

    void requestHalt() { haltRequested = true; }

    Time queuePush(Chip* chip, Time delay) {
        Time time = globalTime + delay;
        if (queueSize + 1 >= (int)queueTime.size()) {
            size_t n = queueTime.size() * 2;
            queueTime.resize(n); queueChip.resize(n); queueIdx.resize(n);
        }
        Time* qt = queueTime.data();
        Chip** qc = queueChip.data();
        int32_t* qi = queueIdx.data();
        int32_t ci = chip->chipIndex;

        int i = ++queueSize;
        for (int p = i >> 1;
             i > 1 && (qt[p] >= time && (qt[p] > time || qi[p] > ci));
             p = i >> 1) {
            qt[i] = qt[p];
            qc[i] = qc[p];
            qi[i] = qi[p];
            i = p;
        }
        qt[i] = time;
        qc[i] = chip;
        qi[i] = ci;

        return time;
    }

    void queuePop() {
        Time* qt = queueTime.data();
        Chip** qc = queueChip.data();
        int32_t* qi = queueIdx.data();
        Time time = qt[queueSize];
        Chip* chip = qc[queueSize];
        int32_t ci = qi[queueSize];

        int i = 1;
        queueSize--;
        int n = queueSize + 1;

        while ((i << 1) < n) {
            int child = i << 1;
            int c1 = child + 1;
            if (c1 < n) {
                Time a = qt[c1], b = qt[child];
                if (a < b || (a == b && qi[c1] < qi[child])) child++;
            }
            Time ct = qt[child];
            if (time <= ct) {
                if (time < ct || ci <= qi[child]) break;
            }
            qt[i] = qt[child];
            qc[i] = qc[child];
            qi[i] = qi[child];
            i = child;
        }

        qt[i] = time;
        qc[i] = chip;
        qi[i] = ci;
    }

    inline void dispatchTop() {
        Chip* chip = queueChip[1];
        queuePop();
        eventCount++;
        if (globalTime == chip->pendingEvent) { updateCount++; chip->updateOutput(); }
    }

    void drainZeroDelayEvents() {
        while (queueSize && queueTime[1] == globalTime) dispatchTop();
    }

    void run(Time runTimeIn) {
        haltRequested = false;
        Time runTime = runTimeIn;

        while (runTime > 0) {
            if (queueSize) {
                runTime -= queueTime[1] - globalTime;
                globalTime = queueTime[1];
            } else {
                globalTime += runTime;
                return;
            }

            dispatchTop();
            if (haltRequested) return;
        }
    }

    // `deadlineMs` is a Date.now()-comparable timestamp, or NaN for none.
    Time runWithDeadline(Time runTimeIn, double deadlineMs) {
        haltRequested = false;
        Time startTime = globalTime;
        Time endTime = globalTime + runTimeIn;
        bool hasDeadline = !std::isnan(deadlineMs);
        int sinceCheck = DEADLINE_CHECK_INTERVAL - 2;

        while (globalTime < endTime) {
            if (++sinceCheck >= DEADLINE_CHECK_INTERVAL) {
                sinceCheck = 0;
                if (hasDeadline && emscripten_date_now() >= deadlineMs) break;
            }

            if (queueSize) {
                Time nextTime = queueTime[1];
                if (nextTime > endTime) { globalTime = endTime; break; }
                globalTime = nextTime;
            } else {
                globalTime = endTime;
                break;
            }

            dispatchTop();
            if (haltRequested) break;
        }

        return globalTime - startTime;
    }
};

// ---------------------------------------------------------------- Chip methods

void Chip::setOutput(int32_t v) {
    if (historyWatched && v != _output) history.push_back({ circuit->globalTime, v });
    _output = v;
}

void Chip::customUpdate(int32_t mask) {
    Circuit* c = circuit;
    switch (kind) {
    case K_LUT:
    case K_VCC:
    case K_GND:
    case K_NOP:
        return;

    case K_DEOPT:
        for (ChipLink& cl : outputLinks) cl.chip->optimizationDisabled = true;
        return;

    case K_CLOCK: {
        // nativeKinds.ts phasedClockUpdate()
        state = ACTIVE;
        activationTime = c->globalTime;
        outputEvents.clear();
        outputEvents.push_back(mkEvent(c->globalTime));
        outputEvents.push_back(mkEvent(c->globalTime + delay[_output]));
        cycleTime = delay[0] + delay[1];
        firstOutputEvent = outputEvents.begin();
        currentOutputEvent = outputEvents.begin();
        endTime = MAX_U64;
        pendingEvent = c->queuePush(this, param[0]);
        return;
    }

    case K_SOURCE: {
        // nativeKinds.ts pushSourceValue(); param[0] is the wanted level.
        int32_t newOut = param[0] != 0 ? 1 : 0;
        if (newOut != _output) pendingEvent = c->queuePush(this, 0);
        return;
    }

    case K_SRAM: {
        // nativeKinds.ts sramBitCell(). params: mem, addrBits, bitMask, invert.
        SramMem& mem = c->srams[(int)param[0]];
        int m = (int)param[1];
        int32_t bitMask = (int32_t)param[2];
        int32_t invert = (int32_t)param[3];
        inputs ^= mask;
        bool weActive = (inputs & 1) == 0;
        bool oeActive = ((inputs >> 1) & 1) == 0;
        int32_t address = 0;
        for (int k = 0; k < m; k++) address |= ((inputs >> (2 + k)) & 1) << (m - 1 - k);
        int32_t dataIn = (inputs >> (2 + m)) & 1;

        int32_t newOut;
        if (!oeActive) {
            newOut = 0;
        } else if (weActive) {
            int32_t cur = mem.words[address];
            mem.words[address] = dataIn ? (cur | bitMask) : (cur & ~bitMask);
            newOut = dataIn;
        } else {
            newOut = (mem.words[address] & bitMask) ? 1 : 0;
        }
        newOut ^= invert;

        if (newOut != _output && pendingEvent == 0)
            pendingEvent = c->queuePush(this, delay[_output]);
        else if (pendingEvent != 0 && newOut == _output)
            pendingEvent = 0;
        return;
    }

    case K_MONO_Q: {
        // nativeKinds.ts monostableQCell(). params: group, invert, fallDelay, retriggerable.
        MonoGroup& shared = c->monoGroups[(int)param[0]];
        int32_t invert = (int32_t)param[1];
        inputs ^= mask;
        bool tHigh = ((inputs & 1) ^ invert) != 0;
        bool expHigh = (inputs & 2) != 0;
        bool risingT = tHigh && !shared.lastT;
        shared.lastT = tHigh;

        if (expHigh && _output == 1) {
            pendingEvent = c->queuePush(this, 0);
        } else if (risingT) {
            if (_output == 0) {
                pendingEvent = c->queuePush(this, 0);
            } else if (param[3] != 0 && shared.expireChip) {
                Chip* ec = shared.expireChip;
                ec->pendingEvent = ec->circuit->queuePush(ec, param[2]);
            }
        }
        return;
    }

    case K_MONO_EXP: {
        // nativeKinds.ts monostableExpCell(). params: group, -, fallDelay.
        MonoGroup& shared = c->monoGroups[(int)param[0]];
        shared.expireChip = this;
        inputs ^= mask;
        bool qHigh = (inputs & 1) != 0;
        if (qHigh) {
            pendingEvent = c->queuePush(this, param[2]);
        } else if (_output == 1) {
            pendingEvent = c->queuePush(this, 0);
        }
        return;
    }
    }
}

void Chip::initialize() {
    int32_t newOut = _output;

    inputs &= eventMask;

    switch (type) {
        case SIMPLE_CHIP: newOut = (int32_t)((lutData >> (inputs & 31)) & 1); break;
        case BASIC_CHIP: newOut = (int32_t)((lut[inputs >> 5] >> (inputs & 0x1f)) & 1); break;
        case CUSTOM_CHIP: customUpdate(0); return;
    }

    if (newOut != _output) {
        setOutput(newOut);

        if (_output) inputs |= prevOutputMask;
        else inputs &= ~prevOutputMask;

        for (ChipLink& link : outputLinks) link.chip->inputs ^= link.mask;
        for (size_t k = 0; k < outputLinks.size(); k++) {
            Chip* ch = outputLinks[k].chip;
            if (ch == this) continue;
            ch->initialize();
        }
    }
}

// connect(chip, desc, pin), with the pin already resolved to input index `i` and the
// event-pin bits (`extraMask`) by netlist.ts's flattenNetlist().
void Chip::connect(Chip* chip, int i, int32_t extraMask) {
    size_t x = 0;
    for (; x < outputLinks.size(); x++) if (outputLinks[x].chip == chip) break;

    if (x != outputLinks.size()) {
        outputLinks[x].mask |= shl1(i);
    } else {
        outputLinks.push_back({ chip, shl1(i) });
        if (!isConstantSource) activeOutputs.setBit((int)x);
        maskWords = activeOutputs.n;
    }

    outputLinks[x].mask |= extraMask;

    if (type != CUSTOM_CHIP || !isDeoptimizer)
        chip->inputLinks[i] = { this, isConstantSource ? -1 : (int32_t)x };
}

Time Chip::climbToValidCycle(Time globalTime, Time time, Time delay) {
    while (globalTime - time + delay >= currentCycle->endTime) {
        Cycle* parent = currentCycle->parentCycle;
        if (parent->nextOutputEventDelay() + time > (globalTime - currentCycle->activationTime))
            delay = parent->nextOutputEventDelay() - (globalTime - currentCycle->activationTime) + time;
        currentCycle = parent;
    }
    return delay;
}

bool Chip::catchUpHistoryBeforeWake() {
    if (!historyWatched && backfillAbsTime <= sleepTime) return false;
    Time now = circuit->globalTime;
    return backfillHistory(now) >= now;
}

void Chip::deactivateDiff(const LinkMask& a, const LinkMask& b) {
    if (maskWords <= 1) {
        int32_t m = (int32_t)(a.words[0] & ~b.words[0]);
        while (m != 0) {
            globalMaskWatchdog();
            int i = nextBit(m);
            outputLinks[i].chip->deactivateOutputs();
            m &= ~shl1(i);
        }
        return;
    }

    int nw = maskWords;
    std::vector<uint32_t> diff(nw);
    for (int w = 0; w < nw; w++) diff[w] = a.word(w) & ~b.word(w);
    for (int w = 0; w < nw; w++) {
        int32_t m = (int32_t)diff[w];
        int base = w << 5;
        while (m != 0) {
            globalMaskWatchdog();
            int i = nextBit(m);
            outputLinks[base + i].chip->deactivateOutputs();
            m &= ~shl1(i);
        }
    }
}

int32_t Chip::getNextOutput(Time time) {
    currentOutputEvent = outputEvents.begin();
    Cycle* c = this;

    if (outputEvents.empty()) return _output ^ 1;

    while (c->currentOutputEvent != c->outputEvents.end() && c->outputEvents.get(c->currentOutputEvent).time < time) {
        Event& e = c->outputEvents.get(c->currentOutputEvent);

        if (e.type == 1 && e.time + c->cycleDuration > time) {
            c = e.subCycle;
            c->currentOutputEvent = c->outputEvents.begin();
        } else {
            c->currentOutputEvent = c->outputEvents.inc(c->currentOutputEvent);
        }
    }

    if (c->currentOutputEvent == c->outputEvents.end()) return _output ^ 1;

    while (c->outputEvents.get(c->currentOutputEvent).type == 1) {
        c = c->outputEvents.get(c->currentOutputEvent).subCycle;
        c->currentOutputEvent = c->outputEvents.begin();
    }

    return c->outputEvents.get(c->currentOutputEvent).state;
}

void Chip::wakeUp() {
    bool historySynced = catchUpHistoryBeforeWake();
    Time globalTime = circuit->globalTime;
    state = ACTIVE;

    Time time = globalTime - sleepTime;
    Time delay = currentCycle->nextOutputEventDelay();
    lastOutputEvent = globalTime - time;

    actOutSnap.copyFrom(currentCycle->activeOutputs);

    delay = climbToValidCycle(globalTime, time, delay);

    double wakeSteps = 0;
    while (time > delay) {
        if (++wakeSteps > 100000000) fatal("wakeUp stuck");

        if (currentCycle == (Cycle*)this && cycleTime > 0 && time - delay >= cycleTime) {
            Time periods = std::trunc((time - delay) / cycleTime);
            periods -= std::fmod(periods, (Time)SKIP_MULT);
            if (periods > 0) time -= periods * cycleTime;
        }
        time -= delay;

        if (historySynced) _output ^= 1; else setOutput(_output ^ 1);
        inputs ^= prevOutputMask;

        currentCycle = currentCycle->nextOutputCycle(globalTime - time);
        delay = currentCycle->nextOutputEventDelay();

        delay = climbToValidCycle(globalTime, time, delay);
    }

    lastOutputEvent = globalTime;
    pendingEvent = circuit->queuePush(this, delay - time);
    currentCycle = currentCycle->nextOutputCycle(globalTime - time + delay);

    deactivateDiff(currentCycle->activeOutputs, actOutSnap);
}

void Chip::updateInputs(int32_t mask) {
    Time globalTime = circuit->globalTime;

    if (type == CUSTOM_CHIP) {
        customUpdate(mask);
        return;
    } else if (optimizationDisabled) {
        updateInputsSimple(mask);
        return;
    }

    if (state == ASLEEP) wakeUp();

    lastInputEvent[nextBit(mask)] = globalTime;

    if (state == ACTIVE) {
        deactivateOutputs();
        inputEventTable[inputEvents.back().state].pop_back();
        inputEvents.pop_back();
    }

    Chip* inputChip = inputLinks[nextBit(mask)].chip;

    if (!inputChip->inputEvents.empty()) {
        Time time = inputChip->inputEvents.front().time;
        while (inputEvents.size() > 1 && inputEvents.get(inputEvents.inc(inputEvents.begin())).time < time) {
            inputEventTable[inputEvents.front().state].pop_front();
            inputEvents.pop_front();
        }

        time = inputEvents.front().time;
        while (!outputEvents.empty() && outputEvents.front().time < time) {
            if (outputEvents.front().type)
                allocatedSubCycles.deallocate(outputEvents.front().subCycle->allocatedSubCycles);
            outputEvents.pop_front();
        }
    }

    inputs ^= mask;

    int32_t newOut = lutLookup();

    if (newOut != _output && pendingEvent == 0) {
        pendingEvent = circuit->queuePush(this, delay[_output]);
        inputs ^= prevOutputMask;

        if (outputEvents.full()) {
            if (outputEvents.front().type)
                allocatedSubCycles.deallocate(outputEvents.front().subCycle->allocatedSubCycles);
        }

        outputEvents.push_back(mkEvent(globalTime + delay[_output], newOut));
    } else if (pendingEvent != 0 && newOut == _output) {
        pendingEvent = 0;
        inputs ^= prevOutputMask;

        if (!outputEvents.empty()) outputEvents.pop_back();
    }

    inputs &= eventMask;

    growInputEventTable();

    firstInputTablePos = inputEventTable[inputs].begin();
    firstInputMask = activeInputs = shl1((int)inputLinks.size()) - 1;

    if (!inputEvents.empty() && activationCheck(inputEvents.front().time, globalTime) < globalTime) {
        activateInputs();
        return;
    }

    if (!inputEvents.empty() && inputEvents.back().time == globalTime) {
        inputEventTable[inputEvents.back().state].pop_back();
        inputEvents.pop_back();
    } else if (inputEvents.full()) {
        inputEventTable[inputEvents.front().state].pop_front();
    }

    inputEventTable[inputs].push_back(inputEvents.end());
    inputEvents.push_back(mkEvent(globalTime, inputs));
}

void Chip::updateInputsSimple(int32_t mask) {
    inputs ^= mask;

    int32_t newOut = lutLookup();

    if (newOut != _output && pendingEvent == 0) {
        pendingEvent = circuit->queuePush(this, delay[_output]);
        inputs ^= prevOutputMask;
    } else if (pendingEvent != 0 && newOut == _output) {
        pendingEvent = 0;
        inputs ^= prevOutputMask;
    }

    inputs &= eventMask;
}

void Chip::captureBackfillPos() {
    backfillPos.clear();
    for (Cycle* c = currentCycle; ; c = c->parentCycle) {
        backfillPos.push_back({ c, c->currentOutputEvent, c->activationTime, c->endTime });
        if (c == (Cycle*)this) break;
    }
    // frames[0] = chip (outermost) ... frames[last] = currentCycle (innermost)
    for (size_t a = 0, b = backfillPos.size() - 1; a < b; a++, b--) {
        Frame t = backfillPos[a]; backfillPos[a] = backfillPos[b]; backfillPos[b] = t;
    }
}

void Chip::updateOutput() {
    Time globalTime = circuit->globalTime;

    if (state == ASLEEP) { wakeUp(); return; }

    lastOutputEvent = globalTime;

    if (maskWords == 1) {
        int32_t unvisited = ~0;
        for (;;) {
            int32_t bits = (int32_t)currentCycle->activeOutputs.words[0] & unvisited;
            if (bits == 0) break;
            int b = nextBit(bits);
            ChipLink& link = outputLinks[b];
            link.chip->updateInputs(link.mask);
            unvisited &= ~shl1(b);
        }
    } else {
        for (int w = 0; w < maskWords; w++) {
            int32_t unvisited = ~0;
            for (;;) {
                int32_t bits = (int32_t)currentCycle->activeOutputs.word(w) & unvisited;
                if (bits == 0) break;
                int b = nextBit(bits);
                ChipLink& link = outputLinks[(w << 5) + b];
                link.chip->updateInputs(link.mask);
                unvisited &= ~shl1(b);
            }
        }
    }

    setOutput(_output ^ 1);
    pendingEvent = 0;

    if (state == ACTIVE) {
        if (currentCycle->activeOutputs.isZero()) {
            state = ASLEEP;
            sleepTime = globalTime;

            captureBackfillPos();
            backfillAbsTime = globalTime;
            backfillValue = _output;

            Cycle* wakeFrom = currentCycle;
            while (wakeFrom->parentCycle != nullptr && wakeFrom->parentCycle->activeOutputs.isZero())
                wakeFrom = wakeFrom->parentCycle;

            if (wakeFrom != (Cycle*)this)
                pendingEvent = circuit->queuePush(this, wakeFrom->endTime - globalTime);
            else
                pendingEvent = 0;

            return;
        }

        Time delay = currentCycle->nextOutputEventDelay();

        int climbSteps = 0;
        while (globalTime + delay >= currentCycle->endTime) {
            if (++climbSteps > 100000) fatal("updateOutput(active) stuck");
            Cycle* parent = currentCycle->parentCycle;
            if (parent->nextOutputEventDelay() > (globalTime - currentCycle->activationTime))
                delay = parent->nextOutputEventDelay() - (globalTime - currentCycle->activationTime);

            deactivateDiff(parent->activeOutputs, currentCycle->activeOutputs);

            if (state != ACTIVE) return;

            currentCycle = parent;
        }

        currentCycle = currentCycle->nextOutputCycle(globalTime + delay);
        pendingEvent = circuit->queuePush(this, delay);
    }
}

Time Chip::activationCheck(Time minTimeParam, Time maxTimeParam) {
    visited = true;

    Time globalTime = circuit->globalTime;

    Time minTime = minTimeParam;
    Time maxTime = maxTimeParam;
    (void)minTime;

    Cirque<int32_t>& inputEventList = inputEventTable[inputs];

    int steps = 0;
    for (int x = firstInputTablePos; x != inputEventList.end();
         x = inputEventList.inc(x), firstInputTablePos = inputEventList.inc(firstInputTablePos)) {

        if (++steps > 1000000) fatal("activationCheck stuck");

        int i = inputEventList.get(x);

        Time startTime, endTime;

        if (inputEvents.get(i).type) {
            startTime = inputEvents.get(i).time;
            endTime = inputEventEndTime.get(i);
        } else {
            startTime = inputEvents.get(i).time;
            int next = inputEvents.inc(i);
            endTime = (next != inputEvents.end()) ? inputEvents.get(next).time : globalTime;
        }

        Time min = minTimeParam > startTime ? minTimeParam : startTime;
        Time max = maxTime < endTime ? maxTime : endTime;

        if (min >= maxTime) { maxTime = min; break; }
        if (min >= max) continue;

        bool result = true;

        activationTime = min;

        for (int j = 0; sra(activeInputs, j) != 0; j++) {
            j += nextBit(sra(activeInputs, j));
            Chip* chip = inputLinks[j].chip;
            activationCycles[j] = chip;

            if (lastInputEvent[j] <= min) {
                activeInputs &= ~shl1(j);
            } else if (chip->state == ACTIVE) {
                result = false;
                Time minSave = min;
                Time actMin = MAX_U64;

                int chainSteps = 0;
                for (Cycle* c = chip->currentCycle; c != nullptr; c = c->parentCycle) {
                    if (++chainSteps > 100000) fatal("activationCheck cycle-chain stuck");
                    min = minSave;

                    if (c->activationTime > min) min = c->activationTime;
                    if (min < actMin) actMin = min;

                    if (min >= max) continue;

                    activationTime = min + std::fmod(globalTime - min, c->cycleTime);
                    if (activationTime < actMin) actMin = activationTime;

                    if (activationTime >= max) continue;

                    min = activationTime;
                    max = min + 1;
                    result = true;
                    activationCycles[j] = c;
                    break;
                }

                minTime = actMin > lastInputEvent[j] ? lastInputEvent[j] : actMin;

                if (!result) break;
            } else if (chip->state == PASSIVE && (chip->type == CUSTOM_CHIP || chip->optimizationDisabled)) {
                minTime = lastInputEvent[j];
                result = false;
                break;
            } else if (chip->state == PASSIVE && !chip->visited) {
                if ((firstInputMask >> j) & 1) {
                    chip->firstInputTablePos = chip->inputEventTable[chip->inputs].begin();
                    chip->firstInputMask = chip->activeInputs = shl1((int)chip->inputLinks.size()) - 1;
                    firstInputMask &= ~shl1(j);
                }

                activationTime = chip->activationCheck(min, max);
                minTime = activationTime > lastInputEvent[j] ? lastInputEvent[j] : activationTime;

                if (activationTime >= max) { result = false; break; }
                else { min = activationTime; max = min + 1; }
            }
        }

        if (!result) continue;

        if (globalTime - activationTime < delay[0] + delay[1]) continue;

        if (getNextOutput(activationTime) == _output) continue;

        if (pendingEvent != 0 &&
            pendingEvent != currentCycle->outputEvents.get(currentCycle->currentOutputEvent).time + globalTime - activationTime)
            continue;

        firstInputEvent = i;
        visited = false;
        return activationTime;
    }

    visited = false;
    return maxTime;
}

void Chip::activateInputs() {
    state = ACTIVE;

    currentCycle = this;

    cycleTime = circuit->globalTime - activationTime;
    endTime = MAX_U64;

    for (size_t i = 0; i < inputLinks.size(); i++) {
        if (lastInputEvent[i] > activationTime) {
            Chip* chip = inputLinks[i].chip;
            Cycle* stopAt = activationCycles[i]->parentCycle;

            for (Cycle* c = chip->currentCycle; c != stopAt; c = c->parentCycle) {
                if (inputLinks[i].mask >= 0) c->activeOutputs.clearBit(inputLinks[i].mask);
            }

            if (chip->state == PASSIVE) chip->activateInputs();
        }
    }

    firstOutputEvent = currentOutputEvent;

    if (firstOutputEvent != outputEvents.end()) {
        if (pendingEvent != 0) {
            outputEvents.pop_back();
        } else {
            pendingEvent = circuit->queuePush(this, outputEvents.get(currentOutputEvent).time - activationTime);
        }

        currentCycle = nextOutputCycle(cycleTime + outputEvents.get(currentOutputEvent).time);
    }
}

void Chip::deactivateOutputs() {
    if (state == ASLEEP) wakeUp();

    Time globalTime = circuit->globalTime;

    if ((pendingEvent >= globalTime) && ((pendingEvent - globalTime) <= delay[_output])) {
        if ((pendingEvent - globalTime) == delay[_output]) {
            bool isInput = false;

            for (size_t i = 0; i < inputLinks.size(); i++) {
                if (inputLinks[i].chip->pendingEvent == globalTime) { isInput = true; break; }
            }

            if (isInput) {
                pendingEvent = 0;
                inputs = _output ? prevOutputMask : 0;
            } else {
                inputs = _output ? 0 : prevOutputMask;
            }
        } else {
            inputs = _output ? 0 : prevOutputMask;
        }
    } else {
        pendingEvent = 0;
        inputs = _output ? prevOutputMask : 0;
    }

    state = PASSIVE;

    for (size_t i = 0; i < inputLinks.size(); i++)
        for (Cycle* c = inputLinks[i].chip->currentCycle; c; c = c->parentCycle)
            if (inputLinks[i].mask >= 0) c->activeOutputs.setBit(inputLinks[i].mask);

    for (size_t i = 0; i < inputLinks.size(); i++) {
        if (inputLinks[i].chip->state == ASLEEP) inputLinks[i].chip->wakeUp();
        inputs |= inputLinks[i].chip->_output << i;
    }
    inputs &= eventMask;

    if (type == CUSTOM_CHIP || optimizationDisabled || inputEvents.empty()) {
        for (size_t i = 0; i < outputLinks.size(); i++)
            if (!currentCycle->activeOutputs.testBit((int)i) && outputLinks[i].chip->state != PASSIVE)
                outputLinks[i].chip->deactivateOutputs();
        return;
    }

    if (!inputEvents.get(firstInputEvent).type) {
        inputEvents.get(firstInputEvent).type = 1;
        inputEventEndTime.set(firstInputEvent, inputEvents.get(inputEvents.inc(firstInputEvent)).time);
    }

    for (int i = inputEvents.dec(inputEvents.end()); i != firstInputEvent; i = inputEvents.dec(i)) {
        inputEventTable[inputEvents.back().state].pop_back();
        inputEvents.pop_back();
    }

    growInputEventTable();

    inputEventTable[inputs].push_back(inputEvents.end());
    inputEvents.push_back(mkEvent(globalTime, inputs));

    int fullSteps = 0;
    while (allocatedSubCycles.full()) {
        if (++fullSteps > 100000) fatal("deactivateOutputs full() loop stuck");
        if (outputEvents.begin() == firstOutputEvent) {
            inputEvents.clear();
            outputEvents.clear();
            firstOutputEvent = outputEvents.begin();
            for (size_t i = 0; i < inputEventTable.size(); i++) inputEventTable[i].clear();
            allocatedSubCycles.clear();
            cycleTime = 0;
            break;
        }

        if (outputEvents.front().type)
            allocatedSubCycles.deallocate(outputEvents.front().subCycle->allocatedSubCycles);

        outputEvents.pop_front();

        Time eventDelay = delay[1] < delay[0] ? delay[1] : delay[0];

        while (!inputEvents.empty() && inputEvents.front().time + eventDelay <= outputEvents.front().time) {
            inputEventTable[inputEvents.front().state].pop_front();
            inputEvents.pop_front();
        }
    }

    if (firstOutputEvent != outputEvents.end()) {
        int cycleNum = allocatedSubCycles.allocate();

        if (subCycles[cycleNum] == nullptr)
            subCycles[cycleNum] = new Cycle(outputEvents.getQueueSize(), allocatedSubCycles.size);

        Cycle* cycle = subCycles[cycleNum];

        cycle->outputEvents.clear();
        cycle->allocatedSubCycles.clear();
        cycle->allocatedSubCycles.set(cycleNum);
        cycle->parentCycle = this;

        for (int i = firstOutputEvent; i != outputEvents.end(); i = outputEvents.inc(i)) {
            Event& e = outputEvents.get(i);
            if (e.type) {
                cycle->allocatedSubCycles.orEq(e.subCycle->allocatedSubCycles);
                e.subCycle->parentCycle = cycle;
            }
            cycle->outputEvents.push_back(mkEvent(e.time, e.state, e.type, e.subCycle));
        }
        cycle->firstOutputEvent = cycle->outputEvents.begin();

        cycle->cycleTime = cycleTime;
        cycle->activationTime = cycle->outputEvents.front().time;
        cycle->cycleDuration = globalTime - cycle->activationTime + 1;

        Event& firstEv = outputEvents.get(firstOutputEvent);
        firstEv.type = 1;
        firstEv.subCycle = cycle;
        outputEvents.erase_back(firstOutputEvent);
    }

    for (size_t i = 0; i < outputLinks.size(); i++)
        if (!currentCycle->activeOutputs.testBit((int)i) && outputLinks[i].chip->state != PASSIVE)
            outputLinks[i].chip->deactivateOutputs();

    currentCycle = this;
    activeOutputs.setLow((int)outputLinks.size());

    if (pendingEvent != 0 && pendingEvent != globalTime) {
        outputEvents.push_back(mkEvent(pendingEvent, _output ^ 1));
    } else if (pendingEvent != 0) {
        updateOutput();
    }

    for (size_t i = 0; i < lastInputEvent.size(); i++)
        if (lastInputEvent[i] >= activationTime)
            lastInputEvent[i] = inputLinks[i].chip->lastOutputEvent;
}

Time Chip::backfillHistory(Time now) {
    if (state != ASLEEP) return now;
    if (outputEvents.empty()) return now;
    if (backfillAbsTime >= now) return now;

    bool complete = advanceBackfillPos(backfillPos, backfillAbsTime, backfillValue, now, &history);
    return complete ? now : backfillAbsTime;
}

void Chip::skipBackfillTo(Time target) {
    if (state != ASLEEP) return;
    if (outputEvents.empty()) return;
    if (backfillAbsTime >= target) return;

    advanceBackfillPos(backfillPos, backfillAbsTime, backfillValue, target, nullptr);
}

int32_t Chip::currentValue() {
    if (state != ASLEEP) return _output;
    if (outputEvents.empty()) return backfillValue;

    Time now = circuit->globalTime;

    if (!valuePosSet || valueSleepTime != sleepTime || backfillAbsTime > valueAbsTime) {
        valuePos = backfillPos;
        valuePosSet = true;
        valueAbsTime = backfillAbsTime;
        valueValue = backfillValue;
        valueSleepTime = sleepTime;
    }

    if (valueAbsTime >= now) return valueValue;

    advanceBackfillPos(valuePos, valueAbsTime, valueValue, now, nullptr);
    return valueValue;
}

// ---------------------------------------------------------------- building

// See netlist.ts's CELL_FIELDS.
static const int CELL_FIELDS = 12;

static Chip* makeChip(Circuit* c, const double* f, const double* delays, const uint32_t* luts) {
    Kind kind = (Kind)(int)f[0];
    int nIn = (int)f[1], nEv = (int)f[2];
    bool prevOut = f[3] != 0;
    Chip* chip = new Chip((int)f[4], (int)f[5], c);
    chip->kind = kind;

    if (kind == K_VCC || kind == K_GND) {
        chip->type = CUSTOM_CHIP;
        chip->isConstantSource = true;
        return chip;
    }

    chip->delay[0] = delays[0];
    chip->delay[1] = delays[1];
    chip->inputLinks.assign(nIn, { nullptr, 0 });
    chip->activationCycles.assign(nIn, nullptr);
    chip->lastInputEvent.assign(nIn, 0);
    chip->_output = (int32_t)f[6];
    chip->optimizationDisabled = f[7] != 0;
    for (int k = 0; k < 4; k++) chip->param[k] = f[8 + k];

    if (kind == K_DEOPT) chip->isDeoptimizer = true;

    if (kind != K_LUT) {
        chip->type = CUSTOM_CHIP;
        return chip;
    }

    int lutSize = nIn;
    for (int k = 0; k < nEv; k++) chip->eventMask &= ~shl1(lutSize++);
    if (prevOut) { chip->prevOutputMask = shl1(lutSize); lutSize++; }

    const uint32_t* table = luts + (int)f[10];
    if (lutSize <= 5) {
        chip->type = SIMPLE_CHIP;
        chip->lutData = table[0];
    } else {
        chip->type = BASIC_CHIP;
        int nw = 1 << (lutSize - 5);
        chip->lut = new uint32_t[nw];
        memcpy(chip->lut, table, sizeof(uint32_t) * nw);
    }
    return chip;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE Circuit* circuit_new() { return new Circuit(); }

EMSCRIPTEN_KEEPALIVE void circuit_add_sram(Circuit* c, int addrBits, const int32_t* words) {
    SramMem m;
    m.addrBits = addrBits;
    m.words.assign(words, words + (1 << addrBits));
    c->srams.push_back(std::move(m));
}

// Circuit's constructor, from a flattened netlist. Cells 0..2 are _VCC, _GND, _DEOPTIMIZER.
EMSCRIPTEN_KEEPALIVE void circuit_build(Circuit* c, int numCells, const double* cells, const double* delays,
                                        const uint32_t* luts, const int32_t* connects, int numConnects,
                                        int monoGroups) {
    c->monoGroups.assign(monoGroups, MonoGroup());
    for (int k = 0; k < numCells; k++) {
        Chip* chip = makeChip(c, cells + k * CELL_FIELDS, delays + k * 2, luts);
        chip->chipIndex = k;
        c->chips.push_back(chip);
    }

    for (int k = 0; k < numConnects; k++) {
        const int32_t* e = connects + k * 4;
        c->chips[e[0]]->connect(c->chips[e[1]], e[2], e[3]);
    }

    std::vector<Chip*>& chips = c->chips;
    for (size_t i = 2; i < chips.size(); i++) {
        for (size_t j = 0; j < chips[i]->inputLinks.size(); j++) {
            if (!chips[i]->inputLinks[j].chip) {
                chips[1]->outputLinks.push_back({ chips[i], shl1((int)j) });
                chips[i]->inputLinks[j] = { chips[1], -1 };
            }
        }
    }

    chips[0]->setOutput(1);
    for (ChipLink& link : chips[0]->outputLinks) link.chip->inputs |= link.mask;

    for (size_t i = 2; i < chips.size(); i++) {
        Chip* chip = chips[i];
        if (!chip->_output) continue;
        chip->inputs |= chip->prevOutputMask;
        for (ChipLink& link : chip->outputLinks) link.chip->inputs |= link.mask;
    }

    for (size_t i = 2; i < chips.size(); i++) chips[i]->initialize();
}

EMSCRIPTEN_KEEPALIVE void circuit_free(Circuit* c) {
    // The process is long-lived and circuits are rebuilt on every edit, so this does free.
    for (Chip* chip : c->chips) {
        for (Cycle* s : chip->subCycles) delete s;
        delete[] chip->lut;
        delete chip;
    }
    delete c;
}

EMSCRIPTEN_KEEPALIVE double circuit_run_with_deadline(Circuit* c, double ticks, double deadlineMs) {
    return c->runWithDeadline(ticks, deadlineMs);
}
EMSCRIPTEN_KEEPALIVE void circuit_run(Circuit* c, double ticks) { c->run(ticks); }
EMSCRIPTEN_KEEPALIVE void circuit_drain_zero_delay(Circuit* c) { c->drainZeroDelayEvents(); }
EMSCRIPTEN_KEEPALIVE double circuit_global_time(Circuit* c) { return c->globalTime; }
EMSCRIPTEN_KEEPALIVE int circuit_halt_requested(Circuit* c) { return c->haltRequested; }
EMSCRIPTEN_KEEPALIVE double circuit_event_count(Circuit* c) { return c->eventCount; }
EMSCRIPTEN_KEEPALIVE double circuit_update_count(Circuit* c) { return c->updateCount; }
EMSCRIPTEN_KEEPALIVE int circuit_num_chips(Circuit* c) { return (int)c->chips.size(); }

EMSCRIPTEN_KEEPALIVE int chip_output(Circuit* c, int i) { return c->chips[i]->_output; }
EMSCRIPTEN_KEEPALIVE int chip_state(Circuit* c, int i) { return c->chips[i]->state; }
EMSCRIPTEN_KEEPALIVE int chip_inputs(Circuit* c, int i) { return c->chips[i]->inputs; }
EMSCRIPTEN_KEEPALIVE double chip_pending_event(Circuit* c, int i) { return c->chips[i]->pendingEvent; }
EMSCRIPTEN_KEEPALIVE double chip_cycle_time(Circuit* c, int i) { return c->chips[i]->cycleTime; }
EMSCRIPTEN_KEEPALIVE double chip_last_output_event(Circuit* c, int i) { return c->chips[i]->lastOutputEvent; }
EMSCRIPTEN_KEEPALIVE int chip_current_value(Circuit* c, int i) { return c->chips[i]->currentValue(); }
EMSCRIPTEN_KEEPALIVE int chip_num_inputs(Circuit* c, int i) { return (int)c->chips[i]->inputLinks.size(); }
EMSCRIPTEN_KEEPALIVE int chip_type(Circuit* c, int i) { return c->chips[i]->type; }
EMSCRIPTEN_KEEPALIVE int chip_opt_disabled(Circuit* c, int i) { return c->chips[i]->optimizationDisabled; }
EMSCRIPTEN_KEEPALIVE void chip_set_opt_disabled(Circuit* c, int i, int v) { c->chips[i]->optimizationDisabled = v != 0; }

// For the harness's structural check against the TS builder: outputLinks as (dst, mask)
// pairs, inputLinks as (src, link index) pairs.
EMSCRIPTEN_KEEPALIVE int chip_num_output_links(Circuit* c, int i) { return (int)c->chips[i]->outputLinks.size(); }
EMSCRIPTEN_KEEPALIVE int chip_output_link_dst(Circuit* c, int i, int k) { return c->chips[i]->outputLinks[k].chip->chipIndex; }
EMSCRIPTEN_KEEPALIVE int chip_output_link_mask(Circuit* c, int i, int k) { return c->chips[i]->outputLinks[k].mask; }
EMSCRIPTEN_KEEPALIVE int chip_input_link_src(Circuit* c, int i, int k) { return c->chips[i]->inputLinks[k].chip->chipIndex; }
EMSCRIPTEN_KEEPALIVE int chip_input_link_mask(Circuit* c, int i, int k) { return c->chips[i]->inputLinks[k].mask; }

// A source cell's live value (LogicInputElm.toggle(), JSInterface.setExtVoltage()).
EMSCRIPTEN_KEEPALIVE void chip_set_source(Circuit* c, int i, int high) {
    Chip* chip = c->chips[i];
    chip->param[0] = high ? 1 : 0;
    chip->customUpdate(0);
}

EMSCRIPTEN_KEEPALIVE int sram_read(Circuit* c, int mem, int address) { return c->srams[mem].words[address]; }
EMSCRIPTEN_KEEPALIVE void sram_write(Circuit* c, int mem, int address, int value) { c->srams[mem].words[address] = value; }

}
