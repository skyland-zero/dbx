//! The desktop data channel: `dbx-web`'s router, built and called inside this
//! process.
//!
//! DBX's business logic and every request shape already live in `dbx-web`
//! (767 routes, mirrored by the Vue client's `http.ts`). Rather than write a
//! third connection adapter, the GUI builds that router with
//! [`RouterMode::Local`] — no login gate — and calls it with `oneshot`. The
//! app is the router's only client, and no port is opened.
//!
//! The store is the desktop app's (`DBX_DATA_DIR`, else `com.dbx.app`), opened
//! with the OS keychain, so both GUIs see the same connections and saved
//! passwords.
//!
//! `docs/nsh-gui-migration.md` §6 records the decision.

use std::sync::Arc;

use axum::body::Body;
use axum::http::{Method, Request};
use dbx_web::{build_local_state, build_router, RouterMode};
use nsh_core::prelude::*;
use tokio::runtime::Runtime;
use tower::ServiceExt;

/// What TSX calls: `import { Dbx } from "dbx/native"; Dbx.listConnections()`.
#[module]
pub struct Dbx;

#[module]
impl Dbx {
    /// Every saved connection, as DBX stores it (JSON, snake_case fields).
    ///
    /// Resolves with the array `/api/connection/list` answers with.
    pub async fn list_connections() -> Result<String, String> {
        list_connections_for_test().await
    }

    /// Saves a new SQL Server connection (name, host, port, user, password,
    /// database) and resolves with its id.
    pub async fn save_sql_server_connection(
        name: String,
        host: String,
        port: u16,
        username: String,
        password: String,
        database: String,
        color: String,
        note: String,
    ) -> Result<String, String> {
        save_sql_server_connection_inner(name, host, port, username, password, database, color, note).await
    }

    /// Connects to a saved connection, with the password typed in this
    /// session when the store has none (an empty `password` uses the saved
    /// one).
    pub async fn connect(connection_id: String, password: String) -> Result<String, String> {
        connect_inner(&connection_id, &password).await
    }

    /// Whether the visual pass runs with `DBX_NSH_DEMO` set: the workbench
    /// then opens without a server and shows its fixture rows.
    pub fn is_demo() -> bool {
        is_demo()
    }
}

/// The visual pass's fixture mode (`DBX_NSH_DEMO=1`), set only by the
/// screenshot tests.
pub fn is_demo() -> bool {
    std::env::var_os("DBX_NSH_DEMO").is_some_and(|value| !value.is_empty())
}

/// The raw `/api/connection/list` answer, also reachable from a test that has
/// no window (`native/tests/service_smoke.rs`).
#[doc(hidden)]
pub async fn list_connections_for_test() -> Result<String, String> {
    call(|service| async move { service.get("/api/connection/list").await }).await
}

/// One query's result, ready for the data grid.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct QueryView {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub affected_rows: u64,
    pub elapsed_ms: u128,
    pub truncated: bool,
    pub execution_id: String,
    pub message: Option<String>,
}

impl QueryView {
    fn parse(body: &str, execution_id: &str) -> Result<QueryView, String> {
        let value: serde_json::Value = serde_json::from_str(body).map_err(|error| format!("bad result: {error}"))?;
        let columns: Vec<String> = value["columns"]
            .as_array()
            .map(|columns| columns.iter().map(|column| column.as_str().unwrap_or_default().to_owned()).collect())
            .unwrap_or_default();
        let rows = value["rows"]
            .as_array()
            .map(|rows| {
                rows.iter()
                    .map(|row| {
                        let cells = row.as_array().cloned().unwrap_or_default();
                        (0..columns.len().max(cells.len())).map(|index| render_cell(cells.get(index))).collect()
                    })
                    .collect()
            })
            .unwrap_or_default();
        let message = value["messages"]
            .as_array()
            .and_then(|messages| messages.first())
            .and_then(|message| message["message"].as_str())
            .map(str::to_owned);
        Ok(QueryView {
            columns,
            rows,
            affected_rows: value["affected_rows"].as_u64().unwrap_or_default(),
            elapsed_ms: value["execution_time_ms"].as_u64().unwrap_or_default() as u128,
            truncated: value["truncated"].as_bool().unwrap_or_default(),
            execution_id: execution_id.to_owned(),
            message,
        })
    }
}

fn render_cell(cell: Option<&serde_json::Value>) -> String {
    match cell {
        None | Some(serde_json::Value::Null) => "NULL".to_owned(),
        Some(serde_json::Value::String(text)) => text.clone(),
        Some(value) => value.to_string(),
    }
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/// Connects to a saved connection, with the password typed in this session.
async fn connect_inner(connection_id: &str, password: &str) -> Result<String, String> {
    let connection_id = connection_id.to_owned();
    let password = password.to_owned();
    call(move |service| async move {
        let mut config = saved_config(&service, &connection_id).await?;
        if !password.is_empty() {
            config["password"] = serde_json::Value::String(password);
        }
        let body = serde_json::json!({ "config": config }).to_string();
        let answer = service.post("/api/connection/connect", &body).await?;
        Ok(json_string(&answer))
    })
    .await
}

/// Saves a new SQL Server connection into DBX's store (`dbx.db`), so the
/// Tauri app lists it too.
///
/// The password is encrypted by the store's key (the OS keychain on the
/// desktop). Resolves with the new connection's id.
pub async fn save_sql_server_connection_inner(
    name: String,
    host: String,
    port: u16,
    username: String,
    password: String,
    database: String,
    color: String,
    note: String,
) -> Result<String, String> {
    call(move |service| async move {
        let id = new_connection_id();
        let config = serde_json::json!({
            "id": id,
            "name": name,
            "db_type": "sqlserver",
            "host": host,
            "port": port,
            "username": username,
            "password": password,
            "database": database,
            "color": color,
            "note": note,
        });
        let body = serde_json::json!({ "configs": [config] }).to_string();
        service.post("/api/connection/save", &body).await?;
        Ok(id)
    })
    .await
}

/// Runs `sql` on a connected database and returns the rows it produced.
///
/// `execution_id` is made before the request starts, so Cancel has an id to
/// send while the statement is still running.
pub async fn execute(connection_id: &str, sql: &str, execution_id: String) -> Result<QueryView, String> {
    let connection_id = connection_id.to_owned();
    let sql = sql.to_owned();
    call(move |service| async move {
        let config = saved_config(&service, &connection_id).await?;
        let database = config["database"].as_str().unwrap_or_default().to_owned();
        let body = serde_json::json!({
            "connectionId": connection_id,
            "database": database,
            "sql": sql,
            "executionId": execution_id,
            "maxRows": 5000,
        })
        .to_string();
        let answer = service.post("/api/query/execute", &body).await?;
        QueryView::parse(&answer, &execution_id)
    })
    .await
}

/// Asks the server to cancel a running statement.
pub async fn cancel(execution_id: String) -> Result<(), String> {
    call(move |service| async move {
        let body = serde_json::json!({ "executionId": execution_id }).to_string();
        service.post("/api/query/cancel", &body).await.map(|_| ())
    })
    .await
}

async fn saved_config(service: &Service, connection_id: &str) -> Result<serde_json::Value, String> {
    let list: serde_json::Value = serde_json::from_str(&service.get("/api/connection/list").await?)
        .map_err(|error| format!("bad connection list: {error}"))?;
    list.as_array()
        .and_then(|list| list.iter().find(|config| config["id"].as_str() == Some(connection_id)))
        .cloned()
        .ok_or_else(|| format!("connection {connection_id} is not saved"))
}

#[allow(dead_code)]
fn json_string(body: &str) -> String {
    serde_json::from_str::<String>(body).unwrap_or_else(|_| body.trim_matches('"').to_owned())
}

fn new_connection_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or_default();
    format!("nsh-sqlserver-{}-{nanos}", std::process::id())
}

/// An id for a statement about to run, unique in this process run.
pub fn new_execution_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or_default();
    format!("nsh-{}-{nanos}", std::process::id())
}

// ---------------------------------------------------------------------------
// The in-process router
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct Service {
    router: axum::Router,
    runtime: Arc<Runtime>,
}

static SERVICE: tokio::sync::OnceCell<Service> = tokio::sync::OnceCell::const_new();

/// The one service of this process. `start` is awaited rather than blocked
/// on: a caller is already inside a runtime (the engine's, or a test's).
async fn service() -> Result<Service, String> {
    SERVICE.get_or_try_init(start).await.cloned()
}

async fn start() -> Result<Service, String> {
    let runtime = Arc::new(
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .map_err(|error| format!("cannot build the DBX runtime: {error}"))?,
    );
    // Building the state opens SQLite and registers dialects; run it as a
    // task of the DBX runtime instead of the caller's.
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let data_dir = data_dir();
    let worker = runtime.clone();
    worker.spawn(async move {
        let _ = sender.send(build_local_state(data_dir).await);
    });
    let state = receiver.await.map_err(|_| "the DBX runtime stopped".to_owned())??;
    let router = build_router(state, RouterMode::Local);
    Ok(Service { router, runtime })
}

/// The desktop app's data directory: `DBX_DATA_DIR`, else the platform's
/// application-data directory (the same one the Tauri shell resolves).
fn data_dir() -> std::path::PathBuf {
    if let Some(dir) = std::env::var_os("DBX_DATA_DIR").filter(|value| !value.is_empty()) {
        return std::path::PathBuf::from(dir);
    }
    let home = std::env::var_os("HOME").map(std::path::PathBuf::from).unwrap_or_default();
    if cfg!(target_os = "windows") {
        let app_data = std::env::var_os("APPDATA").map(std::path::PathBuf::from).unwrap_or_default();
        return app_data.join("com.dbx.app");
    }
    if cfg!(target_os = "macos") {
        return home.join("Library").join("Application Support").join("com.dbx.app");
    }
    std::env::var_os("XDG_DATA_HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| home.join(".local").join("share"))
        .join("com.dbx.app")
}

impl Service {
    async fn get(&self, path: &str) -> Result<String, String> {
        self.request(Method::GET, path, None).await
    }

    async fn post(&self, path: &str, body: &str) -> Result<String, String> {
        self.request(Method::POST, path, Some(body.to_owned())).await
    }

    async fn request(&self, method: Method, path: &str, body: Option<String>) -> Result<String, String> {
        let request = Request::builder()
            .method(method)
            .uri(path)
            .header("content-type", "application/json")
            .body(Body::from(body.unwrap_or_default()))
            .map_err(|error| error.to_string())?;
        let response = self.router.clone().oneshot(request).await.map_err(|error| error.to_string())?;
        let status = response.status();
        let bytes =
            axum::body::to_bytes(response.into_body(), 96 * 1024 * 1024).await.map_err(|error| error.to_string())?;
        let text = String::from_utf8_lossy(&bytes).into_owned();
        if status.is_success() {
            Ok(text)
        } else {
            Err(api_error(status.as_u16(), &text))
        }
    }
}

fn api_error(status: u16, body: &str) -> String {
    let detail = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|value| value["error"].as_str().map(str::to_owned))
        .unwrap_or_else(|| body.trim().to_owned());
    if detail.is_empty() {
        format!("HTTP {status}")
    } else {
        format!("{detail} (HTTP {status})")
    }
}

/// Runs one request on the DBX runtime and awaits it on the engine.
///
/// The engine thread drives the UI and must not block on a query; the work
/// runs as a task of the DBX runtime and the reply comes back over a channel
/// either executor can await.
async fn call<T, F, Fut>(work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(Service) -> Fut + Send + 'static,
    Fut: std::future::Future<Output = Result<T, String>> + Send + 'static,
{
    let service = service().await?;
    let runtime = service.runtime.clone();
    let (sender, receiver) = tokio::sync::oneshot::channel();
    runtime.spawn(async move {
        let _ = sender.send(work(service).await);
    });
    receiver.await.map_err(|_| "the DBX runtime stopped".to_owned())?
}
