//! The desktop data channel: `dbx-web`'s router, run inside this process.
//!
//! DBX's business logic and every request shape already live in `dbx-web`
//! (767 routes, mirrored by the Vue client's `http.ts`). Rather than write a
//! third connection adapter, the GUI starts that server on a loopback port in
//! this process and talks to it with the same JSON the browser build sends.
//!
//! The port never leaves the process: it is chosen here, no password is
//! configured, and the only client is this app.
//!
//! `docs/nsh-gui-migration.md` §6 explains why; the follow-up is to replace
//! the loopback hop with an in-process `Router::oneshot` call.

use std::{
    net::TcpListener,
    path::PathBuf,
    sync::OnceLock,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use nsh_core::prelude::*;

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
}

/// The raw `/api/connection/list` answer, also reachable from a test that has
/// no window (`native/tests/service_smoke.rs`).
#[doc(hidden)]
pub async fn list_connections_for_test() -> Result<String, String> {
    call(|service| service.get("/api/connection/list")).await
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
            truncated: value["truncated"].as_bool().unwrap_or(false),
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
///
/// Called from TSX as `Dbx.connect(connectionId, password)`; the module macro
/// is the only caller, which the dead-code pass cannot see.
#[allow(dead_code)]
pub async fn connect(connection_id: &str, password: &str) -> Result<String, String> {
    let connection_id = connection_id.to_owned();
    let password = password.to_owned();
    call(move |service| {
        let mut config = saved_config(service, &connection_id)?;
        if !password.is_empty() {
            config["password"] = serde_json::Value::String(password);
        }
        let body = serde_json::json!({ "config": config }).to_string();
        let answer = service.post("/api/connection/connect", &body)?;
        Ok(json_string(&answer))
    })
    .await
}

/// Runs `sql` on a connected database and returns the rows it produced.
pub async fn execute(connection_id: &str, sql: &str) -> Result<QueryView, String> {
    let connection_id = connection_id.to_owned();
    let sql = sql.to_owned();
    call(move |service| {
        let config = saved_config(service, &connection_id)?;
        let database = config["database"].as_str().unwrap_or_default().to_owned();
        let execution_id = next_execution_id();
        let body = serde_json::json!({
            "connectionId": connection_id,
            "database": database,
            "sql": sql,
            "executionId": execution_id,
            "maxRows": 5000,
        })
        .to_string();
        let answer = service.post("/api/query/execute", &body)?;
        QueryView::parse(&answer, &execution_id)
    })
    .await
}

/// Asks the server to cancel a running statement.
pub async fn cancel(execution_id: String) -> Result<(), String> {
    call(move |service| {
        let body = serde_json::json!({ "executionId": execution_id }).to_string();
        service.post("/api/query/cancel", &body).map(|_| ())
    })
    .await
}

fn saved_config(service: &Service, connection_id: &str) -> Result<serde_json::Value, String> {
    let list: serde_json::Value = serde_json::from_str(&service.get("/api/connection/list")?)
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

fn next_execution_id() -> String {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|elapsed| elapsed.as_nanos()).unwrap_or_default();
    format!("nsh-{}-{nanos}", std::process::id())
}

// ---------------------------------------------------------------------------
// The loopback server
// ---------------------------------------------------------------------------

struct Service {
    base: String,
}

static SERVICE: OnceLock<Result<Service, String>> = OnceLock::new();

fn service() -> Result<&'static Service, String> {
    SERVICE.get_or_init(start).as_ref().map_err(|error| error.clone())
}

fn start() -> Result<Service, String> {
    let data_dir = data_dir();
    std::fs::create_dir_all(&data_dir).map_err(|error| format!("cannot create {}: {error}", data_dir.display()))?;
    let port = free_port()?;

    // Read by `dbx_web::serve` when the thread starts. The data directory is
    // the desktop app's, so both GUIs list the same connections (D3).
    std::env::set_var("DBX_DATA_DIR", &data_dir);
    std::env::set_var("DBX_PORT", port.to_string());
    // dbx-web binds 0.0.0.0 by default (containers); this server is this
    // process's only, has no password and must never leave the machine.
    std::env::set_var("DBX_BIND_ADDR", "127.0.0.1");
    std::env::set_var("DBX_DISABLE_PASSWORD", "1");

    std::thread::Builder::new()
        .name("dbx-web".to_owned())
        .spawn(move || {
            let runtime = match dbx_core::scheduled_backup::worker_runtime() {
                Ok(runtime) => runtime,
                Err(error) => {
                    eprintln!("[dbx] cannot build the web runtime: {error}");
                    return;
                }
            };
            if let Err(error) = runtime.block_on(dbx_web::serve()) {
                eprintln!("[dbx] dbx-web stopped: {error}");
            }
        })
        .map_err(|error| format!("cannot start dbx-web: {error}"))?;

    let service = Service { base: format!("http://127.0.0.1:{port}") };
    for _ in 0..600 {
        if service.get("/api/version").is_ok() {
            return Ok(service);
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    Err("dbx-web did not answer on its loopback port".to_owned())
}

fn free_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| format!("no free port: {error}"))?;
    listener.local_addr().map(|address| address.port()).map_err(|error| error.to_string())
}

/// The desktop app's data directory: `DBX_DATA_DIR`, else the platform's
/// application-data directory (the same one the Tauri shell resolves).
fn data_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("DBX_DATA_DIR").filter(|value| !value.is_empty()) {
        return PathBuf::from(dir);
    }
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
    if cfg!(target_os = "windows") {
        let app_data = std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_default();
        return app_data.join("com.dbx.app");
    }
    if cfg!(target_os = "macos") {
        return home.join("Library").join("Application Support").join("com.dbx.app");
    }
    std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".local").join("share"))
        .join("com.dbx.app")
}

impl Service {
    fn get(&self, path: &str) -> Result<String, String> {
        self.request(reqwest::Method::GET, path, None)
    }

    fn post(&self, path: &str, body: &str) -> Result<String, String> {
        self.request(reqwest::Method::POST, path, Some(body))
    }

    fn request(&self, method: reqwest::Method, path: &str, body: Option<&str>) -> Result<String, String> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(600))
            .build()
            .map_err(|error| error.to_string())?;
        let mut request = client.request(method, format!("{}{path}", self.base));
        if let Some(body) = body {
            request = request.header("content-type", "application/json").body(body.to_owned());
        }
        let response = request.send().map_err(|error| error.to_string())?;
        let status = response.status();
        let text = response.text().map_err(|error| error.to_string())?;
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

/// Runs a blocking request on a worker thread and awaits it on the engine.
///
/// The router is synchronous HTTP; the engine thread drives the UI and must
/// not wait on a socket, so every call hands the work off and returns a future.
async fn call<T, F>(work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&Service) -> Result<T, String> + Send + 'static,
{
    let (sender, receiver) = tokio::sync::oneshot::channel();
    std::thread::Builder::new()
        .name("dbx-call".to_owned())
        .spawn(move || {
            let result = match service() {
                Ok(service) => work(service),
                Err(error) => Err(error),
            };
            let _ = sender.send(result);
        })
        .map_err(|error| format!("cannot start a worker: {error}"))?;
    receiver.await.map_err(|_| "the DBX worker stopped".to_owned())?
}
