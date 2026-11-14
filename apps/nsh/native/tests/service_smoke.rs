//! The loopback data channel without a window: the server starts, the
//! desktop store opens and the same JSON the Vue client reads comes back.
//!
//! The GUI itself needs a display and the platform toolkits; this test covers
//! everything under it, so a broken route or a refused connection shows up in
//! `cargo test` even on a headless machine.

#[test]
fn starts_db_web_and_lists_the_saved_connections() {
    let data_dir = std::env::temp_dir().join(format!("dbx-nsh-smoke-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&data_dir);
    std::fs::create_dir_all(&data_dir).expect("create the temporary data directory");
    // `service::data_dir` prefers the variable, so the test never touches the
    // user's real `dbx.db`.
    std::env::set_var("DBX_DATA_DIR", &data_dir);

    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("build a runtime for the async client");

    let listing = runtime.block_on(dbx_native::service::list_connections_for_test()).expect("list connections");
    let parsed: serde_json::Value = serde_json::from_str(&listing).expect("the server answers with JSON");
    assert!(parsed.is_array(), "a fresh store lists no connections: {listing}");

    // A connection made in this GUI lands in the same store the list reads.
    let id = runtime
        .block_on(dbx_native::service::save_sql_server_connection_inner(
            "smoke".to_owned(),
            "127.0.0.1".to_owned(),
            59999,
            "sa".to_owned(),
            "secret".to_owned(),
            "master".to_owned(),
        ))
        .expect("save a SQL Server connection");
    let listing = runtime.block_on(dbx_native::service::list_connections_for_test()).expect("list connections");
    let parsed: serde_json::Value = serde_json::from_str(&listing).expect("the server answers with JSON");
    assert!(
        parsed.as_array().is_some_and(|list| list.iter().any(|config| config["id"] == id.as_str())),
        "the saved connection is listed: {listing}"
    );

    // The query route is reached through the same router: an unsaved id is
    // refused before any database is dialled.
    let error = runtime
        .block_on(dbx_native::service::execute("missing", "SELECT 1"))
        .expect_err("an unsaved connection cannot run a statement");
    assert!(error.contains("not saved"), "unexpected error: {error}");

    let _ = std::fs::remove_dir_all(&data_dir);
}
