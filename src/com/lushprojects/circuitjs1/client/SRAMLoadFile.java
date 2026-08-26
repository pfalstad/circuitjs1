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

package com.lushprojects.circuitjs1.client;

public class SRAMLoadFile extends EditDialogLoadFile {

	int dataBits;

	public SRAMLoadFile(int dataBits) {
		super();
		this.dataBits = dataBits;
	}

	public final native void handle()
	/*-{
		var oFiles = $doc.getElementById("EditDialogLoadFileElement").files,
		nFiles = oFiles.length;
		if (nFiles>=1) {
			if (oFiles[0].size >= 128000) {
				@com.lushprojects.circuitjs1.client.EditDialogLoadFile::doErrorCallback(Ljava/lang/String;)("Cannot load: That file is too large!");
				return;
			}

			// values wider than 8 bits are represented as 2 consecutive bytes, big-endian
			var bytesPerValue = (this.@com.lushprojects.circuitjs1.client.SRAMLoadFile::dataBits > 8) ? 2 : 1;
			var hexDigits = bytesPerValue * 2;

			var fileName = oFiles[0].name;
			var reader = new FileReader();
			reader.onload = function(e) {
				var arr = new Uint8Array(reader.result);
				var n = arr.length - (arr.length % bytesPerValue);
				var str = "0x0:";
				for (var i = 0; i < n; i += bytesPerValue) {
					var val = 0;
					for (var j = 0; j < bytesPerValue; j++)
						val = (val << 8) | arr[i+j];
					var hex = val.toString(16).toUpperCase();
					while (hex.length < hexDigits)
						hex = "0" + hex;
					str += " 0x" + hex;
				}
				@com.lushprojects.circuitjs1.client.SRAMLoadFile::doLoadCallback(Ljava/lang/String;Ljava/lang/String;)(str, fileName);
			};

			reader.readAsArrayBuffer(oFiles[0]);
		}
	}-*/;

	static public void doLoadCallback(String data, String fileName) {
		SRAMElm.contentsOverride = data;
		SRAMElm.fileNameOverride = fileName;
		CirSim.editDialog.resetDialog();
		SRAMElm.contentsOverride = null;
		SRAMElm.fileNameOverride = null;
	}
}
