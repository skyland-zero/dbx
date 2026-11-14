// The app shell, laid out as the Vue app's classic layout: the 40px toolbar,
// the 260px connection sidebar, and the welcome page or a query tab beside it.
import { mount, View } from "nsh";
// Importing the font registers it before the first frame; the theme's
// `font-sans` names the family so both TSX and the Rust components use it.
import geist from "./assets/fonts/GeistVariable.woff2";
import { ConnectionDialog } from "./components/ConnectionDialog";
import { PasswordDialog } from "./components/PasswordDialog";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { Welcome } from "./components/Welcome";
import { Workbench } from "./routes/Workbench";
import {
  closeTab,
  connections,
  openConnection,
  openNewConnectionDialog,
  openTab,
  refreshConnections,
  selectedConnectionId,
} from "./state";

function newQuery() {
  const selected = connections().find((connection) => connection.id === selectedConnectionId());
  const connection = selected ?? connections()[0];
  if (!connection) {
    openNewConnectionDialog();
    return;
  }
  openConnection(connection);
}

function App() {
  void geist;
  return (
    <View
      class="flex-1 overflow-hidden bg-background text-foreground"
      style={{ display: "flex", flexDirection: "column" }}
    >
      <View class="flex-col min-h-0" style={{ height: "100%", flexShrink: 0 }}>
        <Toolbar onNewConnection={openNewConnectionDialog} onNewQuery={newQuery} />
        <View class="flex-1 flex-row min-h-0 min-w-0">
          <Sidebar
            onOpen={openConnection}
            onNewConnection={openNewConnectionDialog}
            onRefresh={() => void refreshConnections()}
          />
          <View class="flex-1 flex-col min-w-0 min-h-0">
            <If
              when={openTab() !== null}
              else={<Welcome onNewConnection={openNewConnectionDialog} onNewQuery={newQuery} onOpenConnection={openConnection} />}
            >
              {(_open) => (
                <Workbench
                  connectionId={openTab()?.connectionId ?? ""}
                  title={openTab()?.title ?? ""}
                  onClose={() => closeTab()}
                />
              )}
            </If>
          </View>
        </View>
      </View>
      <ConnectionDialog />
      <PasswordDialog />
    </View>
  );
}

mount(App);
