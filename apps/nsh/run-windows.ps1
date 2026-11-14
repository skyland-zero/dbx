# Run the NSH GUI on Windows.
#
# `nsh` regenerates `.nsh/rust` and resolves its own lock, which picks versions
# the app's own workspace does not (russh/pkcs5 today). Seed the generated
# workspace with the app's lock before the first build; Cargo keeps those pins
# and only adds the generated host packages.
#
# `apps/nsh/.cargo/config.toml` carries the driver patches that the generated
# manifest would otherwise drop. `dbx-drivers` builds OpenSSL for PostgreSQL,
# so the MSVC environment and a full Perl (`ExtUtils::MakeMaker`) are required.
# Git for Windows' bundled Perl is too minimal; set NSH_PERL to a Strawberry
# Perl or install one in the default location. See `docs/nsh-gui-migration.md`.
$ErrorActionPreference = "Stop"

$app = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $app

# The MSVC toolchain, for openssl-src's Configure/nmake.
$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vswhere) {
    $vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    $launch = Join-Path $vs "Common7\Tools\Launch-VsDevShell.ps1"
    if (Test-Path $launch) {
        . $launch -Arch amd64 -HostArch amd64 -SkipAutomaticLocation | Out-Null
    }
}

# Perl, for openssl-src's Configure.
$perl = $env:NSH_PERL
if (-not $perl) {
    $perl = (Get-Command perl -ErrorAction SilentlyContinue)?.Source
}
if (-not $perl) {
    $perl = @(
        "C:\Strawberry\perl\bin\perl.exe",
        (Join-Path $env:LOCALAPPDATA "Programs\StrawberryPerl\perl\bin\perl.exe"),
        (Join-Path $env:LOCALAPPDATA "strawberry-perl\perl\bin\perl.exe"),
        (Get-ChildItem $env:LOCALAPPDATA -Directory -Filter "strawberry-perl-*" -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending | Select-Object -First 1 |
            ForEach-Object { Join-Path $_.FullName "perl\bin\perl.exe" })
    ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}
if (-not $perl -or -not (Test-Path $perl)) {
    throw "No Perl found. Install Strawberry Perl, or set NSH_PERL to its perl.exe."
}
& $perl -MExtUtils::MakeMaker -e 1
if ($LASTEXITCODE -ne 0) {
    throw "$perl cannot load ExtUtils::MakeMaker; Git for Windows' Perl is too minimal. Install Strawberry Perl, or set NSH_PERL."
}
$env:PATH = (Split-Path $perl) + ";" + $env:PATH

# nsh runs `cargo` from PATH unless CARGO names one. Use the toolchain's
# cargo, not a wrapper that shares dependency artifacts across projects:
# check/build stubs in one target directory made the `component` macro read a
# metadata-only `core`.
$toolchainCargo = (& rustup which cargo 2>$null)
if ($LASTEXITCODE -eq 0 -and $toolchainCargo) {
    $env:CARGO = $toolchainCargo.Trim()
}
# `ff` 0.14.0 ships a rust-toolchain.toml pinning 1.85.0, and rustup's rustc
# proxy honors it while cargo compiles that crate; the resulting artifacts are
# incompatible with the 1.99.1 build. A named toolchain overrides the file.
$env:RUSTUP_TOOLCHAIN = "stable"
# With full debug info `libdbx_web.rlib` grows past 4 GiB and rust-lld cannot
# read its archive string table. Line tables keep backtraces without the size.
$env:CARGO_PROFILE_DEV_DEBUG = "line-tables-only"

New-Item -ItemType Directory -Force .nsh/rust | Out-Null
if (Test-Path Cargo.lock) {
    Copy-Item Cargo.lock .nsh/rust/Cargo.lock -Force
}

nsh run --target windows @args
exit $LASTEXITCODE
