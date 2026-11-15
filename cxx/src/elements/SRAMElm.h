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

#include "ChipElm.h"

#include <map>

class SRAMElm : public ChipElm {
public:
    ELM_CLASS(SRAMElm)
    static constexpr int FLAG_HEX_DISPLAY = 4;
    static constexpr int FLAG_RELOAD_ON_RESET = 2;
    // separate data in/out pins instead of one bidirectional bus, like bipolar RAMs (74189, 82S16)
    static constexpr int FLAG_SEPARATE_IO = 8;
    // invert the data outputs (74189, 82S16)
    static constexpr int FLAG_INVERT_OUTPUT = 16;
    // add an active-low chip select pin: while it's high, nothing is written and the outputs are off
    static constexpr int FLAG_CHIP_SELECT = 32;
    // (these flag values match ts-digital's SRAMElm, for compatibility)
    int addressNodes = 0;
    int dataNodes = 0;
    // where a write reads its data from: dataNodes (the same bidirectional pins reads drive),
    // unless FLAG_SEPARATE_IO adds a separate set of data input pins after them
    int dataInNodes = 0;
    int internalNodes = 0;
    int addressBits = 0;
    int dataBits = 0;
    std::map<int, int> map;
    std::optional<std::map<int, int>> initialMap;  // saved initial contents for restore on reset
    int address = 0;
    std::optional<std::string> loadedFileName;  // remembers the last file loaded via "Load Contents From File"
    // set by Load Contents From File, for the rebuilt dialog to show
    static inline std::optional<std::string> contentsOverride;
    static inline std::optional<std::string> fileNameOverride;

    CHIP_CONSTRUCTORS(SRAMElm, ChipElm)
    void postConstruct(StringTokenizer *st) override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void dumpXmlState(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void reset() override;
    bool nonLinear() override { return true; }
    bool allowBus() override { return true; }
    std::string getChipName() override { return "Static RAM"; }
    void setupPins() override;
    int getPostCount() override {
        return 2 + addressBits + dataBits + (hasSeparateIO() ? dataBits : 0) + (hasChipSelect() ? 1 : 0);
    }
    bool hasSeparateIO() { return hasFlag(FLAG_SEPARATE_IO); }
    bool hasInvertedOutput() { return hasFlag(FLAG_INVERT_OUTPUT); }
    bool hasChipSelect() { return hasFlag(FLAG_CHIP_SELECT); }
    std::optional<EditInfo> getChipEditInfo(int n) override;
    std::string contentsToString();
    // Load Contents From File: reads the raw bytes of the chosen file and turns them into the
    // same "addr: val val val..." text the Contents field understands
    void fetchLoadFileData();
    std::string toHex(int val);
    void parseContentsString(const std::string &s);
    int parseNumber(const std::string &str);
    void setChipEditValue(int n, EditInfo &ei) override;
    int getVoltageSourceCount() override { return dataBits; }
    int getInternalNodeCount() override { return dataBits; }
    void setVoltageSource(int j, VoltageSource *vs) override;
    bool getMatrixConnection(int n1, int n2) override;
    void stamp() override;
    void doStep() override;
    void stepFinished() override;

protected:
    // the chip select post, if any, comes after all the others so it doesn't renumber them
    int chipSelectNode() { return getPostCount() - 1; }
    // the pin options offered in the edit dialog, as flags
    virtual std::vector<int> pinOptions() { return {FLAG_SEPARATE_IO, FLAG_INVERT_OUTPUT, FLAG_CHIP_SELECT}; }
    bool chipSelected();

public:
    int getDumpType() override { return 413; }
};
