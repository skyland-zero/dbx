// The app shell: two screens, no router library. A connection list, and the
// workbench of the connection that was opened.
import { mount, signal, Text, View } from "nsh";
import { Connections } from "./routes/Connections";
import { Workbench } from "./routes/Workbench";

const openedId = signal<string | null>(null);
const openedTitle = signal("");

function App() {
  return (
    <View class="flex-1 bg-background text-foreground">
      <If
        when={openedId() !== null}
        else={
          <Connections
            onOpen={(id, title) => {
              openedTitle.set(title);
              openedId.set(id);
            }}
          />
        }
      >
        {(_open) => (
          <Workbench
            connectionId={openedId() ?? ""}
            title={openedTitle()}
            onBack={() => openedId.set(null)}
          />
        )}
      </If>
    </View>
  );
}

mount(App);
