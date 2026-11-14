// Lucide's icons, as DBX's Vue app draws them: the same artwork, at the same
// sizes, tinted from the theme's tokens.
import { Image, token } from "nsh";
import alignLeft from "../assets/icons/align-left.svg";
import arrowDownUp from "../assets/icons/arrow-down-up.svg";
import arrowLeftRight from "../assets/icons/arrow-left-right.svg";
import bookMarked from "../assets/icons/book-marked.svg";
import bot from "../assets/icons/bot.svg";
import check from "../assets/icons/check.svg";
import chevronDown from "../assets/icons/chevron-down.svg";
import chevronRight from "../assets/icons/chevron-right.svg";
import chevronUp from "../assets/icons/chevron-up.svg";
import chevronsDownUp from "../assets/icons/chevrons-down-up.svg";
import chevronsLeft from "../assets/icons/chevrons-left.svg";
import circleX from "../assets/icons/circle-x.svg";
import code2 from "../assets/icons/code-2.svg";
import database from "../assets/icons/database.svg";
import databaseZap from "../assets/icons/database-zap.svg";
import download from "../assets/icons/download.svg";
import eye from "../assets/icons/eye.svg";
import fastForward from "../assets/icons/fast-forward.svg";
import filePlus2 from "../assets/icons/file-plus-2.svg";
import fileText from "../assets/icons/file-text.svg";
import folderPlus from "../assets/icons/folder-plus.svg";
import folderTree from "../assets/icons/folder-tree.svg";
import github from "../assets/icons/github.svg";
import history from "../assets/icons/history.svg";
import loader2 from "../assets/icons/loader-2.svg";
import moon from "../assets/icons/moon.svg";
import moreHorizontal from "../assets/icons/more-horizontal.svg";
import packageIcon from "../assets/icons/package.svg";
import panelLeft from "../assets/icons/panel-left.svg";
import pencil from "../assets/icons/pencil.svg";
import pin from "../assets/icons/pin.svg";
import play from "../assets/icons/play.svg";
import plus from "../assets/icons/plus.svg";
import refreshCw from "../assets/icons/refresh-cw.svg";
import search from "../assets/icons/search.svg";
import server from "../assets/icons/server.svg";
import settings from "../assets/icons/settings.svg";
import shieldCheck from "../assets/icons/shield-check.svg";
import sparkles from "../assets/icons/sparkles.svg";
import square from "../assets/icons/square.svg";
import sun from "../assets/icons/sun.svg";
import sunMoon from "../assets/icons/sun-moon.svg";
import table2 from "../assets/icons/table-2.svg";
import wrapText from "../assets/icons/wrap-text.svg";
import x from "../assets/icons/x.svg";

const ICONS = {
  "align-left": alignLeft,
  "arrow-down-up": arrowDownUp,
  "arrow-left-right": arrowLeftRight,
  "book-marked": bookMarked,
  bot,
  check,
  "chevron-down": chevronDown,
  "chevron-right": chevronRight,
  "chevron-up": chevronUp,
  "chevrons-down-up": chevronsDownUp,
  "chevrons-left": chevronsLeft,
  "circle-x": circleX,
  "code-2": code2,
  database,
  "database-zap": databaseZap,
  download,
  eye,
  "fast-forward": fastForward,
  "file-plus-2": filePlus2,
  "file-text": fileText,
  "folder-plus": folderPlus,
  "folder-tree": folderTree,
  github,
  history,
  "loader-2": loader2,
  moon,
  "more-horizontal": moreHorizontal,
  package: packageIcon,
  "panel-left": panelLeft,
  pencil,
  pin,
  play,
  plus,
  "refresh-cw": refreshCw,
  search,
  server,
  settings,
  "shield-check": shieldCheck,
  sparkles,
  square,
  sun,
  "sun-moon": sunMoon,
  "table-2": table2,
  "wrap-text": wrapText,
  x,
} as const;

export type IconName = keyof typeof ICONS;

// The stroke SVGs are drawn in their own black; `tintColor` recolors the
// alpha mask, which is exactly the Vue app's `text-*` color on a Lucide icon.
export function Icon(props: { name: IconName; size?: number; color?: string; class?: string; style?: object }) {
  return (
    <Image
      src={ICONS[props.name]}
      class={props.class}
      style={{
        width: props.size ?? 14,
        height: props.size ?? 14,
        tintColor: props.color ?? token("muted-foreground"),
        objectFit: "contain",
        pointerEvents: "none",
        ...props.style,
      }}
    />
  );
}
