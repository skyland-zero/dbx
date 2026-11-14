// The desktop app's password prompt: shown when a saved connection has no
// stored password. It lives at the app root so its fields sit in the same
// surface as the rest of the UI.
import { Text, View } from "nsh";
import { Button } from "nsh/base";
import { Field } from "./Field";
import { Modal } from "./Modal";
import {
  closeTab,
  connectError,
  connectOpenTab,
  connectPassword,
  connectPasswordOpen,
  connectState,
  openTab,
} from "../state";

export function PasswordDialog() {
  return (
    <Modal
      open={connectPasswordOpen()}
      onClose={() => {
        connectPasswordOpen.set(false);
        closeTab();
      }}
      width={420}
      panelClass="p-5"
    >
      <Text class="text-base font-semibold">连接密码</Text>
      <Text class="mt-2 text-sm leading-6 text-muted-foreground">
        {openTab()?.title ?? ""} 没有可用的已保存密码，请输入本次会话使用的密码。
      </Text>
      <View class="mt-3">
        <Field
          value={connectPassword}
          onChange={(value) => connectPassword.set(value)}
          masked
          placeholder="密码"
          class="w-full"
        />
      </View>
      <If when={connectError() !== ""}>
        {(_error) => (
          <View class="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
            <Text class="text-xs leading-5 text-destructive">{connectError()}</Text>
          </View>
        )}
      </If>
      <View class="mt-4 flex-row justify-end gap-2">
        <Button
          onPress={() => {
            connectPasswordOpen.set(false);
            closeTab();
          }}
          class="h-8 rounded-md border border-border px-3 text-sm hover:bg-muted"
        >
          <Text>取消</Text>
        </Button>
        <Button
          onPress={() => void connectOpenTab(connectPassword())}
          disabled={connectState() === "connecting" || connectPassword() === ""}
          class="h-8 rounded-md bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          <Text>{connectState() === "connecting" ? "连接中…" : "连接"}</Text>
        </Button>
      </View>
    </Modal>
  );
}
