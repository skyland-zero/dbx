//! The `dbx-web` binary: argument handling and logging live in
//! [`dbx_web::run`], so an embedding app can start the same server from the
//! library instead of shipping a second executable.

fn main() -> std::process::ExitCode {
    dbx_web::run()
}
