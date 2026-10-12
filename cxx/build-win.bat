@echo off
rem Windows build: MSVC + Ninja, Qt from %USERPROFILE%\Qt\6.8.3\msvc2022_64
rem Builds on the local disk (set BUILD_DIR to change it): Windows warns before running
rem an exe from a network share, and Ninja is slow there.
setlocal
if not defined BUILD_DIR set "BUILD_DIR=%USERPROFILE%\build\circuitjs1"
rem vcvars64.bat runs vswhere.exe, which isn't on PATH by default
set "PATH=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer;%PATH%"
call "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul || exit /b 1
cd /d "%~dp0"
if not exist "%BUILD_DIR%\build.ninja" cmake -S . -B "%BUILD_DIR%" -G Ninja -DCMAKE_BUILD_TYPE=Release || exit /b 1
cmake --build "%BUILD_DIR%" %*
