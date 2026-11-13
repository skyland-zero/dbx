// The SQL workbench page: its chrome (back, connection, the session's
// password) is TSX; the editor and the result grid are the Rust component, so
// result rows never cross into JS.
import { signal, Text, View } from "nsh";
import { Button, Input } from "nsh/base";
import { Dbx, SqlWorkbench } from "dbx/native";

export function Workbench(props: { connectionId: string; title: string; onBack: () => void }) {
  const password = signal("");
  const connected = signal(false);
  const status = signal("连接后即可执行 SQL");

  const connect = async () => {
    status.set("连接中…");
    try {
      const message = await Dbx.connect(props.connectionId, password());
      status.set(message || "已连接");
      connected.set(true);
    } catch (error) {
      status.set(`连接失败：${String(error)}`);
    }
  };

  return (
    <View class="flex-1 flex-col">
      <View class="flex-row items-center gap-3 px-4 py-3 border-b border-border">
        <Button onPress={props.onBack} class="rounded-(--radius) border border-border px-3 py-1 active:bg-muted">
          <Text class="text-sm">返回</Text>
        </Button>
        <Text class="font-semibold">{props.title}</Text>
        <Text class="text-sm text-muted-foreground">{status()}</Text>
      </View>
      <If
        when={connected()}
        else={
          <View class="gap-3 p-6">
            <Text class="text-sm text-muted-foreground">留空使用已保存的密码；输入则只用于本次会话。</Text>
            <Input
              value={password()}
              onChange={({ value }) => password.set(value)}
              masked
              placeholder="密码（可选）"
              class="rounded-(--radius) border border-input px-3 py-2"
            />
            <Button
              onPress={() => void connect()}
              class="self-start rounded-(--radius) bg-primary px-4 py-2 active:bg-primary/90"
            >
              <Text class="text-primary-foreground">连接</Text>
            </Button>
          </View>
        }
      >
        {(_connected) => <SqlWorkbench connectionId={props.connectionId} />}
      </If>
    </View>
  );
}
