@echo off
rem Builds the app and packages it as a zip for distribution:
rem   %BUILD_DIR%\CircuitJS1-win64-<date>-<commit>.zip
rem holding a CircuitJS1 folder with the exe, the Qt DLLs and plugins it needs, the
rem resources (example circuits, font, help pages) and the MSVC runtime DLLs, so it
rem runs after unzipping, with nothing to install.
setlocal
if not defined BUILD_DIR set "BUILD_DIR=%USERPROFILE%\build\circuitjs1"
if not defined QTDIR set "QTDIR=%USERPROFILE%\Qt\6.8.3\msvc2022_64"
rem vcvars64.bat runs vswhere.exe, which isn't on PATH by default
set "PATH=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer;%PATH%"
call "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul || exit /b 1
cd /d "%~dp0"

call "%~dp0build-win.bat" --target CircuitJS1 || exit /b 1

for /f %%i in ('git rev-parse --short HEAD') do set "COMMIT=%%i"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd"') do set "TODAY=%%i"
set "NAME=CircuitJS1-win64-%TODAY%-%COMMIT%"
set "STAGE=%BUILD_DIR%\dist\CircuitJS1"
set "ZIP=%BUILD_DIR%\%NAME%.zip"

rem stage into a clean folder, so nothing left over from the build (tools, libs, pdbs) goes in
if exist "%BUILD_DIR%\dist" rmdir /s /q "%BUILD_DIR%\dist"
mkdir "%STAGE%" || exit /b 1
copy /y "%BUILD_DIR%\CircuitJS1.exe" "%STAGE%\" >nul || exit /b 1
xcopy /e /i /q /y "%BUILD_DIR%\resources" "%STAGE%\resources" >nul || exit /b 1

rem Qt DLLs and plugins.  No DirectX shader compiler (the app draws with QPainter), no TUIO
rem touch plugin (which pulls in Qt6Network), and the compiler runtime is copied below
rem as DLLs instead of vc_redist.x64.exe
"%QTDIR%\bin\windeployqt.exe" --release --no-translations --no-system-d3d-compiler --no-system-dxc-compiler --no-opengl-sw --no-compiler-runtime --skip-plugin-types generic,networkinformation,tls "%STAGE%\CircuitJS1.exe" >nul || exit /b 1

rem MSVC runtime, deployed app-local (allowed by the Visual C++ redistribution terms)
copy /y "%VCToolsRedistDir%x64\Microsoft.VC143.CRT\*.dll" "%STAGE%\" >nul || exit /b 1

if exist "%ZIP%" del "%ZIP%"
powershell -NoProfile -Command "Compress-Archive -Path '%STAGE%' -DestinationPath '%ZIP%'" || exit /b 1
echo %ZIP%
