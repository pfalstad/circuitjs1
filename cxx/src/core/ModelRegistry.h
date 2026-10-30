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

#pragma once

#include <functional>
#include <optional>
#include <memory>
#include <set>
#include <string>
#include <type_traits>
#include <utility>
#include <vector>

#include "CircuitXMLSerializer.h"
#include "OrderedMap.h"
#include "Storage.h"
#include "XmlDoc.h"

// where a model lives (see ModelRegistry)
enum class ModelScope { Local, Global, Persistent };

// "local", "global" or "persistent", for display
inline const char *modelScopeName(ModelScope sc) {
    return sc == ModelScope::Local ? "local" : sc == ModelScope::Global ? "global" : "persistent";
}

// what every model type has in common
class RegistryModel {
public:
    virtual ~RegistryModel() = default;
    std::string name;
    // set when the model has been written to the current dump, so it's only written once
    bool dumped = false;
    // created or loaded by the user, as opposed to built in or generated from the parameters
    // of old-style elements (TS: isUserModel() in ModelTypes)
    virtual bool isUserModel() const { return true; }
};

// what every registry has in common, so they can be handled together.  The methods taking
// RegistryModel * are for code that handles models of any type (the TS version uses a
// ModelRegistry<RegistryModel> for that); m must be a model of this registry's type.
class ModelRegistryBase {
public:
    virtual ~ModelRegistryBase() = default;

    // clear the local models of every type, when another circuit is loaded
    static void clearAllLocal() {
        for (ModelRegistryBase *reg : all())
            reg->clearLocal();
    }

    // clear the dumped flags of every type, before dumping
    static void clearAllDumpedFlags() {
        for (ModelRegistryBase *reg : all())
            reg->clearDumpedFlags();
    }

    // write the local models of every type that haven't been written yet (because no element
    // uses them), since local models belong to the circuit
    static void dumpAllUnusedLocal(XmlElement *root) {
        for (ModelRegistryBase *reg : all())
            reg->dumpUnusedLocal(root);
    }

    virtual void clearLocal() = 0;
    virtual void clearDumpedFlags() = 0;
    virtual void dumpUnusedLocal(XmlElement *root) = 0;
    virtual bool has(const std::string &name) = 0;
    virtual bool hasLocal(const std::string &name) = 0;
    virtual void loadFromStorage(const std::function<void(const std::string &)> &load) = 0;
    virtual std::vector<RegistryModel *> anyModels() = 0;
    virtual ModelScope anyScope(RegistryModel *m) = 0;
    virtual void anySetScope(RegistryModel *m, ModelScope sc) = 0;
    virtual void anyMakeGlobal(RegistryModel *m) = 0;
    virtual void anyDelete(RegistryModel *m) = 0;
    virtual void anyMarkEmbedded(RegistryModel *m) = 0;
    virtual void anyDumpXml(RegistryModel *m, XmlElement *root) = 0;
    virtual std::vector<RegistryModel *> anyCollectLocal(const std::function<void()> &fn) = 0;

protected:
    // every registry, so they can be cleared together
    static std::vector<ModelRegistryBase *> &all() {
        static std::vector<ModelRegistryBase *> v;
        return v;
    }
};

// The set of models of one type (diode, transistor, subcircuit, ...), by name.
//
// Models live in one of two tiers:
//   global: available to every circuit this session (built-in models, models saved in
//           local storage, and, for most model types, models loaded from circuit files)
//   local:  belong to the current circuit and are cleared when another circuit is loaded
// A local model shadows a global one with the same name.
//
// Built-in models are added by the init function, which runs the first time the registry
// is used.  If a storage prefix and an XML dump function are given, global models can also be
// persistent: saved in local storage (under prefix + name) so they're available across
// sessions.  Loading them is up to the model type, since only it knows the format.
//
// P is how the registry refers to a model: T * for element models, which are never freed
// (elements may still point at one that's been removed), or a shared_ptr for subcircuits.
template <class T, class P = T *>
class ModelRegistry : public ModelRegistryBase {
public:
    // appends a model's XML element to the root element
    using DumpModelXml = std::function<void(T *m, XmlElement *root)>;

    OrderedMap<P> globalMap;
    OrderedMap<P> localMap;
    // bumped on every change to the set of models, so menus listing them know to rebuild
    int sequenceNumber = 0;
    const std::optional<std::string> storagePrefix;

    explicit ModelRegistry(std::function<void()> init = nullptr, std::optional<std::string> prefix = std::nullopt,
                           DumpModelXml dump = nullptr)
        : storagePrefix(std::move(prefix)), init(std::move(init)), dumpModelXml(std::move(dump)) {
        all().push_back(this);
    }

    // drop all models; built-ins are added again on next use
    void reset() {
        globalMap.clear();
        localMap.clear();
        initialized = false;
        sequenceNumber++;
    }

    // the model with the given name, or a null P
    P get(const std::string &name) {
        ensureInit();
        if (P *lm = localMap.get(name))
            return *lm;
        if (P *gm = globalMap.get(name))
            return *gm;
        return P();
    }

    bool has(const std::string &name) override { return get(name) != nullptr; }

    bool hasGlobal(const std::string &name) {
        ensureInit();
        return globalMap.has(name);
    }

    bool hasLocal(const std::string &name) override {
        ensureInit();
        return localMap.has(name);
    }

    bool isLocal(const T *m) {
        ensureInit();
        P *lm = localMap.get(m->name);
        return lm != nullptr && raw(*lm) == m;
    }

    bool isGlobal(const T *m) {
        ensureInit();
        P *gm = globalMap.get(m->name);
        return gm != nullptr && raw(*gm) == m;
    }

    // add (or replace) a model in the global tier, under its name
    void setGlobal(const P &m) {
        ensureInit();
        globalMap.set(m->name, m);
        sequenceNumber++;
    }

    // add (or replace) a model in the local tier, under its name
    void setLocal(const P &m) {
        ensureInit();
        localMap.set(m->name, m);
        sequenceNumber++;
    }

    void removeGlobal(const std::string &name) {
        ensureInit();
        if (globalMap.erase(name))
            sequenceNumber++;
    }

    void removeLocal(const std::string &name) {
        ensureInit();
        if (localMap.erase(name))
            sequenceNumber++;
    }

    // remove a model name from both tiers
    void remove(const std::string &name) {
        removeLocal(name);
        removeGlobal(name);
    }

    // rename a model, keeping it in the same tier.  A model not in the registry yet is added
    // to the local tier (unless the name is empty).
    void rename(const P &m, const std::string &name) {
        ensureInit();
        bool local = isLocal(raw(m)), global = !local && isGlobal(raw(m));
        P keep = m;  // (m may be a reference into one of the maps)
        if (local)
            localMap.erase(keep->name);
        else if (global)
            globalMap.erase(keep->name);
        bool saved = isSaved(keep->name);
        if (saved)
            unsave(keep->name);
        keep->name = name;
        if (!name.empty())
            (global ? globalMap : localMap).set(name, keep);
        if (saved && !name.empty())
            store(raw(keep));
        sequenceNumber++;
    }

    // the model to load a definition of the given name into: the local one if there is one,
    // otherwise a new local model.  A global model of the same name is shadowed, not modified.
    P getForLoad(const std::string &name, const std::function<P()> &create) {
        ensureInit();
        if (P *lm = localMap.get(name)) {
            embedded.erase(raw(*lm));
            return *lm;
        }
        P m = create();
        m->name = name;
        setLocal(m);
        return m;
    }

    // move a model to the global tier, replacing any model with the same name in either tier
    void makeGlobal(const P &m) {
        P keep = m;
        removeLocal(keep->name);
        setGlobal(keep);
    }

    // move a model to the local tier, replacing any local model with the same name
    void makeLocal(const P &m) {
        P keep = m;
        if (isGlobal(raw(keep)))
            removeGlobal(keep->name);
        setLocal(keep);
    }

    // mark a local model as registered only because a subcircuit model's definition includes
    // it, so it isn't written with the circuit unless an element uses it; the subcircuit
    // model's definition already has it.  Loading it from the circuit itself clears the mark.
    void markEmbedded(const T *m) { embedded.insert(m); }

    // write local models not already written, except embedded ones
    void dumpUnusedLocal(XmlElement *root) override {
        if (!dumpModelXml)
            return;
        for (auto &kv : localMap) {
            T *m = raw(kv.second);
            if (m->dumped || m->name.empty() || embedded.count(m))
                continue;
            dumpModelXml(m, root);
            m->dumped = true;
        }
    }

    ModelScope scope(const T *m) {
        if (isLocal(m))
            return ModelScope::Local;
        return isSaved(m->name) ? ModelScope::Persistent : ModelScope::Global;
    }

    // move a model to the given scope.  Making a persistent model global leaves it persistent,
    // but updates the saved copy.
    void setScope(const P &m, ModelScope sc) {
        P keep = m;
        if (sc == ModelScope::Local) {
            unsave(keep->name);
            makeLocal(keep);
            return;
        }
        makeGlobal(keep);
        if (sc == ModelScope::Persistent || isSaved(keep->name))
            store(raw(keep));
    }

    // remove a model, including any saved copy
    void deleteModel(const P &m) {
        P keep = m;
        unsave(keep->name);
        remove(keep->name);
        embedded.erase(raw(keep));
    }

    // run fn with an empty local tier and return the models it added there; the previous
    // local models are put back afterwards
    std::vector<P> collectLocal(const std::function<void()> &fn) {
        ensureInit();
        OrderedMap<P> collected;
        std::swap(localMap, collected);
        try {
            fn();
        } catch (...) {
            std::swap(localMap, collected);
            throw;
        }
        std::swap(localMap, collected);
        std::vector<P> result;
        for (auto &kv : collected)
            result.push_back(kv.second);
        return result;
    }

    void clearLocal() override {
        localMap.clear();
        sequenceNumber++;
    }

    // all models, with local ones shadowing global ones of the same name
    std::vector<P> models() {
        ensureInit();
        OrderedMap<P> merged;
        for (auto &kv : globalMap)
            merged.set(kv.first, kv.second);
        for (auto &kv : localMap)
            merged.set(kv.first, kv.second);
        std::vector<P> result;
        for (auto &kv : merged)
            result.push_back(kv.second);
        return result;
    }

    void clearDumpedFlags() override {
        for (auto &kv : globalMap)
            kv.second->dumped = false;
        for (auto &kv : localMap)
            kv.second->dumped = false;
    }

    // base if it isn't taken, otherwise base-2, base-3, ...
    std::string uniqueName(const std::string &base) {
        if (!has(base))
            return base;
        for (int num = 2;; num++) {
            std::string n = base + "-" + std::to_string(num);
            if (!has(n))
                return n;
        }
    }

    // local storage, for models saved across sessions

    bool canSave() const { return storagePrefix && dumpModelXml && Storage::localStorage != nullptr; }

    bool isSaved(const std::string &name) const {
        if (!canSave() || name.empty())
            return false;
        return Storage::localStorage->getItem(storageKey(name)).has_value();
    }

    // save a model in local storage
    void store(T *m) {
        if (canSave())
            Storage::localStorage->setItem(storageKey(m->name), serialize(m));
    }

    // update the saved copy of a model if it has one, after it's been changed
    void resave(T *m) {
        if (isSaved(m->name))
            store(m);
    }

    void unsave(const std::string &name) {
        if (canSave())
            Storage::localStorage->removeItem(storageKey(name));
    }

    // append the model's XML element to the root element
    void dumpXml(T *m, XmlElement *root) {
        bool dumped = m->dumped;
        dumpModelXml(m, root);
        m->dumped = dumped;
    }

    // the model as an XML string
    std::string serialize(T *m) {
        XmlElement root("models");
        dumpXml(m, &root);
        return CircuitXMLSerializer::prettyPrint(root.children.at(0).get());
    }

    // call load(data) for each model saved in local storage
    void loadFromStorage(const std::function<void(const std::string &)> &load) override {
        if (!canSave())
            return;
        // collect keys first, since loading may change storage
        std::vector<std::string> keys;
        for (const std::string &key : Storage::localStorage->keys())
            if (key.rfind(*storagePrefix, 0) == 0)
                keys.push_back(key);
        for (const std::string &key : keys) {
            std::optional<std::string> data = Storage::localStorage->getItem(key);
            if (data && !data->empty())
                load(*data);
        }
    }

    std::vector<RegistryModel *> anyModels() override {
        std::vector<RegistryModel *> result;
        for (const P &m : models())
            result.push_back(raw(m));
        return result;
    }
    ModelScope anyScope(RegistryModel *m) override { return scope(static_cast<T *>(m)); }
    void anySetScope(RegistryModel *m, ModelScope sc) override { setScope(fromAny(m), sc); }
    void anyMakeGlobal(RegistryModel *m) override { makeGlobal(fromAny(m)); }
    void anyDelete(RegistryModel *m) override { deleteModel(fromAny(m)); }
    void anyMarkEmbedded(RegistryModel *m) override { markEmbedded(static_cast<T *>(m)); }
    void anyDumpXml(RegistryModel *m, XmlElement *root) override { dumpXml(static_cast<T *>(m), root); }
    std::vector<RegistryModel *> anyCollectLocal(const std::function<void()> &fn) override {
        std::vector<RegistryModel *> result;
        for (const P &m : collectLocal(fn))
            result.push_back(raw(m));
        return result;
    }

private:
    std::function<void()> init;
    DumpModelXml dumpModelXml;
    // local models registered only because a subcircuit model's definition includes them
    // (see markEmbedded())
    std::set<const T *> embedded;
    bool initialized = false;

    static T *raw(const P &p) { return &*p; }
    static P fromAny(RegistryModel *m) {
        if constexpr (std::is_pointer_v<P>)
            return static_cast<T *>(m);
        else
            return static_cast<T *>(m)->shared_from_this();
    }

    void ensureInit() {
        if (initialized)
            return;
        initialized = true;
        if (init)
            init();
    }

    std::string storageKey(const std::string &name) const { return *storagePrefix + name; }
};
