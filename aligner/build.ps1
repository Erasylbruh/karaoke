# Builds the aligner on Windows. Needs: Rust, VS Build Tools (C++), LLVM (for libclang).
$ErrorActionPreference = 'Stop'
$cmake = Get-ChildItem 'C:\Program Files*\Microsoft Visual Studio\*\*\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin' -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
if ($cmake) { $env:Path = "$($cmake.FullName);$env:Path" }
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
if (-not $env:LIBCLANG_PATH) { $env:LIBCLANG_PATH = 'C:\Program Files\LLVM\bin' }
# MSVC doesn't detect CPU features by itself; without these whisper.cpp runs several times slower.
$env:GGML_NATIVE = 'OFF'
$env:GGML_AVX = 'ON'
$env:GGML_AVX2 = 'ON'
$env:GGML_FMA = 'ON'
$env:GGML_F16C = 'ON'
# The cmake crate passes no optimisation flags to MSVC; without /O2 whisper.cpp is ~10x slower.
$env:CMAKE_C_FLAGS_RELEASE = '/O2 /Ob2 /DNDEBUG'
$env:CMAKE_CXX_FLAGS_RELEASE = '/O2 /Ob2 /DNDEBUG'
cargo build --release @args
