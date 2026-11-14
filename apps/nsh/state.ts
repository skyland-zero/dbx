// The app's shared state: the saved connections (the same `dbx.db` the Tauri
// app writes), and the tab the content pane shows. Module scope, as nsh
// components render once and bind to signals.
import { signal } from "nsh";
import { Dbx } from "dbx/native";

export interface Connection {
  id: string;
  name: string;
  db_type: string;
  host: string;
  port: number;
  database?: string | null;
  username?: string | null;
  color?: string | null;
  note?: string | null;
}

export interface OpenTab {
  connectionId: string;
  title: string;
}

export const connections = signal<Connection[]>([]);
export const connectionsLoading = signal(true);
export const connectionsError = signal("");

export const openTab = signal<OpenTab | null>(null);
export const selectedConnectionId = signal<string | null>(null);

export const connectState = signal<"idle" | "connecting" | "connected" | "error">("idle");
export const connectError = signal("");
export const connectPassword = signal("");
export const connectPasswordOpen = signal(false);

export const dialogOpen = signal(false);
export const saving = signal(false);
export const formError = signal("");

export const formName = signal("");
export const formHost = signal("127.0.0.1");
export const formPort = signal("1433");
export const formUser = signal("sa");
export const formPassword = signal("");
export const formDatabase = signal("");
export const formColor = signal("#22c55e");
export const formNote = signal("");
export const formSavePassword = signal(true);
export const dialogTab = signal<"connection" | "advanced">("connection");
export const connectionUrl = signal("");
export const formParams = signal("");
export const formTimeout = signal("15");

export async function refreshConnections() {
  connectionsLoading.set(true);
  try {
    const list = JSON.parse(await Dbx.listConnections()) as Connection[];
    connections.set(list);
    connectionsError.set("");
    if (selectedConnectionId() && !list.some((connection) => connection.id === selectedConnectionId())) {
      selectedConnectionId.set(null);
    }
  } catch (error) {
    connectionsError.set(String(error));
  } finally {
    connectionsLoading.set(false);
  }
}

export function openConnection(connection: Connection) {
  selectedConnectionId.set(connection.id);
  openTab.set({ connectionId: connection.id, title: connection.name });
  connectState.set("idle");
  connectError.set("");
  connectPassword.set("");
  connectPasswordOpen.set(false);
  void connectOpenTab("");
}

export function friendlyError(error: unknown): string {
  const raw = String(error);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1)) as { detail?: unknown; message?: unknown };
      const detail = typeof parsed.detail === "string" ? parsed.detail : parsed.message;
      if (typeof detail === "string") {
        const first = detail
          .split("\n")[0]
          .trim()
          .replace("SQL Server connection failed: ", "SQL Server 连接失败：");
        if (first) return first;
      }
    } catch {
      // Not JSON: show the text as it came.
    }
  }
  return raw.length > 240 ? `${raw.slice(0, 240)}…` : raw;
}

export async function connectOpenTab(password: string) {
  const tab = openTab();
  if (!tab) return;
  if (Dbx.isDemo()) {
    connectState.set("connected");
    connectPasswordOpen.set(false);
    return;
  }
  connectState.set("connecting");
  connectError.set("");
  try {
    await Dbx.connect(tab.connectionId, password);
    connectState.set("connected");
    connectPasswordOpen.set(false);
    connectPassword.set("");
  } catch (error) {
    connectError.set(friendlyError(error));
    connectState.set("error");
    connectPasswordOpen.set(true);
  }
}

export function closeTab() {
  openTab.set(null);
  connectState.set("idle");
  connectError.set("");
  connectPasswordOpen.set(false);
}

export function openNewConnectionDialog() {
  // The dialog's `onOpenChange` reports the initial closed state, which
  // resets the form; set the defaults again for the open that follows.
  resetForm();
  dialogOpen.set(true);
}

export function resetForm() {
  formName.set("");
  formHost.set("127.0.0.1");
  formPort.set("1433");
  formUser.set("sa");
  formPassword.set("");
  formDatabase.set("");
  formColor.set("#22c55e");
  formNote.set("");
  formSavePassword.set(true);
  dialogTab.set("connection");
  connectionUrl.set("");
  formParams.set("");
  formTimeout.set("15");
  formError.set("");
}

export async function saveConnection(): Promise<string | null> {
  if (!formHost().trim()) {
    formError.set("主机必填");
    return null;
  }
  saving.set(true);
  formError.set("");
  try {
    const name = formName().trim() || `${formHost().trim()}:${formPort() || 1433}`;
    const id = await Dbx.saveSqlServerConnection(
      name,
      formHost().trim(),
      Number(formPort()) || 1433,
      formUser().trim(),
      formSavePassword() ? formPassword() : "",
      formDatabase().trim(),
      formColor(),
      formNote().trim(),
    );
    dialogOpen.set(false);
    resetForm();
    await refreshConnections();
    return id;
  } catch (error) {
    formError.set(`保存失败：${friendlyError(error)}`);
    return null;
  } finally {
    saving.set(false);
  }
}

// One load per app run; the sidebar's refresh button re-reads it.
void refreshConnections();
