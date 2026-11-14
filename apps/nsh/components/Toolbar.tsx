// AppToolbar.vue's Windows form: the flat, classic layout's 40px bar.
import { Text, token, View } from "nsh";
import { Button } from "nsh/base";
import { Icon } from "./Icon";
import { connections } from "../state";

const menuButton =
  "h-8 shrink-0 flex-row items-center gap-1 rounded-md px-2 text-xs font-medium text-foreground/80 hover:bg-muted hover:text-foreground active:bg-accent disabled:opacity-40";
const iconButton =
  "h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground active:bg-accent";

export function Toolbar(props: { onNewConnection: () => void; onNewQuery: () => void }) {
  return (
    <View
      class="h-10 shrink-0 flex-row items-center gap-1 border-b border-border px-2"
      style={{ backgroundColor: token("dbx-chrome") as string }}
    >
      <Button testID="new-connection" onPress={props.onNewConnection} class={menuButton}>
        <Icon name="database-zap" size={14} color={token("foreground")} />
        <Text>新建连接</Text>
      </Button>
      <Button
        onPress={props.onNewQuery}
        disabled={connections().length === 0}
        class={menuButton}
      >
        <Icon name="file-plus-2" size={14} color={token("foreground")} />
        <Text>新建查询</Text>
      </Button>
      <Button disabled class={menuButton}>
        <Icon name="arrow-left-right" size={14} />
        <Text>数据传输</Text>
      </Button>
      <Button disabled class={menuButton}>
        <Icon name="package" size={14} />
        <Text>驱动管理</Text>
      </Button>
      <Button disabled class={menuButton}>
        <Text>更多</Text>
        <Icon name="chevron-down" size={12} />
      </Button>

      <View class="flex-1" />

      <Button class={iconButton} accessibilityLabel="SQL 库">
        <Icon name="book-marked" size={15} />
      </Button>
      <Button class={iconButton} accessibilityLabel="SQL 文件">
        <Icon name="folder-tree" size={15} />
      </Button>
      <Button class={iconButton} accessibilityLabel="历史记录">
        <Icon name="history" size={15} />
      </Button>
      <Button class={iconButton} accessibilityLabel="AI">
        <Icon name="bot" size={15} />
      </Button>
      <Button class={iconButton} accessibilityLabel="主题">
        <Icon name="sun-moon" size={15} />
      </Button>
      <Button class={iconButton} accessibilityLabel="GitHub">
        <Icon name="github" size={15} />
      </Button>
      <Button class={iconButton} accessibilityLabel="设置">
        <Icon name="settings" size={15} />
      </Button>
    </View>
  );
}
