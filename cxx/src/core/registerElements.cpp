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

#include "CircuitElm.h"
#include "ElementFactory.h"

#include "../elements/CapacitorElm.h"
#include "../elements/CurrentElm.h"
#include "../elements/DCVoltageElm.h"
#include "../elements/GroundElm.h"
#include "../elements/InductorElm.h"
#include "../elements/RailElm.h"
#include "../elements/ResistorElm.h"
#include "../elements/SwitchElm.h"
#include "../elements/VoltageElm.h"
#include "../elements/WireElm.h"
#include "../elements/DiodeElm.h"
#include "../elements/GateElm.h"
#include "../elements/InverterElm.h"


#include "../elements/JfetElm.h"


#include "../elements/MosfetElm.h"
#include "../elements/ProbeElm.h"
#include "../elements/LabeledNodeElm.h"
#include "../elements/VarRailElm.h"
#include "../elements/PotElm.h"
#include "../elements/Switch2Elm.h"
#include "../elements/SweepElm.h"
#include "../elements/ZenerElm.h"
#include "../elements/LEDElm.h"
#include "../elements/TransformerElm.h"
#include "../elements/AnalogSwitchElm.h"
#include "../elements/AnalogSwitch2Elm.h"
#include "../elements/MemristorElm.h"
#include "../elements/TransLineElm.h"
#include "../elements/RelayElm.h"
#include "../elements/RelayCoilElm.h"
#include "../elements/RelayContactElm.h"
#include "../elements/CrossSwitchElm.h"
#include "../elements/MotorProtectionSwitchElm.h"
#include "../elements/RoutedWireElm.h"
#include "../elements/AudioOutputElm.h"
#include "../elements/AudioInputElm.h"
#include "../elements/NoiseElm.h"
#include "../elements/SubcircuitElm.h"
#include "../elements/DarlingtonElm.h"
#include "../elements/UnijunctionElm.h"
#include "../elements/CrystalElm.h"
#include "../elements/OTAElm.h"
#include "../elements/NortonAmpElm.h"
#include "../elements/ComparatorElm.h"
#include "../elements/OpAmpRealElm.h"
#include "../elements/OptocouplerElm.h"
#include "../elements/CustomLogicElm.h"
#include "../elements/CCVSElm.h"
#include "../elements/CCCSElm.h"
#include "../elements/VCVSElm.h"
#include "../elements/VCCSElm.h"
#include "../elements/SevenSegElm.h"
#include "../elements/BusSplitterElm.h"
#include "../elements/TimeDelayRelayElm.h"
#include "../elements/ROMElm.h"
#include "../elements/SRAMElm.h"
#include "../elements/LEDArrayElm.h"
#include "../elements/BusTransceiverElm.h"
#include "../elements/AnalogMuxElm.h"
#include "../elements/CC2NegElm.h"
#include "../elements/CC2Elm.h"
#include "../elements/PhaseCompElm.h"
#include "../elements/VCOElm.h"
#include "../elements/DecimalDisplayElm.h"
#include "../elements/SevenSegDecoderElm.h"
#include "../elements/DeMultiplexerElm.h"
#include "../elements/MultiplexerElm.h"
#include "../elements/SeqGenElm.h"
#include "../elements/MonostableElm.h"
#include "../elements/ADCElm.h"
#include "../elements/DACElm.h"
#include "../elements/TimerElm.h"
#include "../elements/PisoShiftElm.h"
#include "../elements/SipoShiftElm.h"
#include "../elements/LatchElm.h"
#include "../elements/RingCounterElm.h"
#include "../elements/Counter2Elm.h"
#include "../elements/CounterElm.h"
#include "../elements/FullAdderElm.h"
#include "../elements/HalfAdderElm.h"
#include "../elements/TFlipFlopElm.h"
#include "../elements/JKFlipFlopElm.h"
#include "../elements/DFlipFlopElm.h"
#include "../elements/LogicInputElm.h"
#include "../elements/OpAmpElm.h"
#include "../elements/OutputElm.h"
#include "../elements/TextElm.h"
#include "../elements/TransistorElm.h"
#include "../elements/ScopeElm.h"
#include "../elements/TestPointElm.h"
#include "../elements/CustomTransformerElm.h"
#include "../elements/BatteryElm.h"
#include "../elements/DataRecorderElm.h"
#include "../elements/DataInputElm.h"
#include "../elements/WattmeterElm.h"
#include "../elements/WattmeterTrueElm.h"
#include "../elements/OhmMeterElm.h"
#include "../elements/StopTriggerElm.h"
#include "../elements/DCMotorElm.h"
#include "../elements/TriStateElm.h"
#include "../elements/DelayBufferElm.h"
#include "../elements/DPDTSwitchElm.h"
#include "../elements/MBBSwitchElm.h"
#include "../elements/FuseElm.h"
#include "../elements/AMElm.h"
#include "../elements/FMElm.h"
#include "../elements/LDRElm.h"
#include "../elements/ThermistorNTCElm.h"
#include "../elements/BoxElm.h"
#include "../elements/LineElm.h"
#include "../elements/AntennaElm.h"
#include "../elements/GyratorElm.h"
#include "../elements/TappedTransformerElm.h"
#include "../elements/ThreePhaseMotorElm.h"
#include "../elements/ControlledVoltageElm.h"
#include "../elements/ControlledCurrentElm.h"
#include "../elements/BusLogicInputElm.h"
#include "../elements/InstructionDisplayElm.h"
#include "../elements/ExtVoltageElm.h"
#include "../elements/AmmeterElm.h"
#include "../elements/PolarCapacitorElm.h"
#include "../elements/VaractorElm.h"
#include "../elements/TunnelDiodeElm.h"
#include "../elements/SCRElm.h"
#include "../elements/TriacElm.h"
#include "../elements/DiacElm.h"
#include "../elements/TriodeElm.h"
#include "../elements/LampElm.h"
#include "../elements/SparkGapElm.h"
#include "../elements/InvertingSchmittElm.h"

template <class T>
static void reg(const char *name) {
    ElementFactory::registerClass<T>(name);
    CircuitElm *sample = ElementFactory::create(name, 0, 0);
    ElementFactory::registerDumpType(name, sample);
    delete sample;
}

void registerElements() {
    reg<ACVoltageElm>("ACVoltageElm");
    reg<CapacitorElm>("CapacitorElm");
    reg<CurrentElm>("CurrentElm");
    reg<DCVoltageElm>("DCVoltageElm");
    reg<GroundElm>("GroundElm");
    reg<InductorElm>("InductorElm");
    reg<RailElm>("RailElm");
    reg<ACRailElm>("ACRailElm");
    reg<SquareRailElm>("SquareRailElm");
    reg<ClockElm>("ClockElm");
    reg<ResistorElm>("ResistorElm");
    reg<SwitchElm>("SwitchElm");
    reg<PushSwitchElm>("PushSwitchElm");
    reg<VoltageElm>("VoltageElm");
    reg<WireElm>("WireElm");
    reg<DiodeElm>("DiodeElm");
    reg<AndGateElm>("AndGateElm");
    reg<NandGateElm>("NandGateElm");
    reg<OrGateElm>("OrGateElm");
    reg<NorGateElm>("NorGateElm");
    reg<XorGateElm>("XorGateElm");
    reg<XnorGateElm>("XnorGateElm");
    reg<InverterElm>("InverterElm");
    reg<PJfetElm>("PJfetElm");
    reg<NJfetElm>("NJfetElm");
    reg<JfetElm>("JfetElm");
    reg<PMosfetElm>("PMosfetElm");
    reg<NMosfetElm>("NMosfetElm");
    reg<MosfetElm>("MosfetElm");
    reg<ProbeElm>("ProbeElm");
    reg<LabeledNodeElm>("LabeledNodeElm");
    reg<VarRailElm>("VarRailElm");
    reg<PotElm>("PotElm");
    reg<Switch2Elm>("Switch2Elm");
    reg<SweepElm>("SweepElm");
    reg<ZenerElm>("ZenerElm");
    reg<LEDElm>("LEDElm");
    reg<TransformerElm>("TransformerElm");
    reg<AnalogSwitchElm>("AnalogSwitchElm");
    reg<AnalogSwitch2Elm>("AnalogSwitch2Elm");
    reg<MemristorElm>("MemristorElm");
    reg<TransLineElm>("TransLineElm");
    reg<RelayElm>("RelayElm");
    reg<RelayCoilElm>("RelayCoilElm");
    reg<RelayContactElm>("RelayContactElm");
    reg<CrossSwitchElm>("CrossSwitchElm");
    reg<MotorProtectionSwitchElm>("MotorProtectionSwitchElm");
    reg<RoutedWireElm>("RoutedWireElm");
    reg<AudioOutputElm>("AudioOutputElm");
    reg<AudioInputElm>("AudioInputElm");
    reg<NoiseElm>("NoiseElm");
    reg<CustomLogicElm>("CustomLogicElm");
    reg<CCVSElm>("CCVSElm");
    reg<CCCSElm>("CCCSElm");
    reg<VCVSElm>("VCVSElm");
    reg<VCCSElm>("VCCSElm");
    reg<SevenSegElm>("SevenSegElm");
    reg<BusSplitterElm>("BusSplitterElm");
    reg<TimeDelayRelayElm>("TimeDelayRelayElm");
    reg<ROMElm>("ROMElm");
    reg<SRAMElm>("SRAMElm");
    reg<LEDArrayElm>("LEDArrayElm");
    reg<BusTransceiverElm>("BusTransceiverElm");
    reg<AnalogMuxElm>("AnalogMuxElm");
    reg<CC2NegElm>("CC2NegElm");
    reg<CC2Elm>("CC2Elm");
    reg<PhaseCompElm>("PhaseCompElm");
    reg<VCOElm>("VCOElm");
    reg<DecimalDisplayElm>("DecimalDisplayElm");
    reg<SevenSegDecoderElm>("SevenSegDecoderElm");
    reg<DeMultiplexerElm>("DeMultiplexerElm");
    reg<MultiplexerElm>("MultiplexerElm");
    reg<SeqGenElm>("SeqGenElm");
    reg<MonostableElm>("MonostableElm");
    reg<ADCElm>("ADCElm");
    reg<DACElm>("DACElm");
    reg<TimerElm>("TimerElm");
    reg<PisoShiftElm>("PisoShiftElm");
    reg<SipoShiftElm>("SipoShiftElm");
    reg<LatchElm>("LatchElm");
    reg<RingCounterElm>("RingCounterElm");
    reg<Counter2Elm>("Counter2Elm");
    reg<CounterElm>("CounterElm");
    reg<FullAdderElm>("FullAdderElm");
    reg<HalfAdderElm>("HalfAdderElm");
    reg<TFlipFlopElm>("TFlipFlopElm");
    reg<JKFlipFlopElm>("JKFlipFlopElm");
    reg<DFlipFlopElm>("DFlipFlopElm");
    reg<LogicInputElm>("LogicInputElm");
    reg<LogicOutputElm>("LogicOutputElm");
    reg<OpAmpElm>("OpAmpElm");
    reg<OpAmpSwapElm>("OpAmpSwapElm");
    reg<OutputElm>("OutputElm");
    reg<TextElm>("TextElm");
    reg<TransistorElm>("TransistorElm");
    reg<NTransistorElm>("NTransistorElm");
    reg<PTransistorElm>("PTransistorElm");
    reg<DarlingtonElm>("DarlingtonElm");
    reg<NDarlingtonElm>("NDarlingtonElm");
    reg<PDarlingtonElm>("PDarlingtonElm");
    reg<UnijunctionElm>("UnijunctionElm");
    reg<CrystalElm>("CrystalElm");
    reg<OTAElm>("OTAElm");
    reg<NortonAmpElm>("NortonAmpElm");
    reg<ComparatorElm>("ComparatorElm");
    reg<OpAmpRealElm>("OpAmpRealElm");
    reg<OptocouplerElm>("OptocouplerElm");
    reg<PolarCapacitorElm>("PolarCapacitorElm");
    reg<VaractorElm>("VaractorElm");
    reg<TunnelDiodeElm>("TunnelDiodeElm");
    reg<SCRElm>("SCRElm");
    reg<TriacElm>("TriacElm");
    reg<DiacElm>("DiacElm");
    reg<TriodeElm>("TriodeElm");
    reg<LampElm>("LampElm");
    reg<SparkGapElm>("SparkGapElm");
    reg<InvertingSchmittElm>("InvertingSchmittElm");
    reg<SchmittElm>("SchmittElm");
    reg<ControlledVoltageElm>("ControlledVoltageElm");
    reg<ControlledCurrentElm>("ControlledCurrentElm");
    reg<BusLogicInputElm>("BusLogicInputElm");
    reg<InstructionDisplayElm>("InstructionDisplayElm");
    reg<ExtVoltageElm>("ExtVoltageElm");
    reg<AmmeterElm>("AmmeterElm");
    reg<BoxElm>("BoxElm");
    reg<LineElm>("LineElm");
    reg<AntennaElm>("AntennaElm");
    reg<GyratorElm>("GyratorElm");
    reg<TappedTransformerElm>("TappedTransformerElm");
    reg<ThreePhaseMotorElm>("ThreePhaseMotorElm");
    reg<FuseElm>("FuseElm");
    reg<AMElm>("AMElm");
    reg<FMElm>("FMElm");
    reg<LDRElm>("LDRElm");
    reg<ThermistorNTCElm>("ThermistorNTCElm");
    reg<TriStateElm>("TriStateElm");
    reg<DelayBufferElm>("DelayBufferElm");
    reg<DPDTSwitchElm>("DPDTSwitchElm");
    reg<MBBSwitchElm>("MBBSwitchElm");
    reg<OhmMeterElm>("OhmMeterElm");
    reg<StopTriggerElm>("StopTriggerElm");
    reg<DCMotorElm>("DCMotorElm");
    reg<WattmeterElm>("WattmeterElm");
    reg<WattmeterTrueElm>("WattmeterTrueElm");
    reg<DataRecorderElm>("DataRecorderElm");
    reg<DataInputElm>("DataInputElm");
    reg<BatteryElm>("BatteryElm");
    reg<CustomTransformerElm>("CustomTransformerElm");
    reg<TestPointElm>("TestPointElm");
    reg<ScopeElm>("ScopeElm");
    // last: its sample instance loads the built-in subcircuit models, which need the other classes
    reg<SubcircuitElm>("SubcircuitElm");
}
