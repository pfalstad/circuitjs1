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

import { Dialog } from "./Dialog";
import { CirSim } from "./CirSim";
import { Scope } from "./Scope";
import { EditDialog } from "./EditDialog";
import { CircuitElm } from "./CircuitElm";
import { Locale } from "./Locale";
import { ScopeTrigger } from "./ScopeTrigger";
import { ScopePlot } from "./ScopePlot";
import { HookRegistry } from "./HookRegistry";

// A checkbox with an associated scope menu command string.
class ScopeCheckBox {
    element: HTMLInputElement;
    menuCmd: string;

    constructor(label: string, menuCmd: string, container: HTMLElement) {
        this.menuCmd = menuCmd;
        this.element = document.createElement('input');
        this.element.type = 'checkbox';
        const lbl = document.createElement('label');
        lbl.style.display = 'inline-flex';
        lbl.style.alignItems = 'center';
        lbl.style.gap = '4px';
        lbl.style.marginRight = '8px';
        lbl.appendChild(this.element);
        lbl.appendChild(document.createTextNode(Locale.LS(label)));
        container.appendChild(lbl);
    }

    getValue(): boolean { return this.element.checked; }
    setValue(b: boolean): void { if (this.element.checked !== b) this.element.checked = b; }
    setEnabled(b: boolean): void { this.element.disabled = !b; }
}

// Expandable section: bold label + +/- toggle button, controls visibility of a content div.
class ExpandingSection {
    expanded: boolean;
    private btn: HTMLButtonElement;
    contentEl: HTMLDivElement;

    constructor(label: string, expanded: boolean, container: HTMLElement) {
        this.expanded = expanded;
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;gap:4px;margin-top:8px;';
        this.btn = document.createElement('button');
        this.btn.className = 'expand-but';
        this.btn.textContent = expanded ? '-' : '+';
        this.btn.addEventListener('click', () => {
            this.expanded = !this.expanded;
            this.btn.textContent = this.expanded ? '-' : '+';
            this.contentEl.style.display = this.expanded ? '' : 'none';
        });
        const lbl = document.createElement('span');
        lbl.style.fontWeight = 'bold';
        lbl.textContent = Locale.LS(label);
        header.appendChild(this.btn);
        header.appendChild(lbl);
        container.appendChild(header);
        this.contentEl = document.createElement('div');
        this.contentEl.style.display = expanded ? '' : 'none';
        container.appendChild(this.contentEl);
    }
}

export class ScopePropertiesDialog extends Dialog {

    private scope: Scope;
    private app: CirSim;
    private plotSelection: number = 0;

    // Vertical scale
    private vScaleSection: ExpandingSection;
    private autoButton: HTMLInputElement;
    private maxButton: HTMLInputElement;
    private manualButton: HTMLInputElement;
    private channelButtonsDiv: HTMLDivElement;
    private chanButtons: HTMLButtonElement[] = [];
    private channelSettingsDiv: HTMLDivElement;
    private dcButton: HTMLInputElement;
    private acButton: HTMLInputElement;
    private positionLabel: HTMLSpanElement;
    private positionBar: HTMLInputElement;
    private manualScaleIdLabel: HTMLSpanElement;
    private manualScaleTextBox: HTMLInputElement;
    private manualScaleLabel: HTMLSpanElement;
    private scaleDownButton: HTMLButtonElement;
    private scaleUpButton: HTMLButtonElement;
    private applyButton: HTMLButtonElement;
    private divisionsTextBox: HTMLInputElement;
    private divisionsRow: HTMLDivElement;
    private vScaleRow0: HTMLDivElement;
    private vScaleRow1: HTMLDivElement;
    private vScaleRow2: HTMLDivElement;

    // Horizontal scale
    private hScaleSection: ExpandingSection;
    private speedBar: HTMLInputElement;
    private scopeSpeedLabel: HTMLSpanElement;

    // Trigger
    private triggerSection: ExpandingSection;
    private trigFreeRunButton: HTMLInputElement;
    private trigNormalButton: HTMLInputElement;
    private trigAutoButton: HTMLInputElement;
    private trigEdgeDiv: HTMLDivElement;
    private trigRisingButton: HTMLInputElement;
    private trigFallingButton: HTMLInputElement;
    private triggerLevelTextBox: HTMLInputElement;
    private trigModePDiv: HTMLDivElement;
    private trigLevelDiv: HTMLDivElement;

    // Trail
    private trailBar: HTMLInputElement;
    private trailLabel: HTMLSpanElement;

    // Plots checkboxes
    private plotsSection: ExpandingSection;
    private voltageBox: ScopeCheckBox | null = null;
    private currentBox: ScopeCheckBox | null = null;
    private ibBox: ScopeCheckBox | null = null;
    private icBox: ScopeCheckBox | null = null;
    private ieBox: ScopeCheckBox | null = null;
    private vbeBox: ScopeCheckBox | null = null;
    private vbcBox: ScopeCheckBox | null = null;
    private vceBox: ScopeCheckBox | null = null;
    private vceIcBox: ScopeCheckBox | null = null;
    private powerBox: ScopeCheckBox;
    private chargeBox: ScopeCheckBox | null = null;
    private resistanceBox: ScopeCheckBox;
    private spectrumBox: ScopeCheckBox;
    private logSpectrumBox: ScopeCheckBox;

    // XY plots
    private xyPlotsSection: ExpandingSection;
    private viBox: ScopeCheckBox;
    private xyBox: ScopeCheckBox;
    private xySettingsDiv: HTMLDivElement;
    private xyPlotXBox: HTMLSelectElement;
    private xyPlotYBox: HTMLSelectElement;
    private xyBrightnessBox: HTMLSelectElement;
    private xyRedBox: HTMLSelectElement;
    private xyGreenBox: HTMLSelectElement;
    private xyBlueBox: HTMLSelectElement;

    // Show info
    private showInfoSection: ExpandingSection;
    private scaleBox: ScopeCheckBox;
    private peakBox: ScopeCheckBox;
    private negPeakBox: ScopeCheckBox;
    private p2pBox: ScopeCheckBox;
    private freqBox: ScopeCheckBox;
    private averageBox: ScopeCheckBox;
    private rmsBox: ScopeCheckBox;
    private dutyBox: ScopeCheckBox;
    private phaseAngleBox: ScopeCheckBox;
    private elmInfoBox: ScopeCheckBox;

    // Custom label
    private labelSection: ExpandingSection;
    private labelTextBox: HTMLInputElement;

    constructor(app: CirSim, scope: Scope) {
        super();
        this.app = app;
        this.scope = scope;

        const allowedHeight = window.innerHeight * 4 / 5;
        const displayAll    = allowedHeight > 600;
        const displayScales = allowedHeight > 470;

        const titleEl = document.createElement('h3');
        titleEl.textContent = Locale.LS('Scope Properties');
        titleEl.style.margin = '0 0 8px 0';
        this.dialogEl.appendChild(titleEl);

        const fp = document.createElement('div');
        fp.style.cssText = 'max-height:80vh;overflow-y:auto;min-width:420px;padding:8px;';
        this.dialogEl.appendChild(fp);

        const elm = scope.getSingleElm();
        const transistor = elm !== null && elm.isTransistorElm();
        const capacitor  = elm !== null && elm.isCapacitorElm();

        // ---- Vertical Scale ----
        this.vScaleSection = new ExpandingSection('Vertical Scale', displayScales, fp);
        const vContent = this.vScaleSection.contentEl;

        // Auto / Max / Manual radio group
        const vModePDiv = document.createElement('div');
        vModePDiv.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin-bottom:4px;';
        vContent.appendChild(vModePDiv);
        this.autoButton   = this.makeRadio('vMode', 'Auto',            vModePDiv, () => { scope.setManualScale(false, false); scope.setMaxScale(false); this.updateUi(); });
        this.maxButton    = this.makeRadio('vMode', 'Auto (Max Scale)', vModePDiv, () => { scope.setManualScale(false, false); scope.setMaxScale(true);  this.updateUi(); });
        this.manualButton = this.makeRadio('vMode', 'Manual',           vModePDiv, () => { scope.setManualScale(true, true);                             this.updateUi(); });

        // Channel buttons
        this.channelSettingsDiv = document.createElement('div');
        vContent.appendChild(this.channelSettingsDiv);
        this.channelButtonsDiv = document.createElement('div');
        this.channelButtonsDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px;';
        this.channelSettingsDiv.appendChild(this.channelButtonsDiv);

        // DC/AC coupling row
        this.vScaleRow0 = document.createElement('div');
        this.vScaleRow0.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin-bottom:4px;';
        this.dcButton = this.makeRadio('acdc', 'DC Coupled', this.vScaleRow0, () => {
            if (this.plotSelection < scope.visiblePlots.length)
                scope.visiblePlots[this.plotSelection].setAcCoupled(false);
            this.updateUi();
        });
        this.acButton = this.makeRadio('acdc', 'AC Coupled', this.vScaleRow0, () => {
            if (this.plotSelection < scope.visiblePlots.length)
                scope.visiblePlots[this.plotSelection].setAcCoupled(true);
            this.updateUi();
        });
        vContent.appendChild(this.vScaleRow0);

        // Position row
        this.vScaleRow1 = document.createElement('div');
        this.vScaleRow1.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;';
        this.positionLabel = document.createElement('span');
        this.vScaleRow1.appendChild(this.positionLabel);
        this.positionBar = document.createElement('input');
        this.positionBar.type = 'range';
        this.positionBar.min  = String(-Scope.V_POSITION_STEPS);
        this.positionBar.max  = String(Scope.V_POSITION_STEPS);
        this.positionBar.value = '0';
        this.positionBar.style.flex = '1';
        this.positionBar.addEventListener('input', () => this.positionBarChanged());
        this.vScaleRow1.appendChild(this.positionBar);
        const resetPosBtn = document.createElement('button');
        resetPosBtn.textContent = Locale.LS('Reset Position');
        resetPosBtn.addEventListener('click', () => { this.positionBar.value = '0'; this.positionBarChanged(); this.updateUi(); });
        this.vScaleRow1.appendChild(resetPosBtn);
        vContent.appendChild(this.vScaleRow1);

        // Manual scale row
        this.vScaleRow2 = document.createElement('div');
        this.vScaleRow2.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:4px;flex-wrap:wrap;';
        this.manualScaleIdLabel = document.createElement('span');
        this.vScaleRow2.appendChild(this.manualScaleIdLabel);
        this.scaleDownButton = document.createElement('button');
        this.scaleDownButton.innerHTML = '&#9660;';
        this.scaleDownButton.addEventListener('click', () => {
            if (!scope.isManualScale() || this.plotSelection >= scope.visiblePlots.length) return;
            const d = this.getManualScaleValue();
            if (d === 0) return;
            let s = Scope.MIN_MAN_SCALE, lasts = s;
            const target = d * 0.999;
            for (let a = 0; s < target; a++) { lasts = s; s *= Scope.multa[a % 3]; }
            scope.setManualScaleValue(this.plotSelection, lasts);
            this.updateUi();
        });
        this.vScaleRow2.appendChild(this.scaleDownButton);
        this.manualScaleTextBox = document.createElement('input');
        this.manualScaleTextBox.type = 'text';
        this.manualScaleTextBox.style.width = '80px';
        this.manualScaleTextBox.className = 'scalebox';
        this.manualScaleTextBox.addEventListener('change', () => { this.apply(); this.updateUi(); });
        this.vScaleRow2.appendChild(this.manualScaleTextBox);
        this.scaleUpButton = document.createElement('button');
        this.scaleUpButton.innerHTML = '&#9650;';
        this.scaleUpButton.addEventListener('click', () => {
            if (!scope.isManualScale() || this.plotSelection >= scope.visiblePlots.length) return;
            const d = this.getManualScaleValue();
            if (d === 0) return;
            scope.setManualScaleValue(this.plotSelection, ScopePropertiesDialog.nextHighestScale(d));
            this.updateUi();
        });
        this.vScaleRow2.appendChild(this.scaleUpButton);
        this.manualScaleLabel = document.createElement('span');
        this.vScaleRow2.appendChild(this.manualScaleLabel);
        this.applyButton = document.createElement('button');
        this.applyButton.textContent = Locale.LS('Apply');
        this.applyButton.addEventListener('click', () => this.apply());
        this.vScaleRow2.appendChild(this.applyButton);
        vContent.appendChild(this.vScaleRow2);

        // Divisions row
        this.divisionsRow = document.createElement('div');
        this.divisionsRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;';
        const divLabel = document.createElement('span');
        divLabel.textContent = Locale.LS('# of Divisions');
        this.divisionsRow.appendChild(divLabel);
        this.divisionsTextBox = document.createElement('input');
        this.divisionsTextBox.type = 'text';
        this.divisionsTextBox.style.width = '50px';
        this.divisionsTextBox.addEventListener('change', () => { this.apply(); this.updateUi(); });
        this.divisionsRow.appendChild(this.divisionsTextBox);
        const applyDivBtn = document.createElement('button');
        applyDivBtn.textContent = Locale.LS('Apply');
        applyDivBtn.addEventListener('click', () => this.apply());
        this.divisionsRow.appendChild(applyDivBtn);
        vContent.appendChild(this.divisionsRow);

        // ---- Horizontal Scale ----
        this.hScaleSection = new ExpandingSection('Horizontal Scale', displayScales, fp);
        const hContent = this.hScaleSection.contentEl;
        const hRow = document.createElement('div');
        hRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;';
        this.speedBar = document.createElement('input');
        this.speedBar.type = 'range';
        this.speedBar.min  = '0';
        this.speedBar.max  = '11';
        this.speedBar.value = '2';
        this.speedBar.style.flex = '1';
        this.speedBar.addEventListener('input', () => this.scrollbarChanged());
        hRow.appendChild(this.speedBar);
        this.scopeSpeedLabel = document.createElement('span');
        this.scopeSpeedLabel.style.minWidth = '80px';
        this.scopeSpeedLabel.style.textAlign = 'right';
        hRow.appendChild(this.scopeSpeedLabel);
        hContent.appendChild(hRow);

        // ---- Trigger ----
        this.triggerSection = new ExpandingSection('Trigger', false, fp);
        const tContent = this.triggerSection.contentEl;

        this.trigModePDiv = document.createElement('div');
        this.trigModePDiv.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin-bottom:4px;';
        this.trigFreeRunButton = this.makeRadio('trigMode', 'Free Run', this.trigModePDiv, (e) => {
            if ((e.target as HTMLInputElement).checked) { scope.setTriggerMode(ScopeTrigger.TRIGGER_FREERUN); this.updateUi(); }
        });
        this.trigNormalButton = this.makeRadio('trigMode', 'Normal',   this.trigModePDiv, (e) => {
            if ((e.target as HTMLInputElement).checked) { scope.setTriggerMode(ScopeTrigger.TRIGGER_NORMAL);   this.updateUi(); }
        });
        this.trigAutoButton   = this.makeRadio('trigMode', 'Auto',     this.trigModePDiv, (e) => {
            if ((e.target as HTMLInputElement).checked) { scope.setTriggerMode(ScopeTrigger.TRIGGER_AUTO);     this.updateUi(); }
        });
        tContent.appendChild(this.trigModePDiv);

        this.trigEdgeDiv = document.createElement('div');
        this.trigEdgeDiv.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;';
        const edgeLbl = document.createElement('span');
        edgeLbl.textContent = Locale.LS('Edge') + ': ';
        this.trigEdgeDiv.appendChild(edgeLbl);
        this.trigRisingButton  = this.makeRadio('trigEdge', 'Rising',  this.trigEdgeDiv, (e) => {
            if ((e.target as HTMLInputElement).checked) { scope.trigger.edge = ScopeTrigger.TRIGGER_EDGE_RISING;  scope.resetGraph(); }
        });
        this.trigFallingButton = this.makeRadio('trigEdge', 'Falling', this.trigEdgeDiv, (e) => {
            if ((e.target as HTMLInputElement).checked) { scope.trigger.edge = ScopeTrigger.TRIGGER_EDGE_FALLING; scope.resetGraph(); }
        });
        tContent.appendChild(this.trigEdgeDiv);

        this.trigLevelDiv = document.createElement('div');
        this.trigLevelDiv.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;';
        const lvlLbl = document.createElement('span');
        lvlLbl.textContent = Locale.LS('Level') + ': ';
        this.trigLevelDiv.appendChild(lvlLbl);
        this.triggerLevelTextBox = document.createElement('input');
        this.triggerLevelTextBox.type = 'text';
        this.triggerLevelTextBox.style.width = '80px';
        this.triggerLevelTextBox.className = 'scalebox';
        this.trigLevelDiv.appendChild(this.triggerLevelTextBox);
        const trigApplyBtn = document.createElement('button');
        trigApplyBtn.textContent = Locale.LS('Apply');
        trigApplyBtn.addEventListener('click', () => this.applyTriggerLevel());
        this.trigLevelDiv.appendChild(trigApplyBtn);
        tContent.appendChild(this.trigLevelDiv);

        // ---- Plots ----
        this.plotsSection = new ExpandingSection('Plots', displayAll, fp);
        const plotsContent = this.plotsSection.contentEl;
        const plotsGrid = document.createElement('div');
        plotsGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:4px;';
        plotsContent.appendChild(plotsGrid);

        if (!transistor) {
            this.voltageBox = new ScopeCheckBox('Show Voltage', 'showvoltage', plotsGrid);
            this.voltageBox.element.addEventListener('change', () => this.onCheckboxChange(this.voltageBox!));
            this.currentBox = new ScopeCheckBox('Show Current', 'showcurrent', plotsGrid);
            this.currentBox.element.addEventListener('change', () => this.onCheckboxChange(this.currentBox!));
        } else {
            this.ibBox  = new ScopeCheckBox('Show Ib',  'showib',  plotsGrid); this.ibBox.element.addEventListener('change',  () => this.onCheckboxChange(this.ibBox!));
            this.icBox  = new ScopeCheckBox('Show Ic',  'showic',  plotsGrid); this.icBox.element.addEventListener('change',  () => this.onCheckboxChange(this.icBox!));
            this.ieBox  = new ScopeCheckBox('Show Ie',  'showie',  plotsGrid); this.ieBox.element.addEventListener('change',  () => this.onCheckboxChange(this.ieBox!));
            this.vbeBox = new ScopeCheckBox('Show Vbe', 'showvbe', plotsGrid); this.vbeBox.element.addEventListener('change', () => this.onCheckboxChange(this.vbeBox!));
            this.vbcBox = new ScopeCheckBox('Show Vbc', 'showvbc', plotsGrid); this.vbcBox.element.addEventListener('change', () => this.onCheckboxChange(this.vbcBox!));
            this.vceBox = new ScopeCheckBox('Show Vce', 'showvce', plotsGrid); this.vceBox.element.addEventListener('change', () => this.onCheckboxChange(this.vceBox!));
        }
        this.powerBox = new ScopeCheckBox('Show Power Consumed', 'showpower', plotsGrid);
        this.powerBox.element.addEventListener('change', () => this.onCheckboxChange(this.powerBox));
        if (capacitor) {
            this.chargeBox = new ScopeCheckBox('Show Charge', 'showcharge', plotsGrid);
            this.chargeBox.element.addEventListener('change', () => this.onCheckboxChange(this.chargeBox!));
        }
        this.resistanceBox = new ScopeCheckBox('Show Resistance', 'showresistance', plotsGrid);
        this.resistanceBox.element.addEventListener('change', () => this.onCheckboxChange(this.resistanceBox));
        this.spectrumBox = new ScopeCheckBox('Show Spectrum', 'showfft', plotsGrid);
        this.spectrumBox.element.addEventListener('change', () => this.onCheckboxChange(this.spectrumBox));
        this.logSpectrumBox = new ScopeCheckBox('Log Spectrum', 'logspectrum', plotsGrid);
        this.logSpectrumBox.element.addEventListener('change', () => this.onCheckboxChange(this.logSpectrumBox));
        if (transistor) {
            this.vceIcBox = new ScopeCheckBox('Show Vce vs Ic', 'showvcevsic', plotsGrid);
            this.vceIcBox.element.addEventListener('change', () => this.onCheckboxChange(this.vceIcBox!));
        }

        // ---- XY Plots ----
        this.xyPlotsSection = new ExpandingSection('X-Y Plots', displayAll, fp);
        const xyContent = this.xyPlotsSection.contentEl;
        const xyBasicDiv = document.createElement('div');
        xyContent.appendChild(xyBasicDiv);
        this.viBox = new ScopeCheckBox('Show V vs I', 'showvvsi', xyBasicDiv);
        this.viBox.element.addEventListener('change', () => this.onCheckboxChange(this.viBox));
        this.xyBox = new ScopeCheckBox('Plot X/Y', 'plotxy', xyBasicDiv);
        this.xyBox.element.addEventListener('change', () => this.onCheckboxChange(this.xyBox));

        this.xySettingsDiv = document.createElement('div');
        this.xySettingsDiv.style.cssText = 'display:grid;grid-template-columns:auto 1fr auto 1fr;gap:4px;align-items:center;margin-top:4px;';
        xyContent.appendChild(this.xySettingsDiv);
        this.xyPlotXBox = this.makeXYSelect('X Axis:', this.xySettingsDiv, (idx) => { if (idx >= 0) scope.plot2d.plotX = idx; scope.resetGraph(); });
        this.xyPlotYBox = this.makeXYSelect('Y Axis:', this.xySettingsDiv, (idx) => { if (idx >= 0) scope.plot2d.plotY = idx; scope.resetGraph(); });
        this.xyBrightnessBox = this.makeXYSelect('Brightness:', this.xySettingsDiv, (idx) => { scope.plot2d.plotBrightness = idx; scope.resetGraph(); });
        this.xyRedBox   = this.makeXYSelect('Red:',   this.xySettingsDiv, (idx) => { scope.plot2d.plotColorR = idx; scope.resetGraph(); });
        this.xyGreenBox = this.makeXYSelect('Green:', this.xySettingsDiv, (idx) => { scope.plot2d.plotColorG = idx; scope.resetGraph(); });
        this.xyBlueBox  = this.makeXYSelect('Blue:',  this.xySettingsDiv, (idx) => { scope.plot2d.plotColorB = idx; scope.resetGraph(); });

        // Trail Persistence (inside XY Plots section)
        const trailDiv = document.createElement('div');
        trailDiv.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:8px;';
        trailDiv.appendChild(Object.assign(document.createElement('span'), { textContent: Locale.LS('Trail Persistence (time steps)') }));
        this.trailBar = document.createElement('input');
        this.trailBar.type = 'range';
        this.trailBar.min  = '0';
        this.trailBar.max  = '61';
        this.trailBar.value = String(ScopePropertiesDialog.trailStepsToSlider(scope.plot2d.trailPersistence));
        this.trailBar.style.flex = '1';
        this.trailBar.addEventListener('input', () => {
            scope.plot2d.trailPersistence = ScopePropertiesDialog.trailSliderToSteps(Number(this.trailBar.value));
            this.setTrailLabel();
        });
        trailDiv.appendChild(this.trailBar);
        this.trailLabel = document.createElement('span');
        this.trailLabel.style.minWidth = '60px';
        trailDiv.appendChild(this.trailLabel);
        xyContent.appendChild(trailDiv);

        // ---- Show Info ----
        this.showInfoSection = new ExpandingSection('Show Info', displayAll, fp);
        const infoContent = this.showInfoSection.contentEl;
        const infoGrid = document.createElement('div');
        infoGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:4px;';
        infoContent.appendChild(infoGrid);
        this.scaleBox      = new ScopeCheckBox('Show Scale',              'showscale',      infoGrid); this.scaleBox.element.addEventListener('change',      () => this.onCheckboxChange(this.scaleBox));
        this.peakBox       = new ScopeCheckBox('Show Peak Value',         'showpeak',       infoGrid); this.peakBox.element.addEventListener('change',       () => this.onCheckboxChange(this.peakBox));
        this.negPeakBox    = new ScopeCheckBox('Show Negative Peak Value','shownegpeak',    infoGrid); this.negPeakBox.element.addEventListener('change',    () => this.onCheckboxChange(this.negPeakBox));
        this.p2pBox        = new ScopeCheckBox('Show Peak-to-Peak',       'showp2p',        infoGrid); this.p2pBox.element.addEventListener('change',        () => this.onCheckboxChange(this.p2pBox));
        this.freqBox       = new ScopeCheckBox('Show Frequency',          'showfreq',       infoGrid); this.freqBox.element.addEventListener('change',       () => this.onCheckboxChange(this.freqBox));
        this.averageBox    = new ScopeCheckBox('Show Average',            'showaverage',    infoGrid); this.averageBox.element.addEventListener('change',    () => this.onCheckboxChange(this.averageBox));
        this.rmsBox        = new ScopeCheckBox('Show RMS Average',        'showrms',        infoGrid); this.rmsBox.element.addEventListener('change',        () => this.onCheckboxChange(this.rmsBox));
        this.dutyBox       = new ScopeCheckBox('Show Duty Cycle',         'showduty',       infoGrid); this.dutyBox.element.addEventListener('change',       () => this.onCheckboxChange(this.dutyBox));
        this.phaseAngleBox = new ScopeCheckBox('Show Phase Angle',        'showphaseangle', infoGrid); this.phaseAngleBox.element.addEventListener('change', () => this.onCheckboxChange(this.phaseAngleBox));
        this.elmInfoBox    = new ScopeCheckBox('Show Extended Info',      'showelminfo',    infoGrid); this.elmInfoBox.element.addEventListener('change',    () => this.onCheckboxChange(this.elmInfoBox));

        // ---- Custom Label ----
        this.labelSection = new ExpandingSection('Custom Label', displayAll, fp);
        const labelContent = this.labelSection.contentEl;
        const labelRow = document.createElement('div');
        labelRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:4px;';
        this.labelTextBox = document.createElement('input');
        this.labelTextBox.type = 'text';
        this.labelTextBox.style.flex = '1';
        const labelText = scope.getText();
        if (labelText !== null) this.labelTextBox.value = labelText;
        labelRow.appendChild(this.labelTextBox);
        const applyLabelBtn = document.createElement('button');
        applyLabelBtn.textContent = Locale.LS('Apply');
        applyLabelBtn.addEventListener('click', () => this.apply());
        labelRow.appendChild(applyLabelBtn);
        labelContent.appendChild(labelRow);

        // ---- Buttons row ----
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;justify-content:space-between;margin-top:12px;';
        const okBtn = document.createElement('button');
        okBtn.textContent = Locale.LS('OK');
        okBtn.addEventListener('click', () => this.closeDialog());
        btnRow.appendChild(okBtn);
        const saveDefaultBtn = document.createElement('button');
        saveDefaultBtn.textContent = Locale.LS('Save as Default');
        saveDefaultBtn.addEventListener('click', () => scope.saveAsDefault());
        btnRow.appendChild(saveDefaultBtn);
        fp.appendChild(btnRow);

        this.updateChannelButtons();
        this.setTrailLabel();
        this.updateUi();
        this.show();
    }

    // ---- Helpers ----

    private makeRadio(name: string, label: string, container: HTMLElement, handler: (e: Event) => void): HTMLInputElement {
        const inp = document.createElement('input');
        inp.type = 'radio';
        inp.name = name;
        const lbl = document.createElement('label');
        lbl.style.display = 'inline-flex';
        lbl.style.alignItems = 'center';
        lbl.style.gap = '4px';
        lbl.appendChild(inp);
        lbl.appendChild(document.createTextNode(Locale.LS(label)));
        inp.addEventListener('change', handler);
        container.appendChild(lbl);
        return inp;
    }

    private makeXYSelect(label: string, container: HTMLElement, handler: (idx: number) => void): HTMLSelectElement {
        const lbl = document.createElement('span');
        lbl.textContent = Locale.LS(label);
        container.appendChild(lbl);
        const sel = document.createElement('select');
        sel.addEventListener('change', () => {
            const idx = this.getSelectValue(sel);
            handler(idx);
        });
        container.appendChild(sel);
        return sel;
    }

    private getSelectValue(sel: HTMLSelectElement): number {
        const idx = sel.selectedIndex;
        if (idx < 0) return -1;
        try { return parseInt(sel.options[idx].value); } catch (e) { return -1; }
    }

    private populatePlotListBox(sel: HTMLSelectElement, selectedIdx: number, includeNone: boolean): void {
        const scope = this.scope;
        sel.innerHTML = '';
        if (includeNone) {
            const opt = document.createElement('option');
            opt.value = '-1'; opt.textContent = Locale.LS('None');
            sel.appendChild(opt);
        }
        for (let i = 0; i < scope.plots.length; i++) {
            const p = scope.plots[i];
            const name = (p.elm !== null) ? p.elm.getScopeText(p.value) : ('Plot ' + (i + 1));
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = name + ' (' + Scope.getScaleUnitsTextStatic(p.units) + ')';
            sel.appendChild(opt);
        }
        for (let i = 0; i < sel.options.length; i++) {
            if (parseInt(sel.options[i].value) === selectedIdx) { sel.selectedIndex = i; return; }
        }
        sel.selectedIndex = 0;
    }

    private updateChannelButtons(): void {
        const scope = this.scope;
        if (this.plotSelection >= scope.visiblePlots.length) this.plotSelection = 0;
        // remove extra buttons
        while (this.chanButtons.length > scope.visiblePlots.length) {
            const b = this.chanButtons.pop()!;
            b.parentElement?.removeChild(b);
        }
        for (let i = 0; i < scope.visiblePlots.length; i++) {
            if (i >= this.chanButtons.length) {
                const b = document.createElement('button');
                b.className = 'chbut';
                if (CircuitElm.app?.isPrintable()) b.classList.add('chbut-black');
                else b.classList.add('chbut-white');
                const captured = i;
                b.addEventListener('click', () => {
                    this.plotSelection = captured;
                    this.chanButtons.forEach((btn, idx) => {
                        btn.classList.toggle('chsel', idx === this.plotSelection);
                    });
                    this.updateUi();
                });
                this.chanButtons.push(b);
                this.channelButtonsDiv.appendChild(b);
            }
            const p = scope.visiblePlots[i];
            let label = `<span style="color:${p.color}">&#x25CF;</span>&nbsp;CH ${i + 1}`;
            if (p.units === Scope.UNITS_V)    label += ' (V)';
            else if (p.units === Scope.UNITS_A) label += ' (I)';
            else if (p.units === Scope.UNITS_OHMS) label += ' (R)';
            else if (p.units === Scope.UNITS_W) label += ' (P)';
            else if (p.units === Scope.UNITS_C) label += ' (Q)';
            this.chanButtons[i].innerHTML = label;
            this.chanButtons[i].classList.toggle('chsel', i === this.plotSelection);
        }
    }

    private positionBarChanged(): void {
        const scope = this.scope;
        if (!scope.isManualScale() || this.plotSelection >= scope.visiblePlots.length) return;
        scope.setPlotPosition(this.plotSelection, Number(this.positionBar.value));
    }

    private scrollbarChanged(): void {
        const scope = this.scope;
        const newsp = Math.pow(2, 10 - Number(this.speedBar.value)) | 0;
        if (scope.speed !== newsp) scope.setSpeed(newsp);
        this.setScopeSpeedLabel();
    }

    private setScopeSpeedLabel(): void {
        this.scopeSpeedLabel.textContent = CircuitElm.getUnitText(this.scope.calcGridStepX(), 's') + '/div';
    }

    private setTrailLabel(): void {
        if (this.scope.plot2d.trailPersistence <= 0) {
            this.trailLabel.textContent = Locale.LS('default');
        } else {
            const maxTs = this.app.sim?.maxTimeStep ?? 0;
            this.trailLabel.textContent = CircuitElm.getUnitText(this.scope.plot2d.trailPersistence * maxTs, 's');
        }
    }

    private applyTriggerLevel(): void {
        try {
            const d = EditDialog.parseUnits(this.triggerLevelTextBox.value);
            this.scope.trigger.level = d;
            this.scope.resetGraph();
        } catch (e) {}
    }

    private onCheckboxChange(cb: ScopeCheckBox): void {
        this.scope.handleMenu(cb.menuCmd, cb.getValue());
        this.updateUi();
    }

    updateUi(): void {
        const scope = this.scope;

        this.speedBar.value = String(10 - Math.round(Math.log(scope.speed) / Math.log(2)));

        if (this.voltageBox !== null) {
            this.voltageBox.setValue(scope.showV && scope.hasPlotValue(Scope.VAL_VOLTAGE));
            this.currentBox!.setValue(scope.showI && scope.hasPlotValue(Scope.VAL_CURRENT));
        }
        this.powerBox.setValue(scope.hasPlotValue(Scope.VAL_POWER));
        this.scaleBox.setValue(scope.showScale);
        this.peakBox.setValue(scope.showMax);
        this.negPeakBox.setValue(scope.showMin);
        this.p2pBox.setValue(scope.showP2P);
        this.freqBox.setValue(scope.showFreq);
        this.spectrumBox.setValue(scope.fftPlot.enabled);
        this.logSpectrumBox.setValue(scope.fftPlot.logSpectrum);
        this.rmsBox.setValue(scope.showRMS);
        this.averageBox.setValue(scope.showAverage);
        this.dutyBox.setValue(scope.showDutyCycle);
        this.phaseAngleBox.setValue(scope.fftPlot.showPhaseAngle);
        this.elmInfoBox.setValue(scope.showElmInfo);
        this.rmsBox.setEnabled(scope.canShowRMS());
        this.viBox.setValue(scope.plot2d.enabled && !scope.plot2d.plotXY);
        this.xyBox.setValue(scope.plot2d.plotXY);
        this.resistanceBox.setValue(scope.hasPlotValue(Scope.VAL_R));
        this.resistanceBox.setEnabled(scope.canShowResistance());
        if (this.chargeBox !== null)
            this.chargeBox.setValue(scope.hasPlotValue(Scope.VAL_CHARGE));
        if (this.ibBox !== null) {
            this.ibBox.setValue(scope.hasPlotValue(Scope.VAL_IB));
            this.icBox!.setValue(scope.hasPlotValue(Scope.VAL_IC));
            this.ieBox!.setValue(scope.hasPlotValue(Scope.VAL_IE));
            this.vbeBox!.setValue(scope.hasPlotValue(Scope.VAL_VBE));
            this.vbcBox!.setValue(scope.hasPlotValue(Scope.VAL_VBC));
            this.vceBox!.setValue(scope.hasPlotValue(Scope.VAL_VCE));
            this.vceIcBox!.setValue(scope.isShowingVceAndIc());
        }

        // Vertical scale mode
        if (scope.isManualScale()) {
            this.manualButton.checked = true;
            this.autoButton.checked   = false;
            this.maxButton.checked    = false;
            this.applyButton.style.display = '';
        } else {
            this.manualButton.checked = false;
            this.autoButton.checked   = !scope.maxScale;
            this.maxButton.checked    = scope.maxScale;
            this.applyButton.style.display = 'none';
        }
        this.updateManualScaleUi();

        // Trigger section visibility
        const trigActive = scope.trigger.isActive();
        this.trigFreeRunButton.checked  = scope.trigger.mode === ScopeTrigger.TRIGGER_FREERUN;
        this.trigNormalButton.checked   = scope.trigger.mode === ScopeTrigger.TRIGGER_NORMAL;
        this.trigAutoButton.checked     = scope.trigger.mode === ScopeTrigger.TRIGGER_AUTO;
        this.trigRisingButton.checked   = scope.trigger.edge === ScopeTrigger.TRIGGER_EDGE_RISING;
        this.trigFallingButton.checked  = scope.trigger.edge === ScopeTrigger.TRIGGER_EDGE_FALLING;
        this.trigRisingButton.disabled  = !trigActive;
        this.trigFallingButton.disabled = !trigActive;
        this.triggerLevelTextBox.value  = EditDialog.unitStringVal(null, scope.trigger.level);
        this.triggerLevelTextBox.disabled = !trigActive;
        this.trigEdgeDiv.style.display  = trigActive ? '' : 'none';
        this.trigLevelDiv.style.display = trigActive ? '' : 'none';

        // XY settings visibility
        const xyActive = scope.plot2d.plotXY;
        this.xySettingsDiv.style.display = (xyActive && this.xyPlotsSection.expanded) ? '' : 'none';
        if (xyActive) {
            this.populatePlotListBox(this.xyPlotXBox,      scope.plot2d.plotX,          false);
            this.populatePlotListBox(this.xyPlotYBox,      scope.plot2d.plotY,          false);
            this.populatePlotListBox(this.xyBrightnessBox, scope.plot2d.plotBrightness, true);
            this.populatePlotListBox(this.xyRedBox,        scope.plot2d.plotColorR,     true);
            this.populatePlotListBox(this.xyGreenBox,      scope.plot2d.plotColorG,     true);
            this.populatePlotListBox(this.xyBlueBox,       scope.plot2d.plotColorB,     true);
        }

        this.setScopeSpeedLabel();
    }

    private updateManualScaleUi(): void {
        const scope = this.scope;
        this.updateChannelButtons();
        const manual = scope.isManualScale();
        this.channelSettingsDiv.style.display = manual ? '' : 'none';
        this.vScaleRow0.style.display = (manual && this.plotSelection < scope.visiblePlots.length) ? '' : 'none';
        this.vScaleRow1.style.display = (manual && this.plotSelection < scope.visiblePlots.length) ? '' : 'none';
        this.vScaleRow2.style.display = (!manual || this.plotSelection < scope.visiblePlots.length) ? '' : 'none';
        this.divisionsRow.style.display = manual ? '' : 'none';
        this.scaleUpButton.style.display   = manual ? '' : 'none';
        this.scaleDownButton.style.display = manual ? '' : 'none';

        if (manual && this.plotSelection < scope.visiblePlots.length) {
            const p = scope.visiblePlots[this.plotSelection];
            this.manualScaleIdLabel.textContent = 'CH ' + (this.plotSelection + 1) + ' ' + Locale.LS('Scale');
            this.manualScaleLabel.textContent   = Scope.getScaleUnitsTextStatic(p.units) + Locale.LS('/div');
            this.manualScaleTextBox.value       = EditDialog.unitStringVal(null, p.manScale);
            this.manualScaleTextBox.disabled    = false;
            this.divisionsTextBox.value         = String(scope.manDivisions);
            this.divisionsTextBox.disabled      = false;
            this.positionLabel.textContent = 'CH ' + (this.plotSelection + 1) + ' ' + Locale.LS('Position');
            this.positionBar.value         = String(p.manVPosition);
            this.positionBar.disabled      = false;
            this.dcButton.disabled = false;
            this.acButton.disabled = !p.canAcCouple();
            this.dcButton.checked  = !p.isAcCoupled();
            this.acButton.checked  = p.isAcCoupled();
        } else if (manual) {
            this.manualScaleIdLabel.textContent = '';
            this.manualScaleLabel.textContent   = '';
            this.manualScaleTextBox.value       = '';
            this.manualScaleTextBox.disabled    = true;
            this.positionLabel.textContent      = '';
            this.positionBar.disabled           = true;
            this.dcButton.disabled = true;
            this.acButton.disabled = true;
        } else {
            this.manualScaleIdLabel.textContent = '';
            this.manualScaleLabel.textContent   = Locale.LS('Max Value') + ' (' + scope.getScaleUnitsText() + ')';
            this.manualScaleTextBox.value       = EditDialog.unitStringVal(null, scope.getScaleValue());
            this.manualScaleTextBox.disabled    = true;
            this.positionLabel.textContent      = '';
            this.positionBar.disabled           = true;
        }
        this.setScopeSpeedLabel();
    }

    refreshDraw(): void {
        if (!this.scope.isManualScale())
            this.updateManualScaleUi();
    }

    closeDialog(): void {
        super.closeDialog();
        this.apply();
    }

    private getManualScaleValue(): number {
        try {
            const d = EditDialog.parseUnits(this.manualScaleTextBox.value);
            return d < Scope.MIN_MAN_SCALE ? Scope.MIN_MAN_SCALE : d;
        } catch (e) { return 0; }
    }

    private getDivisionsValue(): number {
        try { return parseInt(this.divisionsTextBox.value); } catch (e) { return 0; }
    }

    apply(): boolean {
        const scope = this.scope;
        let label: string | null = this.labelTextBox.value;
        if (label.length === 0) label = null;
        scope.setText(label);
        if (scope.isManualScale()) {
            const d = this.getManualScaleValue();
            if (d > 0) scope.setManualScaleValue(this.plotSelection, d);
            const n = this.getDivisionsValue();
            if (n > 0) scope.setManDivisions(n);
        }
        return true;
    }

    static nextHighestScale(d: number): number {
        d = d * 1.001;
        let s = Scope.MIN_MAN_SCALE;
        for (let a = 0; s < d; a++) s *= Scope.multa[a % 3];
        return s;
    }

    static trailSliderToSteps(v: number): number {
        if (v <= 0) return 0;
        return Math.round(Math.pow(10, v / 10));
    }

    static trailStepsToSlider(steps: number): number {
        if (steps <= 0) return 0;
        return Math.round(Math.log10(steps) * 10);
    }
}

HookRegistry.createScopePropertiesDialog = (app, scope) => new ScopePropertiesDialog(app, scope);
HookRegistry.scopeNextHighestScale = (d) => ScopePropertiesDialog.nextHighestScale(d);
