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

import { CirSim } from "./CirSim";

export class ImportFromDropbox {
    static sim: CirSim;

    constructor(asim: CirSim) {
        ImportFromDropbox.sim = asim;
        this.doDropboxImport();
    }

    static isSupported(): boolean {
        try {
            // Bug in firefox prevents Dropbox dialog working properly in this application
            // even though Dropbox chooser supports firefox
            // See https://github.com/gwtproject/gwt/issues/7923
            if (/Firefox[\/\s](\d+\.\d+)/.test(navigator.userAgent))
                return false;
            return !!(window as any).Dropbox?.isBrowserSupported?.();
        }
        catch (err) {
            return false;
        }
    }

    static doLoadCallback(s: string): void {
        ImportFromDropbox.sim.undoManager?.pushUndo();
        ImportFromDropbox.sim.readCircuit(s);
        ImportFromDropbox.sim.unsavedChanges = false;
        ImportFromDropbox.sim.savedFlag = true;
    }

    doDropboxImport(): void {
        const options = {
            // Required. Called when a user selects an item in the Chooser.
            success: function(files: any[]) {
                try {
                    let xhr: XMLHttpRequest;
                    if (files[0].bytes < 100000) {
                        xhr = new XMLHttpRequest();
                        xhr.addEventListener("load", function reqListener() {
                            const text = xhr.responseText;
                            ImportFromDropbox.doLoadCallback(text);
                        });
                    }
                    xhr!.open("GET", files[0].link, false);
                    xhr!.send();
                }
                catch (err) {
                }
            },

            // Optional. Called when the user closes the dialog without selecting a file
            // and does not include any parameters.
            // cancel: function() {

            //},

            // Optional. "preview" (default) is a preview link to the document for sharing,
            // "direct" is an expiring link to download the contents of the file. For more
            // information about link types, see Link types below.
            linkType: "direct", // "preview" or "direct"

            // Optional. A value of false (default) limits selection to a single file, while
            // true enables multiple file selection.
            multiselect: false, // or true

            // Optional. This is a list of file extensions. If specified, the user will
            // only be able to select files with these extensions. You may also specify
            // file types, such as "video" or "images" in the list. For more information,
            // see File types below. By default, all extensions are allowed.
            // extensions: ['.pdf', '.doc', '.docx'],
        };
        (window as any).Dropbox.choose(options);
    }
}
