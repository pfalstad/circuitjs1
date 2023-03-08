*In compliance with the [GPL-2.0](https://opensource.org/licenses/GPL-2.0) license: I declare that this version of the program contains my modifications, which can be seen through the usual "git" mechanism.*  


2022-06  
Contributor(s):  
Paul Falstad  
>2.7.1  
>Merge https://github.com/sharpie7/circuitjs1  
- - - - - - - - - - - - - - - - - - - - - - - - - - - 


2022-05  
Contributor(s):  
Paul Falstad  
>fix calculation of tri-state current (#770)  
>after opening file, use same filename in save dialog  
- - - - - - - - - - - - - - - - - - - - - - - - - - - 


2022-04  
Contributor(s):  
Paul Falstad  
Mervill  
>get rid of old LM317 model (#749)reconvert TL431 model  
>change "High Voltage" to "High Logic Voltage" for clarity  
>fix mistakes in converting LM317 model (#749)  
>2.7.0  
>avoid exception when changing min/max for shared slider (#753)  
>initial perfmon + edits to updateCircuit  
>fix spurious "some nodes are unconnected" error in subcircuits (#751)  
>fix ~ in text elements; don't remove it when localizing unless it's last char (#742)  
>avoid having transistor get stuck in unrealistic state in attempt to improve convergence (#729, #712)  
>fix exception when dumping zombie scope elms (#748)  
>fix random exceptions (#761)  
>2.6.9  
>allow high logic voltage to be set on chips (#409)  
>switch to a higher precision timer, introduce dev mode option  
>optionally use pin numbers in 555 (#762)  
- - - - - - - - - - - - - - - - - - - - - - - - - - - 


2022-03  
Contributor(s):  
Paul Falstad  
>2.6.6  
>use standard transformer ratio (#739)  
>back out fix for #737, it breaks 555 square wave example (#743)  
>undocked scopes didn't work right away when created, and caused exceptions after being deleted  
>2.6.8  
>fix editing of polarized capacitor (#741)  
>fix division by zero when changing AC source's frequency to 0 (#744)  
>improve JS interface (#730)  
>back out fix for #737, it breaks 555 square wave example  
>2.6.7  
>reduce problem of roundoff error when connecting unconnected nodes (#737)  
>fix current animation for lamps broken by #680  
- - - - - - - - - - - - - - - - - - - - - - - - - - - 


2022-02  
Contributor(s):  
Paul Falstad  
>2.6.5  
>fix linecap when saving as image or SVG (#727)  
>improve resolution when exporting as image  
- - - - - - - - - - - - - - - - - - - - - - - - - - - 


2022-01  
Contributor(s):  
Paul Falstad  
azambon  
>latch needs to save small grid state (#703)  
>better handling of setting 0 resistance/capacitance (#705)  
>allow full state info to be shown in scope (#290)fix duty cycle checkbox in scope properties  
>fix exception when extended info is being shown in scope (#290)  
>Increase maximum resistor scroll value to 10MSometimes I find that only being able to set resistor values up to 1M by scrolling is a nuisance, in that one has to manually edit the value to input 2.2M, 4.7M or whatever.Maybe increaseing the maximum value that can be set by scrolling to 10M could make sense.  
>remove dead code and clarify some things  
>add IECGates URL option (#655)  
>show the cursor simultaneously on all scopes (#721)  
>background wasn't covering whole image in export as image/svg (#704)  
>smoother color gradient for voltages, and avoid having ground look slightly red  
>add IEC fuse symbol (#640)  
>fix broken LM317 (#699)  
>logic output pulldown flag was turning off other flags  
>2.6.3  
>2.6.4  
- - - - - - - - - - - - - - - - - - - - - - - - - - - 


2021-12  
Contributor(s):  
Paul Falstad  
>2.6.2  
>fix bad currents in wires connected to VCVS with no inputs  
>2.6.0  
>add internal pulldown resistor for tri-state buffers (#540)  
>improve error handling for infinity in circuit matrix (#687)  
>sliders linked to multiple elements (#504)  
>optional circle around transistors (#695)  
>add search box for components (#673, #358)  
>handle cut and paste from small grid to large grid circuit (#697)  
>adjustable logic levels for ternary logic (#433)  
>handle display of enormous numbers better (#692)  
>fix problem with exception handling causing circuit to not be displayed (#687)  
>2.6.1  
>add data input (#309)  
>add LM317, TL431 (#449, #434, #629, #662)  
>add controlled source abbreviations to make them easier to find in the search dialog  
- - - - - - - - - - - - - - - - - - - - - - - - - - - 


2021-11  
Contributor(s):  
Paul Falstad  
>2.5.9  
>improve handling of fast current display (#680)  
>creating sliders should have reasonable default min/max (#681, #312)  
>clear current dots on reset (#684)  
>optionally disable mouse wheel editing of values (#666)  
>fix reset for relays (#683)  
>2.5.8  
>fix current animation bug (#684)  
>fix save as dialog to automatically download on "OK" #676  
>fix menu localization issues (#659)  
- - - - - - - - - - - - - - - - - - - - - - - - - - - 


2021-09  
Contributor(s):  
Paul Falstad  
>2.5.6  
>2.5.7  
>adjustable # of displayed digits (#644)  
>calculate labeled node currents properly (#649)  
>don't optimize out Switch2Elms, it's buggy (#646)  
- - - - - - - - - - - - - - - - - - - - - - - - - - - 


2021-08  
Contributor(s):  
Paul Falstad  
pf  
BuildTools  
>allow vertical transformers (#635)  
>handle case where 555 trigger and reset pins are connected  
>2.5.5js  
>fix font issues again  
>optionally add inverted output, strobe pins to multiplexer  
>add line element  
>add invert inputs option for gates (for easier-to-read schematics)  
>save filename in "save as" dialog  
>show node label in scope text  
>when searching for current source path, handle case where an element has multiple connections to a node (#638)  
>add bubble to inverted output  
>fix spelling error (#641)  
>show speed relative to real time when appropriate  
- - - - - - - - - - - - - - - - - - - - - - - - - - - 


2021-07  
Contributor(s):  
pf  
>2.5.2  
>fix for colpitts oscillator broke howland current source.  fix both a different way  
>removed unused initializer (#625)  
>add to selection if shift key is down while selecting area  
>add option to invert reset on JK FF  
>use background to make clearer division between scope area and circuit areaif no scopes, show info in corner without blanking entire lower part of screen  
>monostable did not work after reset (#622)  
>reduce flicker on resize  
>fix current display for mbb switch and logic input  
>fix bug where colpitts oscillator wasn't running on startup  
>optimize runCircuit() a bit  
>capacitor charge was changing sometimes when restamping circuit (#631)  
>back out "highlight other instances of same labeled node" change, it's confusing  
>fix background for 2d scopes  
>7 seg decoder: add blank pin, add option to blank on 1111 (for 7447 compatibility)  
>fix problem with stop button being focused and capturing space bar shortcut  
>don't highlight center horiz line for manual scale (since the center may not be zero)fix problem with negative power being drawn off bottom of scope  
>avoid centering issue with small windows and no scope  
>fix mac menu shortcuts displayed on edit menu  
>2.5.3  
>fix issue with wrong font showing up sometimes  
>undo last change, draw power at bottom of scope  
>bugfix for labeled node optimization  
>2.5.0  
>monostable had both outputs low after being loaded  
>2.5.4  
>make info shorter  
>add counter with load, n-bit adder  
>handle exceptions when creating menu  
>don't show current on scopes by default if current display is turned off  
>fix for old subcircuits which have embedded ground elms  
>option to rotate chip (flip x/y) (#624)  
>fix more font issues  
>add mouseMode url item  
>add option to invert set/reset on D FF  
>fix paste of circuit components with far away coordinates  
>highlight other instances of same labeled node  
>optimize out labeled nodes, ground elements, and switchesfix current display for SP3T switches  
>small fix for paste  
>2.5.1  
>still 2.5.0  
>fix mouse capture issue with scrollbars  
>don't try to select elements if mouse is in scope area  
>fix triac current display  
>add keyboard shortcuts for save, etc.  
>fix relay bounding box  
>fix bug in current calculation for SPDT switchesstop using isWireEquivalent() to mean two different things  
>fix missing current on SCR  
>delay buffer  
>optionally trigger counter on negative edge  
>fix weird currents in wires attached to CC2  
>fix weird switch position for relays when first loaded  
>make more space for info  
>still 2.5.4  
>improve drawing of polarized capacitors  
>fix bug in flipping chips  
>show modulus when mousing over counter  
- - - - - - - - - - - - - - - - - - - - - - - - - - - 


2021-06  
Contributor(s):  
dogsong  
nulldg  
pf  
>fix centering of large circuits (or parts pasted from large circuits)  
>Make relay box scale more intelligently  
>fix reset for PISO shift reg  
>make current, selection colors configurable #614fix sliders to be highlighted when assoc element is selected  
>D flip flop had both outputs low when first created  
>fix bug and remove duplicated code  
>save transform with undo stack  
>Pull up duplicate code to ChipELM  
>Add "Invert reset pin" option to ring counterAt line 156 of RingCounterElm.java, there are two different proposed visuals styles. Feel free to choose whichever one you like more.  
>make sure ring counter always has one output high  
>make sure noDiagonal elms can't be made diagonal by dragging posts  
>fix handling of long labeled node names (#611)  
>Cleanup  
>capitalization  
>Shrink relay box  
>Add "# of Bits" edit info to ADC and DAC  
>remove duplicated code  
>adapt to higher display pixel density/zoom (#616)  
>Remove redundant setupPins  
>add missing abs() to relay current check  
>Fix one-shot breaking on reset  
>Fix clearing on model dialogThis commit fixes a bug in the composite model (ie subcircuit) editor dialog where the chip display is not cleared properly, resulting in buffer garbage.This bug occurs when the model is large and the camera is automatically zoomed out, and is caused by the rendering context having an undefined transform when clearing the background. Resetting the transform before clearing fixes this bug.  
>center circuit when pasting if circuit was empty  
>Use flags instead of a boolean  
>Add a box to the relay  
>make sure allocNodes() is always called with correct value in constructors (#610)or dump() of elms in subcircuits with simulation stopped could dump undefined voltages  
>reset button should reset sequence generator sequence  
>make it possible to move pins around in subcircuit creation even if there's no room  
>optionally save subcircuit models across sessions  
>Update RingCounterElm.java  
>Change the pin labels to be more accurateModelled after the 74HC164 and 74HC165 (with an additional output register)  
>speed up circuit validation  
>add ternary/conditional expressions, floor, ceil to controlled source expressions (#579)report parse errors in expressions  
>remove text center flag which doesn't work and doesn't really make sense anymore  
>fix current for logic inputs  
>postpone stampCircuit() if simulation is stopped, for better ui responsiveness  
>avoid re-analyze when switching logic inputs (faster for large circuits)  
>Remove "one-shot"  
>Reverse pin labels on PISO  
>Update RelayElm.java  
>flip subcircuits #612  
>Update SeqGenElm.java  
>handle case where window is moved between monitors with difference pixel ratios  
>wattmeter (#561)  
>Fix corruption when writing data to seqgen  
>Add "Play Once"  
>Scope SeqGen's output  
>Add a "Load Contents from File" button to SRAM  
>fix code that would avoid flagging a singular matrix  
>Remove unneeded import  
>avoid lag when speed is too high  
>Add option to hide outline (and make smaller)  
>2.4.8  
>give error if file is too large instead of silently failing  
>Add baud rate  
>Rewrite both shift registers  
>Fix one-shot triggering on import  
>move line over labeled nodes down slightly  
>remove bad comment  
>make small resistors look better  
>make relay look more like standard symbol (#618)fix current discontinuity in relayfix default relay switching time  
>shift-drag to move all nodes at point (#528)  
>Add SER, remove hidden register, simplify writeBits  
>allow subcircuit to be saved from "Edit Model" dialog  
>Add lineOver to ring counter's reset pinCircuitjs's ring counter has an active-low reset pin and is cleared with a low reset signal (this is distinct from the active-high reset pins of devices such as the CD4026BE). Unless I'm mistaken, I believe this should be marked with an overline.I spent a solid 10 minutes trying to figure out why the ring counter was not working - the lack of marking suggested the reset pin is active-high, not active-low.Related but not part of this commit: It would be nice to have an edit option to change whether or not the reset pin is active-high or active-low.  
>use more realistic relay model  
>Convert duplicate literals into a constantRemoved DRY violation for maintainability  
>Add lineOver to ring counter's reset pinThis commit removes the bubble, as suggested.  
>Variable-size sequences  
>speed up matrix simplification  
>option to re-load original subcircuit model if it's saved in storage (#577)  
>Store sequences as integers rather than bytes  
>Simplify  
>Cleanup SeqGenElm.java"One shot" is now stored as a flag, but the boolean still exists for backcomp. This also adds a reset pin.  
>Remove redundant code  
>2.4.9  
>don't center after duplicating component (#587)do center after undopushUndo() after creating new component  
>Fix output pin value not being imported  
>Disable the reset pin on SeqGen  
>allow tri-state to be flipped when created (#612)  
>fix bad bounding box for labeled nodes  
>Store register state in dump  
>add menu for subcircuits  
>More wheel reinvention  
>Use bitCount rather than data.length  
- - - - - - - - - - - - - - - - - - - - - - - - - - - 


2021-05  
Contributor(s):  
pf  
>fix a bunch of things that didn't work in white background mode (#604)  
>two fingers to drag all (#602)  
>export to svg (#591)  
>2.4.6  
>2.4.7  
>fix jump when dragging with two fingers  
>add Taiwan Chinese, thanks David Chen!  
>fix touch controls in subcircuit editor (#602)  
>allow filename to be specified when saving circuit  
>Merge https://github.com/sharpie7/circuitjs1  
>add icons for new menu items  
>fix electron version to take command line argument of file to open (#597)  
>don't use correct spelling of center in Canada  
>pinch to zoom (#602)  
- - - - - - - - - - - - - - - - - - - - - - - - - - - 


2021-04  
Contributor(s):  
Usevalad Khatkevich  
pf  
>handle text labels better if chip is flipped  
>setuplist.txt items become untranslatable if CRLFs used (#585) (thanks to golden)  
>2.4.5  
>improve error handling for sliders (#580)  
>complain when creating subcircuit with nodes unconnected (#581)  
>Merge pull request #5 from pfalstad/masterFor update locale_ru.txt  
>add Chinese to menu (thanks goldenshaw)move Czech aside for now so it is not used automatically  
>fix localization  
>take out double-buffering that we don't need  
>minor whitespace changes  
- - - - - - - - - - - - - - - - - - - - - - - - - - - 


2021-03  
Contributor(s):  
Paul Falstad  
pf  
>add link to internals doc  
>make chip pin labels larger (#573)use different font so we can tell I's from 1's  
>add link to jsinterface example  
>add more realistic LM324 model (#425)  
>fix exception when dealing with scopes with no plots (#569)  
>fix so you can drag terminals of single-terminal component.partially undo fix for #152.  
>2.4.4  
>2.4.3  
>fix op-amp to have correct output when average of +/- supply is not zero (#560)  
>add decimal display output  
>add Czech language. Thanks Linhart Jiří! #571  
- - - - - - - - - - - - - - - - - - - - - - - - - - - 


2021-02  
Contributor(s):  
pf  
>add lasta, timestep, lastoutput, dadt to controlled source expressions  
>improve info for CCCS, CCVS  
>make text fields longer  
>fix bug where shortcuts and checks were missing from right mouse menu  
>fix spice-compatible CCVS/CCCS to work correctly  
>unijunction first pass  
>add javascript interface  
>show transistor model in info  
>remove old stuff that no longer applies  
>mention javascript interface  
>2.4.2  
>add integrator and differentiator VCVS examplesdocument controlled source changesclear lastoutput, lasta, etc. on reset  
>fix bug where ctrl-v would paste in wrong place sometimes  
>set initial current of inductors (#520, #541)  
>add comment  
- - - - - - - - - - - - - - - - - - - - - - - - - - - 


2019-07  
Contributor(s):  
pf  
>filter by extension in open file dialog #355  
- - - - - - - - - - - - - - - - - - - - - - - - - - - 

