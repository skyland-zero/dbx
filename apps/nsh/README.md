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
        service.rs                in-process dbx-web on 127.0.0.1:<random>
              │
        dbx-web (lib)             the same 767 routes the browser build uses
              │
        dbx-core                  storage, drivers, SQL Server over tiberius
```

- The server runs **inside this process**: `service.rs` picks a free port on
  loopback, sets `DBX_BIND_ADDR=127.0.0.1` and `DBX_DISABLE_PASSWORD=1`, and
  starts `dbx_web::serve()` on a background thread. No `dbx-web` binary ships
  with the app and nothing listens off the machine.
- The data directory is the desktop app's (`DBX_DATA_DIR`, else
  `com.dbx.app`), so both GUIs read the same `dbx.db`.
- `docs/nsh-gui-migration.md` §6.1: the loopback hop is temporary; the
  follow-up replaces it with an in-process `Router::oneshot` call, which needs
  the router factored out of `serve()`.

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

Type-check the Rust side without a window:

```sh
cd apps/nsh
cargo check --workspace     # toolchain 1.99.1
cargo test -p dbx-native    # starts the loopback server against a temp store
```

## Known gaps in this slice

| Gap | Why | Next |
| --- | --- | --- |
| A saved password cannot be read from the OS keychain | the in-process server opens the store with `SecretKeyPolicy::ManagedDataDir` (`dbx-web`'s web policy), not the desktop's keychain policy | type the password on the workbench page; then build the local router with `Storage::with_desktop_credential_recovery()` |
| Connections are created in the existing app | no connection form yet | §7 of the plan |
| One tab | multi-tab is M4 | `Tabs` in `SqlWorkbench` |
| Not 1:1 with the Vue UI yet | this slice proves the data path | §8 of the plan: `tokens.css` → `themes/*.json`, screenshot diff |

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
