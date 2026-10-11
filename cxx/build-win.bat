@echo off
rem Windows build: MSVC + Ninja, Qt from %USERPROFILE%\Qt\6.8.3\msvc2022_64
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul || exit /b 1
set PATH=%APPDATA%\Python\Python310\Scripts;%PATH%
cd /d "%~dp0"
if not exist build-win\build.ninja cmake -S . -B build-win -G Ninja -DCMAKE_BUILD_TYPE=Release || exit /b 1
cmake --build build-win %*
