// A modal over the app's surface. It is not nsh/base's `Dialog`: on Windows
// that dialog (and any fixed/absolute layer) hosts inputs that draw their
// placeholders but not their text. This overlay is a sibling cell of a
// one-cell grid, in normal flow, so the connection form's fields render.
import { View } from "nsh";
import { Button } from "nsh/base";

export function Modal(props: {
  open: boolean;
  onClose?: () => void;
  testID?: string;
  width?: number;
  height?: number | `${number}%`;
  children?: any;
  panelClass?: string;
  panelStyle?: object;
}) {
  return (
    <If when={props.open} else={<View />}>
      {(_open) => (
        <View
          class="w-full items-center justify-center"
          style={{
            position: "relative",
            top: "-100%",
            height: "100%",
            flexShrink: 0,
            zIndex: 1,
            backgroundColor: "#00000066",
          }}
        >
          <View
            testID={props.testID}
            class={`flex-col rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl ${props.panelClass ?? ""}`}
            style={{
              width: props.width ?? 840,
              height: props.height,
              maxHeight: "92%",
              ...props.panelStyle,
            }}
          >
            {props.children}
          </View>
        </View>
      )}
    </If>
  );
}
