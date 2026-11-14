// The saved connections DBX already stores: the list the Tauri app writes to
// `dbx.db`, plus the form that adds a SQL Server one here.
import { List, signal, Text, View } from "nsh";
import { Button, Input } from "nsh/base";
import { Dbx } from "dbx/native";

interface Connection {
  id: string;
  name: string;
  db_type: string;
  host: string;
  port: number;
  database?: string | null;
}

const connections = signal<Connection[]>([]);
const status = signal("加载中…");

const formOpen = signal(false);
const saving = signal(false);
const formName = signal("");
const formHost = signal("");
const formPort = signal("1433");
const formUser = signal("sa");
const formPassword = signal("");
const formDatabase = signal("");

async function refresh() {
  try {
    const list = JSON.parse(await Dbx.listConnections()) as Connection[];
    connections.set(list);
    status.set(`${list.length} 个已保存的连接`);
  } catch (error) {
    status.set(`加载失败：${String(error)}`);
  }
}

async function save() {
  saving.set(true);
  try {
    await Dbx.saveSqlServerConnection(
      formName(),
      formHost(),
      Number(formPort()) || 1433,
      formUser(),
      formPassword(),
      formDatabase(),
    );
    status.set("已保存");
    formOpen.set(false);
    formName.set("");
    formHost.set("");
    formPassword.set("");
    formDatabase.set("");
    await refresh();
  } catch (error) {
    status.set(`保存失败：${String(error)}`);
  } finally {
    saving.set(false);
  }
}

// One load per app run; the refresh button re-reads it.
void refresh();

export function Connections(props: { onOpen: (id: string, title: string) => void }) {
  return (
    <View class="flex-1 flex-col">
      <View class="flex-row items-center gap-3 px-4 py-3 border-b border-border">
        <Text class="text-lg font-semibold">DBX</Text>
        <Text class="text-sm text-muted-foreground">{status()}</Text>
        <View class="flex-1" />
        <Button
          onPress={() => formOpen.update((open) => !open)}
          class="rounded-(--radius) border border-border px-3 py-1 active:bg-muted"
        >
          <Text class="text-sm">{formOpen() ? "取消" : "新建 SQL Server"}</Text>
        </Button>
        <Button
          onPress={() => void refresh()}
          class="rounded-(--radius) border border-border px-3 py-1 active:bg-muted"
        >
          <Text class="text-sm">刷新</Text>
        </Button>
      </View>

      <If
        when={formOpen()}
        else={
          <List
            each={connections()}
            keyExtractor={(connection) => connection.id}
            estimatedItemSize={56}
            class="flex-1"
          >
            {(connection) => (
              <Button
                onPress={() => props.onOpen(connection().id, connection().name)}
                class="w-full flex-col items-start gap-1 border-b border-border px-4 py-3 active:bg-muted"
              >
                <Text class="font-medium">{connection().name}</Text>
                <Text class="text-sm text-muted-foreground">
                  {connection().db_type} · {connection().host}:{connection().port}
                </Text>
              </Button>
            )}
          </List>
        }
      >
        {(_open) => (
          <View class="w-full max-w-[560px] gap-3 p-6">
            <Text class="text-sm text-muted-foreground">
              连接保存在 DBX 的 dbx.db 中，两个界面的列表是同一份。
            </Text>
            <Input
              value={formName()}
              onChange={({ value }) => formName.set(value)}
              placeholder="名称"
              class="rounded-(--radius) border border-input px-3 py-2"
            />
            <View class="flex-row gap-3">
              <Input
                value={formHost()}
                onChange={({ value }) => formHost.set(value)}
                placeholder="主机"
                class="flex-1 rounded-(--radius) border border-input px-3 py-2"
              />
              <Input
                value={formPort()}
                onChange={({ value }) => formPort.set(value)}
                placeholder="端口"
                keyboardType="number-pad"
                class="w-[96px] rounded-(--radius) border border-input px-3 py-2"
              />
            </View>
            <Input
              value={formUser()}
              onChange={({ value }) => formUser.set(value)}
              placeholder="用户名"
              autoCapitalize="none"
              class="rounded-(--radius) border border-input px-3 py-2"
            />
            <Input
              value={formPassword()}
              onChange={({ value }) => formPassword.set(value)}
              placeholder="密码"
              masked
              class="rounded-(--radius) border border-input px-3 py-2"
            />
            <Input
              value={formDatabase()}
              onChange={({ value }) => formDatabase.set(value)}
              placeholder="数据库（可留空）"
              autoCapitalize="none"
              class="rounded-(--radius) border border-input px-3 py-2"
            />
            <Button
              disabled={!formName() || !formHost() || saving()}
              onPress={() => void save()}
              class="self-start rounded-(--radius) bg-primary px-4 py-2 active:bg-primary/90 disabled:opacity-40"
            >
              <Text class="text-primary-foreground">{saving() ? "保存中…" : "保存"}</Text>
            </Button>
          </View>
        )}
      </If>
    </View>
  );
}
