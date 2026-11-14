# DBX Native (NSH)

The desktop GUI built on [Native Shell](https://nsh.dev), beside the existing
Tauri + Vue app. The plan and its decisions are in
[`docs/nsh-gui-migration.md`](../../docs/nsh-gui-migration.md).

Current slice: **list the saved connections, open one, run SQL and read the
rows** — the first milestone of the plan. Everything else (object tree, table
structure, import/export, AI) is not here yet.

## How it works

```text
TSX (App.tsx, routes/)            chrome, forms, navigation
  └── dbx/native                  Rust components and modules
        ├── SqlWorkbench          editor + result grid (rows never enter JS)
        └── Dbx.listConnections() Promise<JSON>
              │
        service.rs                RouterMode::Local, called with `oneshot`
              │
        dbx-web (lib)             the same 767 routes the browser build uses
              │
        dbx-core                  storage, drivers, SQL Server over tiberius
```

- The router runs **inside this process**: `service.rs` builds it with
  `RouterMode::Local` (no login gate) and calls it with `tower::ServiceExt::oneshot`.
  No port is opened, no `dbx-web` binary ships with the app.
- The store is the desktop app's (`DBX_DATA_DIR`, else `com.dbx.app`), opened
  with `Storage::with_desktop_credential_recovery()`, so both GUIs read the
  same `dbx.db` and the OS keychain's saved passwords.
- Requests run on the DBX runtime; the UI thread only awaits the reply, so the
  engine never blocks on a query.

## Theme

`theme.json` is generated, never edited by hand:

```sh
pnpm generate:nsh-theme          # rewrite apps/nsh/theme.json
node scripts/gen-nsh-theme.mjs --check   # what `pnpm check` runs
```

It carries DBX's shadcn tokens (`background`, `primary`, `border`, `sidebar-*`
…) and the radius, converted from `rgb()` to hex.

## Run

```sh
cd apps/nsh
nsh run                 # development host
nsh run --target macos  # one platform
```

Requirements: the `nsh` CLI 0.5, Rust **1.97+** (1.99.1 verified — `nsh`
builds with the default toolchain, so `rustup default 1.99.1` or
`RUSTUP_TOOLCHAIN=1.99.1 nsh run`), and the
platform's toolchain (Xcode / WebView2 / GTK 4.14+ — see
[nsh's installation page](https://nsh.dev/docs/installation)).

### Windows

```powershell
pwsh ./run-windows.ps1
```

`nsh run` alone is not enough on Windows for now:

- `dbx-drivers` builds vendored OpenSSL for PostgreSQL, so a full Perl
  (`ExtUtils::MakeMaker`) and the MSVC developer environment are required.
  Git for Windows' Perl is too minimal; install Strawberry Perl, or point
  `NSH_PERL` at one.
- `ff` 0.14.0 (a dependency) ships a `rust-toolchain.toml` pinning Rust
  1.85.0; the script sets `RUSTUP_TOOLCHAIN=stable` so the graph uses 1.99.1.
- `libdbx_web.rlib` passes 4 GiB with full debug info and `rust-lld` cannot
  read the archive; the script sets `CARGO_PROFILE_DEV_DEBUG=line-tables-only`.
- `nsh` rewrites `.nsh/rust/Cargo.toml`, so `apps/nsh/.cargo/config.toml`
  repeats the driver patches, and the script seeds `.nsh/rust/Cargo.lock` from
  the app's lock. `vendor/russh` carries the 0.60.1 compatibility fix that
  nsh's stable QuickJS crypto graph forces.

The long form is in
[`docs/nsh-gui-migration.md`](../../docs/nsh-gui-migration.md).

Type-check the Rust side without a window:

```sh
cd apps/nsh
cargo check --workspace     # toolchain 1.99.1
cargo test -p dbx-native    # starts the loopback server against a temp store
```

## Known gaps in this slice

| Gap | Why | Next |
| --- | --- | --- |
| Only SQL Server has a form | this slice is SQL Server only | other drivers reuse `Dbx.save…` later |
| The password field is a fallback | saved passwords come from the keychain; typing one overrides it for the session | — |
| Tabs cannot be closed and do not drag | the strip is fixed tabs, per M4 | add close/reorder in a later slice |
| 1:1 with the Vue UI is underway | colours and radius come from `theme.json`, generated from the Vue app's `tokens.css`; fonts, icons and the screenshot baseline are still missing | §8 of the plan: bundle the fonts, reuse the SVG sources, add screenshot diff |

## Layout

```text
apps/nsh/
├── nsh.json              # mixed app: TSX entry, `native/` crate
├── App.tsx               # two screens, no router library
├── routes/
│   ├── Connections.tsx   # saved connections, refresh, open
│   └── Workbench.tsx     # back / title / password / connect, then the Rust workbench
└── native/
    ├── Cargo.toml        # own workspace member; root workspace excludes apps/nsh
    └── src/
        ├── lib.rs        # #[native_module("dbx/native")]
        ├── service.rs    # loopback dbx-web + Dbx module + request helpers
        └── workbench.rs  # SQL editor, run/cancel, result grid
```
