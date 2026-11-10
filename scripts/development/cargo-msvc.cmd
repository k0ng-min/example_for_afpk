@echo off
REM Wrapper to run cargo when MSVC link.exe is not on PATH (Windows).
REM Usage: scripts\development\cargo-msvc.cmd build   (runs inside backend\)
setlocal
set "VCVARS="
for %%V in (18 2022 2019) do (
  if not defined VCVARS if exist "C:\Program Files\Microsoft Visual Studio\%%V\Community\VC\Auxiliary\Build\vcvars64.bat" set "VCVARS=C:\Program Files\Microsoft Visual Studio\%%V\Community\VC\Auxiliary\Build\vcvars64.bat"
  if not defined VCVARS if exist "C:\Program Files (x86)\Microsoft Visual Studio\%%V\BuildTools\VC\Auxiliary\Build\vcvars64.bat" set "VCVARS=C:\Program Files (x86)\Microsoft Visual Studio\%%V\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
)
where link.exe >nul 2>nul
if errorlevel 1 (
  if defined VCVARS (
    call "%VCVARS%" >nul
  ) else (
    echo [cargo-msvc] vcvars64.bat not found. Install Visual Studio C++ Build Tools.
    exit /b 1
  )
)
cd /d "%~dp0..\..\backend"
cargo %*
