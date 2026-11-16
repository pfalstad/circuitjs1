# CircuitJS1

<p align="center">
  <img src="war/icon128.png" alt="CircuitJS1 logo" width="128" height="128">
  <br>
  <em>Electronic Circuit Simulator in the Browser</em>
</p>

## Introduction

CircuitJS1 is an electronic circuit simulator that runs in the browser. It was originally written by Paul Falstad as a Java Applet. It was adapted by Iain Sharp to run in the browser using GWT.

For a hosted version of the application see:

* Paul's Page: [http://www.falstad.com/circuit/](http://www.falstad.com/circuit/)
* Iain's Page: [http://lushprojects.com/circuitjs/](http://lushprojects.com/circuitjs/)
* Development Branch Version: [https://pfalstad.github.io/circuitjs1/circuitjs.html](https://pfalstad.github.io/circuitjs1/circuitjs.html)

Thanks to: Edward Calver for 15 new components and other improvements; Rodrigo Hausen for file import/export and many other UI improvements; J. Mike Rollins for the Zener diode code; Julius Schmidt for the spark gap code and some examples; Dustin Soodak for help with the user interface improvements; Jacob Calvert for the T Flip Flop; Ben Hayden for scope spectrum; Thomas Reitinger, Krystian Sławiński, Usevalad Khatkevich, Lucio Sciamanna, Mauro Hemerly Gazzani, J. Miguel Silva, and Franck Viard for translations; Andre Adrian for improved emitter coupled oscillator; Felthry for many examples; Colin Howell for code improvements. LZString (c) 2013 pieroxy.

## Building the web application

The web application is written in TypeScript and built with [Vite](https://vitejs.dev/). You'll need [Node.js](https://nodejs.org/) (which includes npm) — no Java, GWT, or Eclipse required.

### Quick start

```bash
cd ts
npm install
npm run dev
```

This starts a local dev server with live reload at `http://localhost:5173/circuitjs.html` — edit any `.ts` file and your browser updates automatically.

### Building for production

```bash
cd ts
npm run build
```

This type-checks the project and produces a production build in `ts/dist/`. To preview the built output locally:

```bash
npm run preview
```

### Development using cloud containers

1. Install [Visual Studio Code](https://code.visualstudio.com/) and the appropriate remote extension: either [Gitpod Extension](https://marketplace.visualstudio.com/items?itemName=gitpod.gitpod-desktop) or [Codespaces Extension](https://marketplace.visualstudio.com/items?itemName=GitHub.codespaces).
2. Open your fork of the `circuitjs1` repository in your chosen provider's dev container.
3. This should open a new tab in your browser showing VS Code. Click in the green button in the bottom left corner, then select "Open in VS Code Desktop" in the popup menu that opened. Click "Allow" in all URL popups and authenticate using github if asked.

Once you have successfully connected your local VS Code to the remote workspace, you should be able to see the content of the remote container in your local VS Code. You can now continue with the setup:

4. Open a shell inside the dev container by pressing `Ctrl+Backtick` or pressing `F1` and typing "Create new Terminal".
5. Make sure you are in the folder `/workspaces/circuitjs1` inside the container (necessary only once per newly created container).
6. Run `cd ts && npm install`.
7. Run `npm run dev -- --host` to start the dev server bound to all interfaces (needed for port forwarding to reach it).
8. Make sure port 5173 is forwarded in the "Ports" tab (next to "Terminal"), then open it in your browser.
9. Edit any `.ts` file in VS Code and the browser updates automatically via Vite's live reload.

> ***Note:*** When running the web application server inside a remote dev container, port forwarding is necessary in order to access the remote server from your own computer. This port forwarding is provided by Visual Studio Code running on your local computer.

### Quick local test

The included `test.sh` script builds the app and starts a local server in one step:

```bash
./test.sh          # builds and serves on port 8000
./test.sh 9000     # use a custom port
```

This opens `http://localhost:8000/circuitjs.html` in your browser automatically (macOS). Requires Python 3 for the HTTP server.

## Deployment of the web application

Run `./dist.sh <version-number>` from the repository root, e.g. `./dist.sh 81`. This builds the TypeScript app and produces a self-contained, versioned deployment in `site/`:

```
site/
  circuitjs81.html   - full page version of the application
  iframe.html        - see notes below
  jsinterface.html    - JS interface example, see "Embedding" below
  service-worker.js   - offline caching for this version
  ++ circuitjs81 (directory)
   +- JS/CSS bundle files
   +- circuits (directory, containing example circuits)
   +- locale (directory, containing translations)
   +- font (directory, containing icon fonts)
   +- setuplist.txt (index in to example circuit directory)
```

Copy everything under `site/` to your web server. Running `./dist.sh` again with a different version number produces an independent deployment with its own file names and cache, so old versions keep working at their own `circuitjsNUM.html` URL alongside a newly deployed one.

* Customize the "iframe.html" file to include any branding you want in the right hand panel of the application.
* The optional file "shortrelay.php" (found in `war/`, not produced by the build) is a server-side script to act as a relay to a URL shortening service to avoid cross-origin problems with a purely client solution. Copy it alongside `circuitjsNUM.html` if you want the "Create short URL" feature; otherwise it's simply unused. You may want to customize it for your site.
* If you wish to enable dropbox loading and saving, a dropbox API app-key is needed. This should be added as a script tag in `ts/circuitjs.html` before building. If this is not included the relevant features will be disabled.

For a quick unversioned build (used for local testing and the Electron/offline app below), use `./dist-offline.sh` instead, which produces the same `site/` layout without the version-numbered rename — the entry point stays `site/circuitjs.html`.

## Docker/podman containers

### Building and Running Circuitjs in docker containers

*(replace the podman command with docker if you prefere docker)*

- To build Docker image using podman: 

```
podman build -f circuitjs1.Containerfile -t circuitjs1:latest
```

- To then run Docker image using podman:

```
podman run --name=circuitjs1 --rm -d -p 8000:8000 circuitjs1:latest
```

CircuitJS1 should be accessable at: http://localhost:8000/circuitjs.html


### Development using docker containers

(replace the podman command with docker if you prefere docker)

- To build the development Docker image using podman: 

```
podman build -f dev-start.Containerfile -t circuitjs1-dev:latest
```

- To then run the development Docker image using podman:

```
podman run --rm -it -p 127.0.0.1:5173:5173/tcp circuitjs1-dev:latest
```

CircuitJS1 should be accessable at: http://localhost:5173/circuitjs.html

If you need to modify the files while the container is running (using Vite's live reload):

```
podman run --rm -it -v $(pwd):/src:Z -p 127.0.0.1:5173:5173/tcp circuitjs1-dev:latest
```

This will use the current directory inside the container.


## Embedding

You can link to the full page version of the application using the link shown above.

If you want to embed the application in another page then use an iframe with the src being the full-page version.

You can add query parameters to link to change the applications startup behaviour. The following are supported:
```
.../circuitjs.html?cct=<string> // Load the circuit from the URL (like the # in the Java version)
.../circuitjs.html?ctz=<string> // Load the circuit from compressed data in the URL
.../circuitjs.html?startCircuit=<filename> // Loads the circuit named "filename" from the "Circuits" directory
.../circuitjs.html?startCircuitLink=<URL> // Loads the circuit from the specified URL. CURRENTLY THE URL MUST BE A DROPBOX SHARED FILE OR ANOTHER URL THAT SUPPORTS CORS ACCESS FROM THE CLIENT
.../circuitjs.html?euroResistors=true // Set to true to force "Euro" style resistors. If not specified the resistor style will be based on the user's browser's language preferences
.../circuitjs.html?IECGates=true // Set to true to force IEC logic gates. If not specified the gate style will be based on the user's browser's language preferences
.../circuitjs.html?usResistors=true // Set to true to force "US" style resistors. If not specified the resistor style will be based on the user's browser's language preferences
.../circuitjs.html?whiteBackground=<true|false>
.../circuitjs.html?conventionalCurrent=<true|false>
.../circuitjs.html?running=<true|false> // Start the app without the simulation running, default true
.../circuitjs.html?hideSidebar=<true|false> // Hide the sidebar, default false
.../circuitjs.html?hideMenu=<true|false> // Hide the menu, default false
.../circuitjs.html?editable=<true|false> // Allow circuit editing, default true
.../circuitjs.html?positiveColor=%2300ff00 // change positive voltage color (rrggbb)
.../circuitjs.html?negativeColor=%23ff0000 // change negative voltage color
.../circuitjs.html?selectColor=%2300ffff // change selection color
.../circuitjs.html?currentColor=%23ffff00 // change current color
.../circuitjs.html?mouseWheelEdit=<true|false> // allow changing of values by mouse wheel
.../circuitjs.html?mouseMode=<item> // set the initial mouse mode.  can also initially perform other UI actions, such as opening the 'about' menu, running 'importfromlocalfile', etc.
.../circuitjs.html?hideInfoBox=<true|false>
```
The simulator can also interface with your javascript code.  See [ts/jsinterface.html](http://www.falstad.com/circuit/jsinterface.html) for an example.

## Running the tests

There are three kinds of tests, all run from `ts/`:

```bash
cd ts
npm test              # unit tests (vitest)
npm run test:app      # regression tests of the simulator, in headless Chrome
npm run test:ui       # UI tests: drive the app with the mouse and keyboard (Playwright)
```

The browser tests use your installed Chrome if there is one, otherwise Playwright's
Chromium (`npx playwright install chromium` to get it).

### Unit tests

`npm test` runs the `*.test.ts` files with [vitest](https://vitest.dev/). Pass a file name
or part of one to run just those: `npm test -- Expr`.

### Regression tests

A regression test is a circuit file with the scope data it should produce saved in it.
Each test runs from reset (with any switch clicks replayed at the times they were
recorded) and passes if its scopes show the same thing again. The tests are in
[`auto-tests/`](auto-tests):

- `auto-tests/gen/tests.txt` lists the generated ones (several hundred, made from the
  example circuits in `ts/public/circuits/` and the test circuits in `tests/`); it's
  rewritten whenever tests are made
- `auto-tests/tests.txt` lists hand-made tests, and takes in all of `gen/tests.txt` with
  an `include gen/tests.txt` line, so it's every test

```bash
npm run test:app                                      # run all the tests (about 2 minutes)
npx tsx scripts/run-tests.ts --list=gen/tests.txt     # just the generated ones
npx tsx scripts/run-tests.ts gen/tests/fuse.txt       # run particular tests
npx tsx scripts/run-tests.ts --headed gen/tests/fuse.txt   # watch it run
```

Test file names are relative to `auto-tests/`. `--dist` tests the production build instead
of the dev server. Failed tests get a screenshot (the path is printed). The script exits
with status 1 if any test fails.

You can also run a test in the app itself: open
`http://localhost:5173/circuitjs.html?test=gen/tests/fuse.txt` (or
`?testlist=tests.txt` for all of them) with the dev server running.

### Making regression tests

Tests are made by recording what a circuit does now, so check that it's right first.
`scripts/create-tests.ts` runs each circuit from reset until its scopes are full, saves the
result in `auto-tests/gen/`, then runs the new test to make sure it passes:

```bash
npx tsx scripts/create-tests.ts ../tests/mycircuit.txt
```

A circuit needs scopes to get a test. Rather than adding them to the circuit itself, you
can describe them in `auto-tests/src/specs.txt`, one line per circuit: the scopes to add
(by element number), switches to click and when, and `probes=` to watch chip pins. The
comment at the top of `scripts/make-test-sources.ts` gives the format. Then make the copy
with the scopes added, and record its test:

```bash
npx tsx scripts/make-test-sources.ts --list ../tests/mycircuit.txt   # element numbers
npx tsx scripts/make-test-sources.ts tests/mycircuit.txt             # writes auto-tests/src/tests/mycircuit.txt
npx tsx scripts/create-tests.ts ../auto-tests/src/tests/mycircuit.txt
```

An existing test is never overwritten unless you pass `--force`, because it's what later
versions are compared against. Re-record a test only when you've checked that the new
behavior is correct. Circuits that can't be tested are listed in `auto-tests/gen/exclude.txt`
with the reason, and `auto-tests/gen/report.txt` says why any circuit got no test.

### UI tests

The UI tests (`ts/ui-tests/`) use [Playwright](https://playwright.dev/) to click through
the real app: building circuits from the toolbar, editing, menus, and drawing (compared
against screenshots).

```bash
npm run test:ui                         # all of them, headless
npm run test:ui -- --headed             # watch them run
npm run test:ui -- -g "undo"            # just the tests whose names match
npm run test:ui -- --update-snapshots   # accept new screenshots
```


## Building an Electron application

The [Electron](https://electronjs.org/) project allows web applications to be distributed as local executables for a variety of platforms. This repository contains the additional files needed to build circuitJS1 as an Electron application.

The general approach to building an Electron application for a particular platform is documented [here](https://electronjs.org/docs/tutorial/application-distribution). The following instructions apply this approach to circuit JS.

To build the Electron application:
* Build the application by running `./dist-offline.sh` from the repository root. This produces the compiled app in `site/`.
* Download and unpack a [pre-built Electron binary directory](https://github.com/electron/electron/releases) version 9.3.2 for the target platform.
* Copy the "app" directory from this repository to the location specified [here](https://electronjs.org/docs/tutorial/application-distribution) in the Electron binary directory structure.
* Copy the "site" directory produced above, containing the compiled CircuitJS1 application, in to the "app" directory of the Electron binary directory structure, renaming it to "war" (`app/main.js` loads `war/circuitjs.html`).
* Run the "Electron" executable file. It should automatically load CircuitJS1.

`test-app-mac.sh` automates all of the above for the macOS arm64 `.app` bundle under `offline/mac-arm-dmg/`.

Known limitations of the Electron application:
* "Create short URL" on "Export as URL" doesn't work as it relies on server support.

Thanks to @Immortalin for the initial work in applying Electron to CircuitJS1.

## License

This program is free software; you can redistribute it and/or
modify it under the terms of the GNU General Public License
as published by the Free Software Foundation; either version 2
of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program; if not, write to the Free Software
Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
