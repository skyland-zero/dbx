// A query tab's page. The connection (and the password prompt) is the app's
// state, in `state.ts`; the Rust workbench below owns the tabs, editor and
// result grid, so rows never cross into JS.
import { Text, token, View } from "nsh";
import { Button } from "nsh/base";
import { SqlWorkbench } from "dbx/native";
import { Icon } from "../components/Icon";
import { connectState } from "../state";

export function Workbench(props: { connectionId: string; title: string; onClose: () => void }) {
  return (
    <View class="flex-1 flex-col min-h-0 bg-background">
      <If
        when={connectState() === "connected"}
        else={
          <View class="flex-1 flex-col min-h-0">
            <View
              class="h-9 shrink-0 flex-row items-stretch border-b border-border"
              style={{ backgroundColor: token("dbx-chrome") as string }}
            >
              <View class="h-full flex-row items-center gap-1 border-r border-border bg-background px-2">
                <Icon name="database" size={14} />
                <Text class="truncate text-xs font-medium">{props.title}</Text>
                <Button
                  onPress={props.onClose}
                  class="h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
                >
                  <Icon name="x" size={12} />
                </Button>
              </View>
              <View class="flex-1" />
            </View>
            <View class="flex-1 items-center justify-center gap-3">
              <Icon
                name={connectState() === "connecting" ? "loader-2" : "circle-x"}
                size={22}
                color={token(connectState() === "connecting" ? "primary" : "muted-foreground") as string}
              />
              <Text class="text-sm text-muted-foreground">
                {connectState() === "connecting" ? `正在连接 ${props.title}…` : "连接失败，请重试"}
              </Text>
            </View>
          </View>
        }
      >
        {(_connected) => <SqlWorkbench connectionId={props.connectionId} />}
      </If>
    </View>
  );
}
