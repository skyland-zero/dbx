//! DBX's NSH app: the UI set a TSX entry imports, and the Rust workbench.
//!
//! The migration plan lives in `docs/nsh-gui-migration.md`. This crate is the
//! `apps/nsh` workspace's only member; the root workspace excludes it so the
//! repository's `cargo --workspace` lanes never build GTK 4 or QuickJS.

pub mod service;
mod workbench;

use nsh_core::prelude::*;

/// The app's UI set: what `App.tsx` imports from `dbx/native`.
#[native_module("dbx/native")]
fn native(registry: &mut Registry) {
    registry.register::<workbench::SqlWorkbench>().module::<service::Dbx>();
}
