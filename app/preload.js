const { ipcRenderer } = require('electron');
const fs = require('fs');

var lastSavedFilePath = null;

window.showSaveDialog = function () { return ipcRenderer.invoke('show-save-dialog'); }

window.saveFile = function (file, text) {
  var path;
  if (!file)
    path = lastSavedFilePath;
  else {
    path = file.filePath.toString();
    lastSavedFilePath = path;
  }
  fs.writeFile(path, text, function (err) { if (err) window.alert(err); });
}

window.openFile = function (callback) {
  ipcRenderer.invoke('show-open-dialog').then(function(result) {
    if (!result || result.canceled || result.filePaths.length == 0) return;
    var fileName = result.filePaths[0];
    fs.readFile(fileName, 'utf-8', function (err, data) {
      if (err) { window.alert(err); return; }
      lastSavedFilePath = fileName;
      var shortName = fileName.substring(fileName.lastIndexOf('/')+1);
      shortName = shortName.substring(shortName.lastIndexOf("\\")+1);
      callback(data, shortName);
    });
  });
}

window.toggleDevTools = function () {
  ipcRenderer.send('toggle-dev-tools');
}

window.newWindow = function () {
  ipcRenderer.send('new-window');
}

// File to open is passed as ?openFile=... URL param by main.js
// (from open-file event on Mac, or argv[1] on Windows/Linux)
const urlParams = new URLSearchParams(window.location.search);
const fileToOpen = urlParams.get('openFile');
if (fileToOpen) {
  var arg1 = fileToOpen;
  var shortName = arg1.substring(arg1.lastIndexOf('/')+1);
  shortName = shortName.substring(shortName.lastIndexOf("\\")+1);
  window.startCircuitFileName = shortName;
  try {
    window.startCircuitText = fs.readFileSync(fileToOpen, 'utf-8');
    lastSavedFilePath = arg1;
  } catch(err) {
    window.alert(err);
  }
}
