// WelcomeScreen.vue's default `workspace` page, at the same sizes and
// spacing as the Vue app (max-w-5xl, three stats, a 1.2/0.8 split, history,
// MCP hint, footer).
import { Image, Scroll, Text, token, View } from "nsh";
import { Button } from "nsh/base";
import sqlserverIcon from "../assets/sqlserver.svg";
import { Icon } from "./Icon";
import { connections } from "../state";
import type { Connection } from "../state";

const shortcutRow =
  "h-8 w-full flex-row items-center gap-2 rounded-md px-3 text-sm text-foreground hover:bg-muted/50 active:bg-muted";

function distinctTypes(): number {
  const types = new Set(connections().map((connection) => connection.db_type));
  return types.size;
}

function recent(): Connection[] {
  return connections().slice(0, 3);
}

function Card(props: { children?: any; class?: string }) {
  return (
    <View class={`min-w-0 overflow-hidden rounded-lg border border-border ${props.class ?? ""}`}>
      {props.children}
    </View>
  );
}

function CardHeader(props: { title: string; icon?: "history" }) {
  return (
    <View class="flex-row items-center justify-between border-b border-border px-4 py-3">
      <View class="flex-row items-center gap-2">
        {props.icon ? <Icon name={props.icon} size={16} color={token("foreground")} /> : null}
        <Text class="text-sm font-medium">{props.title}</Text>
      </View>
    </View>
  );
}

function Stat(props: { icon: "database" | "shield-check" | "sparkles"; label: string; value: number }) {
  return (
    <View class="min-w-0 overflow-hidden rounded-lg border border-border bg-muted/20 px-4 py-3">
      <View class="flex-row items-center gap-2">
        <Icon name={props.icon} size={14} />
        <Text class="min-w-0 truncate text-xs text-muted-foreground">{props.label}</Text>
      </View>
      <Text class="mt-2 text-2xl font-semibold">{String(props.value)}</Text>
    </View>
  );
}

export function Welcome(props: {
  onNewConnection: () => void;
  onNewQuery: () => void;
  onOpenConnection: (connection: Connection) => void;
}) {
  return (
    <Scroll class="flex-1" contentClass="grow">
      <View class="w-full items-center">
        <View class="w-full flex-col gap-6 px-8 py-10" style={{ maxWidth: 1024 }}>
          <View class="gap-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            <Stat icon="database" label="连接" value={connections().length} />
            <Stat icon="shield-check" label="已连接" value={0} />
            <Stat icon="sparkles" label="数据库类型" value={distinctTypes()} />
          </View>

          <View class="gap-4" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.8fr)" }}>
            <Card>
              <CardHeader title="快速开始" />
              <View class="flex-col">
                <If
                  when={recent().length > 0}
                  else={
                    <View class="px-4 py-8">
                      <Text class="text-sm text-muted-foreground">暂无连接</Text>
                    </View>
                  }
                >
                  {(_has) => (
                    <View class="flex-col">
                      {recent().map((connection) => (
                        <Button
                          onPress={() => props.onOpenConnection(connection)}
                          class="w-full flex-row items-center gap-3 overflow-hidden border-b border-border px-4 py-3 hover:bg-muted/40"
                        >
                          <Image
                            src={sqlserverIcon}
                            style={{ width: 16, height: 16, objectFit: "contain", pointerEvents: "none" }}
                          />
                          <View
                            class="h-5 w-1 shrink-0 rounded-full"
                            style={{ backgroundColor: connection.color || "#9ca3af" }}
                          />
                          <View class="min-w-0 flex-1 flex-col">
                            <Text class="truncate text-sm font-medium">
                              {connection.name}
                            </Text>
                            <Text class="truncate text-xs text-muted-foreground">
                              {connection.host}:{connection.port}
                            </Text>
                          </View>
                          <Icon name="file-plus-2" size={16} />
                        </Button>
                      ))}
                    </View>
                  )}
                </If>
              </View>
            </Card>

            <Card>
              <CardHeader title="常用操作" />
              <View class="gap-1 p-2">
                <Button onPress={props.onNewConnection} class={shortcutRow}>
                  <Icon name="plus" size={16} color={token("foreground")} />
                  <Text class="min-w-0 flex-1 truncate text-left">新建连接</Text>
                </Button>
                <Button onPress={props.onNewQuery} class={shortcutRow}>
                  <Icon name="file-plus-2" size={16} color={token("foreground")} />
                  <Text class="min-w-0 flex-1 truncate text-left">新建查询</Text>
                </Button>
                <Button class={shortcutRow}>
                  <Icon name="history" size={16} color={token("foreground")} />
                  <Text class="min-w-0 flex-1 truncate text-left">历史记录</Text>
                </Button>
                <Button class={shortcutRow}>
                  <Icon name="download" size={16} color={token("foreground")} />
                  <Text class="min-w-0 flex-1 truncate text-left">导入</Text>
                </Button>
                <View class="mt-2 rounded-md bg-muted/30 px-3 py-2">
                  <Text class="text-xs leading-5 text-muted-foreground">
                    <Text class="text-muted-foreground">搜索 </Text>
                    也支持在侧栏展开连接，右键数据库对象查看表结构与数据。
                  </Text>
                </View>
              </View>
            </Card>
          </View>

          <Card>
            <CardHeader title="历史查询" icon="history" />
            <View class="px-4 py-8">
              <Text class="text-sm text-muted-foreground">暂无 SQL 记录</Text>
            </View>
          </Card>

          <View class="min-w-0 flex-row items-start gap-3 overflow-hidden rounded-lg border border-border bg-muted/10 px-5 py-4">
            <View class="mt-0.5">
              <Icon name="sparkles" size={16} />
            </View>
            <View class="min-w-0 flex-1 flex-col">
              <Text class="text-sm font-medium">AI 与 MCP 集成</Text>
              <Text class="mt-1 text-xs leading-5 text-muted-foreground">
                连接你的 AI 助手，或者通过 MCP 让 Claude Code、Cursor 等编程助手直接使用数据库连接。
              </Text>
              <View class="mt-2 flex-row items-center gap-2">
                <View class="rounded bg-muted px-2 py-0.5">
                  <Text class="text-xs">npx @dbx-app/mcp-server</Text>
                </View>
                <Button class="rounded px-1">
                  <Text class="text-xs text-primary">了解详情</Text>
                </Button>
              </View>
            </View>
          </View>

          <View class="mt-2 flex-row items-center justify-center gap-3">
            <Text class="text-xs text-muted-foreground/60">DBX v0.1.0</Text>
            <Text class="text-xs text-muted-foreground/60">·</Text>
            <Button class="px-1">
              <Text class="text-xs text-muted-foreground/60">GitHub</Text>
            </Button>
          </View>
        </View>
      </View>
    </Scroll>
  );
}
