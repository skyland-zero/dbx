// AppSidebar.vue / ConnectionTree.vue: DBX's 260px connection list.
import { Image, List, signal, Text, token, View } from "nsh";
import { Button, Input } from "nsh/base";
import sqlserverIcon from "../assets/sqlserver.svg";
import { Icon } from "./Icon";
import { connections, connectionsError, connectionsLoading, selectedConnectionId } from "../state";
import type { Connection } from "../state";

const query = signal("");
const toolbarButton = "h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground";
const searchToolButton =
  "h-6 w-6 shrink-0 items-center justify-center rounded border border-border text-muted-foreground hover:bg-accent hover:text-foreground";

function visibleConnections(): Connection[] {
  const text = query().trim().toLowerCase();
  if (!text) return connections();
  return connections().filter((connection) =>
    `${connection.name} ${connection.host} ${connection.port} ${connection.database ?? ""}`.toLowerCase().includes(text),
  );
}

function subtitle(connection: Connection): string {
  return `${connection.host}:${connection.port}`;
}

export function Sidebar(props: {
  onOpen: (connection: Connection) => void;
  onNewConnection: () => void;
  onRefresh: () => void;
}) {
  const selected = () => connections().find((connection) => connection.id === selectedConnectionId());

  return (
    <View
      class="shrink-0 flex-col border-r border-border"
      style={{ width: 260, backgroundColor: token("sidebar") }}
    >
      <View
        class="h-10 shrink-0 flex-row items-center gap-px border-b border-border px-3"
        style={{ backgroundColor: token("dbx-sidebar-header") as string }}
      >
        <Text class="text-xs font-medium text-muted-foreground">连接</Text>
        <View class="flex-1" />
        <Button class={toolbarButton} accessibilityLabel="全部折叠">
          <Icon name="chevrons-down-up" size={12} />
        </Button>
        <Button class={toolbarButton} accessibilityLabel="新建分组">
          <Icon name="folder-plus" size={12} />
        </Button>
        <Button onPress={props.onRefresh} class={toolbarButton} accessibilityLabel="刷新">
          <Icon name="refresh-cw" size={12} />
        </Button>
        <Button class="h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground" accessibilityLabel="收起侧栏">
          <Icon name="chevrons-left" size={14} />
        </Button>
      </View>

      <View class="shrink-0 flex-row items-center gap-1 px-2 py-1">
        <View class="relative flex-1 flex-row items-center">
          <View class="absolute left-2" style={{ zIndex: 1 }}>
            <Icon name="search" size={12} />
          </View>
          <Input
            value={query()}
            onChange={({ value }) => query.set(value)}
            placeholder="搜索..."
            class="h-6 w-full rounded border border-border pl-7 pr-2 text-xs"
          />
        </View>
        <Button class={searchToolButton} accessibilityLabel="定位当前标签">
          <Icon name="pin" size={12} />
        </Button>
        <Button class={searchToolButton} accessibilityLabel="筛选连接">
          <Icon name="database" size={12} />
        </Button>
      </View>

      <View class="min-h-0 flex-1">
        <If
          when={visibleConnections().length > 0}
          else={
            <View class="flex-1 items-center justify-center px-4 py-8">
              <Text class="text-center text-xs text-muted-foreground">
                {connectionsLoading() ? "加载中…" : connectionsError() || "暂无连接"}
              </Text>
            </View>
          }
        >
          {(_has) => (
            <List
              each={visibleConnections()}
              keyExtractor={(connection) => connection.id}
              estimatedItemSize={28}
              testID="connection-list"
              class="flex-1"
            >
              {(connection) => {
                const item = connection();
                const active = selectedConnectionId() === item.id;
                return (
                  <Button
                    onPress={() => props.onOpen(item)}
                    class="h-7 w-full flex-row items-center gap-2 px-2"
                    style={{
                      backgroundColor: active ? token("sidebar-accent") : "transparent",
                    }}
                  >
                    <View class="h-3.5 w-3.5 shrink-0" />
                    <Image
                      src={sqlserverIcon}
                      style={{ width: 14, height: 14, objectFit: "contain", pointerEvents: "none" }}
                    />
                    <Text class="min-w-0 flex-1 truncate text-xs text-foreground">{item.name}</Text>
                  </Button>
                );
              }}
            </List>
          )}
        </If>
      </View>

      <If when={selected() !== undefined}>
        {(_selected) => (
          <View class="h-7 shrink-0 flex-row items-center gap-1.5 border-t border-border px-2.5">
            <Icon name="server" size={12} />
            <Text class="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {subtitle(selected() as Connection)}
            </Text>
          </View>
        )}
      </If>

    </View>
  );
}
