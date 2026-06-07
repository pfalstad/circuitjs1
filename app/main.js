const electron = require('electron')
// Module to control application life.
const app = electron.app
// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow
const Menu = electron.Menu
const ipcMain = electron.ipcMain
const dialog = electron.dialog

const path = require('path')
const url = require('url')


// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
var windows = [];

// Build a minimal application menu so that standard keyboard shortcuts
// (Cmd+C, Cmd+V, Cmd+X, Cmd+A) work in text fields on macOS.
// Setting the menu to false disables these shortcuts entirely.
var template = [
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' }
    ]
  }
];
if (process.platform === 'darwin') {
  template.unshift({
    label: app.getName(),
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
} else {
  Menu.setApplicationMenu(null);
}


var pendingOpenFile = null;
var argvConsumed = false;

// Find the file path in an argv array, skipping flags (args starting with '-')
function getFileFromArgv(argv) {
  for (var i = 1; i < argv.length; i++) {
    if (!argv[i].startsWith('-'))
      return argv[i];
  }
  return null;
}

// Parse --key=value or --key value flags from argv into an object
function getParamsFromArgv(argv) {
  var params = {};
  var allowed = ['startCircuit','startLabel','startCircuitLink','positiveColor','negativeColor',
                 'neutralColor','selectColor','currentColor','mouseMode','running'];
  for (var i = 1; i < argv.length; i++) {
    var arg = argv[i];
    if (!arg.startsWith('--')) continue;
    var eq = arg.indexOf('=');
    var key, val;
    if (eq >= 0) {
      key = arg.substring(2, eq);
      val = arg.substring(eq + 1);
    } else if (i + 1 < argv.length && !argv[i+1].startsWith('-')) {
      key = arg.substring(2);
      val = argv[++i];
    } else {
      key = arg.substring(2);
      val = 'true';
    }
    if (allowed.indexOf(key) >= 0)
      params[key] = val;
  }
  return params;
}

// Extra URL params parsed once from process.argv at startup
var extraParams = getParamsFromArgv(process.argv);

if (process.argv.indexOf('--help') >= 0) {
  console.log(
    'Usage: CircuitJS1 [options] [file.cir]\n' +
    '\n' +
    'Options:\n' +
    '  --help                   Show this help message\n' +
    '  --startCircuit=URL       Load circuit from URL\n' +
    '  --startLabel=LABEL       Label for the circuit\n' +
    '  --startCircuitLink=URL   Load circuit from Dropbox link\n' +
    '  --running=false          Start with simulation paused\n' +
    '  --mouseMode=MODE         Initial mouse mode\n' +
    '  --positiveColor=COLOR    Color for positive voltage\n' +
    '  --negativeColor=COLOR    Color for negative voltage\n' +
    '  --neutralColor=COLOR     Color for neutral/ground\n' +
    '  --selectColor=COLOR      Color for selected elements\n' +
    '  --currentColor=COLOR     Color for current flow\n'
  );
  process.exit(0);
}

// On Windows, if a second instance is launched (e.g. double-clicking another
// associated file), send its argv to this instance and quit immediately.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    if (process.platform !== 'darwin') {
      var f = getFileFromArgv(argv);
      if (f) {
        pendingOpenFile = f;
        createWindow();
      }
    }
  });
}

app.on('open-file', function(event, filePath) {
event.preventDefault();
  pendingOpenFile = filePath;
  if (app.isReady()) {
    createWindow();
  }
});

ipcMain.handle('show-save-dialog', async (event) => {
  return dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender));
});

ipcMain.handle('show-open-dialog', async (event) => {
  return dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { properties: ['openFile'] });
});

ipcMain.on('toggle-dev-tools', (event) => {
  BrowserWindow.fromWebContents(event.sender).toggleDevTools();
});

ipcMain.on('new-window', () => {
  createWindow();
});

function createWindow () {
  // On Mac, use open-file event path; on Windows/Linux use argv[1]
  var fileToOpen = pendingOpenFile;
  pendingOpenFile = null;
  if (!fileToOpen && !argvConsumed && process.platform !== 'darwin') {
    fileToOpen = getFileFromArgv(process.argv);
    argvConsumed = true;
  }
// Create the browser window.
  var mainWindow = new BrowserWindow({width: 800,
    height: 600,
    webPreferences: { nativeWindowOpen: true,
                      sandbox: false,
                      contextIsolation: false,
                      preload: path.join(__dirname, 'preload.js')
    }
  })
  windows.push(mainWindow);

  var loadUrl = url.format({
    pathname: path.join(__dirname, 'war/circuitjs.html'),
    protocol: 'file:',
    slashes: true
  });
  var queryParts = [];
  if (fileToOpen)
    queryParts.push('openFile=' + encodeURIComponent(fileToOpen));
  Object.keys(extraParams).forEach(function(k) {
    queryParts.push(encodeURIComponent(k) + '=' + encodeURIComponent(extraParams[k]));
  });
  if (queryParts.length > 0)
    loadUrl += '?' + queryParts.join('&');
  mainWindow.loadURL(loadUrl);

  // Open the DevTools.
  //mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    var i = windows.indexOf(mainWindow);
    if (i >= 0)
      windows.splice(i, 1);
  })

  mainWindow.webContents.setWindowOpenHandler(({ disposition }) => {
	// new windows are handled via IPC (window.newWindow); deny everything else
	return { action: 'deny' };
  });

}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (windows.length == 0) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
