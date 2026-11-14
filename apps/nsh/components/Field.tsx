// A form field whose value is always visible. The Windows host draws an
// input's placeholder and caret but not its value text, so the native field
// is transparent and the value is drawn as a Text over it. Typing and
// selection stay native; `onChange` and `onKeyPress` keep the overlay live.
import { Text, token, View } from "nsh";
import { Input } from "nsh/base";

export function Field(props: {
  value: () => string;
  placeholder?: string;
  masked?: boolean;
  testID?: string;
  class?: string;
  style?: object;
  padRight?: number;
  keyboardType?: "number-pad";
  autoCapitalize?: "none";
  onChange: (value: string) => void;
  trailing?: any;
}) {

  let focused = false;
  return (
    <View class={`relative flex-row items-center ${props.class ?? ""}`} style={props.style}>
      <Input
        value={props.value()}
        onChange={({ value }) => {
          if (!focused) props.onChange(value);
        }}
        onFocus={() => {
          focused = true;
        }}
        onBlur={() => {
          focused = false;
        }}
        onKeyPress={({ key }) => {
          // The host reports key presses as they come and `onChange` after the
          // edit commits. While the field is focused the key mirror is the one
          // that follows typing; the committed value wins otherwise.
          if (key === "Backspace") props.onChange(props.value().slice(0, -1));
          else if (key.length === 1) props.onChange(props.value() + key);
        }}
        masked={props.masked}
        keyboardType={props.keyboardType}
        autoCapitalize={props.autoCapitalize}
        testID={props.testID}
        class="h-8 w-full rounded-md border border-input px-3 text-sm"
        style={{ color: "transparent", caretColor: token("foreground") as string }}
      />
      <View
        class="absolute flex-row items-center px-3"
        style={{
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          paddingRight: props.padRight ?? 12,
          pointerEvents: "none",
        }}
      >
        <Text
          class={`min-w-0 flex-1 truncate text-sm ${props.value() ? "text-foreground" : "text-muted-foreground"}`}
        >
          {props.masked ? "•".repeat(props.value().length) : props.value() || props.placeholder || ""}
        </Text>
      </View>
      {props.trailing ? (
        <View class="absolute right-1" style={{ pointerEvents: "auto" }}>
          {props.trailing}
        </View>
      ) : null}
    </View>
  );
}
