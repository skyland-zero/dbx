// ConnectionDialog.vue's SQL Server "连接信息" step: the same 4-column form,
// labels, footer and 840px dialog. The database picker is the one difference:
// this build only offers SQL Server, so it starts on the form.
import { Image, Text, token, View } from "nsh";
import { Button, Checkbox } from "nsh/base";
import sqlserverIcon from "../assets/sqlserver.svg";
import { Field } from "./Field";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import {
  connectionUrl,
  connections,
  dialogOpen,
  dialogTab,
  formColor,
  formDatabase,
  formError,
  formHost,
  formName,
  formNote,
  formParams,
  formPassword,
  formTimeout,
  formPort,
  formSavePassword,
  formUser,
  openConnection,
  resetForm,
  saveConnection,
  saving,
} from "../state";

const COLORS = ["#22c55e", "#eab308", "#f97316", "#ef4444", "#3b82f6", "#a855f7"];

const labelClass = "text-sm text-foreground";
const footerButton =
  "h-9 flex-row items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm hover:bg-muted active:bg-accent";

function Row(props: { label: string; children?: any }) {
  return (
    <View
      class="items-center gap-4"
      style={{ display: "grid", gridTemplateColumns: "140px minmax(0, 1fr)" }}
    >
      <Text class={labelClass}>{props.label}</Text>
      {props.children}
    </View>
  );
}

function close() {
  dialogOpen.set(false);
  resetForm();
}

export function ConnectionDialog() {
  // The body mounts only while open: a new dialog starts at the top of the
  // form with the current defaults, rather than keeping the last scroll and
  // the native inputs of the previous open.
  return (
    <If when={dialogOpen()} else={<View />}>
      {(_open) => <ConnectionDialogBody />}
    </If>
  );
}

function ConnectionDialogBody() {
  const saveAndConnect = async () => {
    const id = await saveConnection();
    if (!id) return;
    const connection = connections().find((candidate) => candidate.id === id);
    if (connection) openConnection(connection);
  };

  return (
    <Modal
      open={true}
      onClose={close}
      testID="connection-dialog"
      width={840}
      panelStyle={{ maxHeight: "92%" }}
    >
      <View class="h-12 shrink-0 flex-row items-center border-b border-border px-6">
        <Text class="text-base font-semibold">新建连接</Text>
        <View class="flex-1" />
        <Button
          onPress={close}
          class="h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          accessibilityLabel="关闭"
        >
          <Icon name="x" size={16} color={token("foreground")} />
        </Button>
      </View>

      <View class="shrink-0 flex-row items-center gap-1 px-6 pt-3">
        <Button
          onPress={() => dialogTab.set("connection")}
          class={
            dialogTab() === "connection"
              ? "h-7 flex-row items-center rounded-md bg-muted px-3 text-sm text-foreground"
              : "h-7 flex-row items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          }
        >
          <Text>连接信息</Text>
        </Button>
        <Button
          onPress={() => dialogTab.set("advanced")}
          class="h-8 flex-row items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        >
          <Text>高级</Text>
        </Button>
      </View>

      <View class="min-h-0 flex-1">
        <If
          when={dialogTab() === "connection"}
          else={
            <View class="px-6 py-3" style={{ gap: 10 }}>
              <Row label="SSL 加密">
                <View class="flex-row items-center gap-2">
                  <Checkbox
                    checked={false}
                    class="h-4 w-4 items-center justify-center rounded border border-input"
                    indicator={<View />}
                  />
                  <Text class="text-sm text-muted-foreground">SQL Server 连接默认使用 TLS。</Text>
                </View>
              </Row>
              <Row label="连接超时">
                <Field
                  value={formTimeout}
                  onChange={(value) => formTimeout.set(value)}
                  class="w-full"
                />
              </Row>
              <Text class="text-xs leading-5 text-muted-foreground">
                高级选项沿用 DBX 的 SQL Server 默认值；当前版本先还原连接信息页。
              </Text>
            </View>
          }
        >
          {(_connection) => (
            <View class="px-6 py-3" style={{ gap: 10 }}>
              <Row label="URL（可选）">
                <View class="flex-row items-center gap-1">
                  <Field
                    value={connectionUrl}
                    onChange={(value) => connectionUrl.set(value)}
                    placeholder="sqlserver://user:password@host:port/database"
                    class="flex-1"
                  />
                  <Button
                    class="h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted"
                    accessibilityLabel="解析连接 URL"
                  >
                    <Icon name="arrow-left-right" size={16} />
                  </Button>
                </View>
              </Row>

              <Row label="名称">
                <Field
                  value={formName}
                  testID="connection-name"
                  onChange={(value) => formName.set(value)}
                  placeholder="连接名称，留空则自动生成"
                  class="w-full"
                />
              </Row>

              <Row label="类型">
                <Button class="h-9 flex-row items-center gap-2 rounded-md border border-border bg-muted/20 px-3 hover:bg-muted/40">
                  <Image
                    src={sqlserverIcon}
                    style={{ width: 16, height: 16, objectFit: "contain", pointerEvents: "none" }}
                  />
                  <Text class="min-w-0 flex-1 truncate text-left text-sm">SQL Server</Text>
                  <Icon name="pencil" size={12} />
                </Button>
              </Row>

              <Row label="颜色">
                <View class="flex-row items-center gap-2.5">
                  {COLORS.map((color) => (
                    <Button
                      onPress={() => formColor.set(color)}
                      class="h-6 w-6 items-center justify-center rounded-full"
                      style={{
                        backgroundColor: color,
                        borderWidth: formColor() === color ? 2 : 0,
                        borderColor: token("background"),
                        outlineWidth: formColor() === color ? 1 : 0,
                        outlineColor: token("ring"),
                      }}
                      accessibilityLabel={`连接颜色 ${color}`}
                    />
                  ))}
                  <Button
                    onPress={() => formColor.set("")}
                    class="h-6 w-6 items-center justify-center rounded-full border border-border text-muted-foreground"
                    accessibilityLabel="不设置颜色"
                  >
                    <Icon name="x" size={11} />
                  </Button>
                </View>
              </Row>

              <Row label="主机">
                <View class="flex-row items-center gap-2">
                  <Field
                    value={formHost}
                    testID="connection-host"
                    onChange={(value) => formHost.set(value)}
                    placeholder="127.0.0.1"
                    class="flex-1"
                  />
                  <Field
                    value={formPort}
                    testID="connection-port"
                    onChange={(value) => formPort.set(value)}
                    placeholder="1433"
                    keyboardType="number-pad"
                    style={{ width: 120 }}
                  />
                </View>
              </Row>

              <Row label="用户名">
                <Field
                  value={formUser}
                  testID="connection-user"
                  onChange={(value) => formUser.set(value)}
                  autoCapitalize="none"
                  class="w-full"
                />
              </Row>

              <Row label="密码">
                <Field
                  value={formPassword}
                  testID="connection-password"
                  onChange={(value) => formPassword.set(value)}
                  masked
                  padRight={40}
                  class="w-full"
                  trailing={
                    <Button class="h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted">
                      <Icon name="eye" size={14} />
                    </Button>
                  }
                />
              </Row>

              <View
                class="items-center gap-4"
                style={{ display: "grid", gridTemplateColumns: "140px minmax(0, 1fr)" }}
              >
                <View />
                <Checkbox
                  checked={formSavePassword()}
                  onChange={({ checked }) => formSavePassword.set(checked)}
                  class="h-5 flex-row items-center gap-2"
                  indicatorClass="h-4 w-4 items-center justify-center rounded border border-input checked:border-primary checked:bg-primary"
                  indicator={
                    formSavePassword() ? (
                      <Icon name="check" size={12} color={token("primary-foreground")} />
                    ) : (
                      <View />
                    )
                  }
                >
                  <Text class="text-sm">保存密码</Text>
                  <Icon name="circle-x" size={13} />
                </Checkbox>
              </View>

              <Row label="数据库">
                <Field
                  value={formDatabase}
                  testID="connection-database"
                  onChange={(value) => formDatabase.set(value)}
                  placeholder="可选"
                  autoCapitalize="none"
                  class="w-full"
                />
              </Row>

              <Row label="URL 参数">
                <Field
                  value={formParams}
                  onChange={(value) => formParams.set(value)}
                  placeholder="encrypt=true&trustServerCertificate=true"
                  class="w-full"
                />
              </Row>

              <Row label="数据库信息">
                <View class="h-9 flex-row items-center gap-2 rounded-md border border-border bg-muted/20 px-3">
                  <Icon name="database" size={14} />
                  <View class="rounded bg-muted px-1.5 py-0.5">
                    <Text class="text-xs">当前配置</Text>
                  </View>
                  <Text class="text-sm">SQL Server</Text>
                </View>
              </Row>

              <Row label="备注">
                <View class="flex-row items-center gap-3">
                  <Field
                    value={formNote}
                    onChange={(value) => formNote.set(value)}
                    placeholder="请勿在备注中明文保存密码"
                    class="flex-1"
                  />
                  <Text class="shrink-0 text-xs text-muted-foreground">显示</Text>
                  <View class="h-4 w-7 rounded-full bg-muted" />
                </View>
              </Row>

            </View>
          )}
        </If>
      </View>

      <View class="h-14 shrink-0 flex-row items-center gap-2 border-t border-border px-6">
        <Button onPress={close} class={footerButton}>
          <Icon name="chevron-right" size={14} style={{ transform: "rotate(180deg)" }} />
          <Text>上一步</Text>
        </Button>
        {formError() ? <Text class="min-w-0 flex-1 truncate text-xs text-destructive">{formError()}</Text> : <View class="flex-1" />}
        <Button class={footerButton}>
          <Icon name="table-2" size={14} />
          <Text>选择显示数据库</Text>
        </Button>
        <Button class={footerButton}>
          <Icon name="fast-forward" size={14} />
          <Text>测试</Text>
        </Button>
        <Button
          testID="connection-save"
          onPress={() => void saveAndConnect()}
          disabled={saving() || !formHost().trim()}
          class="h-9 flex-row items-center gap-1.5 rounded-md bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          <Text>{saving() ? "保存中…" : "保存并连接"}</Text>
        </Button>
      </View>
    </Modal>
  );
}
