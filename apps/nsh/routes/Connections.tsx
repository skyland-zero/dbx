// The saved connections DBX already stores: the list the Tauri app writes to
// `dbx.db`. Selecting one opens its workbench.
import { List, signal, Text, View } from "nsh";
import { Button } from "nsh/base";
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

async function refresh() {
  try {
    const list = JSON.parse(await Dbx.listConnections()) as Connection[];
    connections.set(list);
    status.set(`${list.length} 个连接`);
  } catch (error) {
    status.set(`加载失败：${String(error)}`);
  }
}

// One load per app run; the list is small and the refresh button re-reads it.
void refresh();

export function Connections(props: { onOpen: (id: string, title: string) => void }) {
  return (
    <View class="flex-1 flex-col">
      <View class="flex-row items-center gap-3 px-4 py-3 border-b border-border">
        <Text class="text-lg font-semibold">DBX</Text>
        <Text class="text-sm text-muted-foreground">{status()}</Text>
        <View class="flex-1" />
        <Button
          onPress={() => void refresh()}
          class="rounded-(--radius) border border-border px-3 py-1 active:bg-muted"
        >
          <Text class="text-sm">刷新</Text>
        </Button>
      </View>
      <List each={connections()} keyExtractor={(connection) => connection.id} estimatedItemSize={56} class="flex-1">
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
    </View>
  );
}
