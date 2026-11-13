#!/usr/bin/env node
// Generates apps/nsh/theme.json from the design tokens the Vue app already
// draws with (apps/desktop/src/styles/tokens.css).
//
// The tokens are shadcn's `cssVars`, and so is an NSH theme, so the values
// travel unchanged — 1:1 fidelity is a range of numbers, not a color someone
// matched by eye. Run with `--check` to fail when the file is stale.
//
//   node scripts/gen-nsh-theme.mjs [--check]

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const tokensPath = join(root, "apps", "desktop", "src", "styles", "tokens.css");
const targetPath = join(root, "apps", "nsh", "theme.json");
const checkOnly = process.argv.includes("--check");

// The color tokens an NSH theme file understands (nsh-base's shadcn set).
const COLORS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
];

const source = readFileSync(tokensPath, "utf8");

/** The body of the first `selector { ... }` block, braces at column 0. */
function block(selector) {
  const start = source.indexOf(`\n${selector} {`);
  if (start < 0) return "";
  const open = source.indexOf("{", start) + 1;
  const close = source.indexOf("\n}", open);
  return close < 0 ? "" : source.slice(open, close);
}

/** `--name: value;` pairs, comments and nested blocks skipped. */
function declarations(text) {
  const found = new Map();
  for (const line of text.split("\n")) {
    const match = /^\s*--([\w-]+):\s*(.+?);\s*$/.exec(line);
    if (match) found.set(match[1], match[2].trim());
  }
  return found;
}

/** `var(--other)` resolved one step, as the tokens declare radii that way. */
function resolveVar(value, scope) {
  const match = /^var\(--([\w-]+)\)$/.exec(value);
  return match && scope.has(match[1]) ? scope.get(match[1]) : value;
}

/** CSS colors become hex: the format every renderer agrees on. */
function toHex(value) {
  const match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(value);
  if (!match) return value;
  const channel = (raw) => Math.round(Number(raw)).toString(16).padStart(2, "0");
  let hex = `#${channel(match[1])}${channel(match[2])}${channel(match[3])}`;
  if (match[4] !== undefined) {
    const alpha = match[4].endsWith("%") ? Number(match[4].slice(0, -1)) / 100 : Number(match[4]);
    if (alpha < 1) hex += Math.round(alpha * 255).toString(16).padStart(2, "0");
  }
  return hex;
}

function scheme(selector) {
  const scope = declarations(block(selector));
  const colors = {};
  for (const name of COLORS) {
    const value = scope.get(name);
    if (value === undefined) throw new Error(`tokens.css: ${selector} has no --${name}`);
    colors[name] = toHex(resolveVar(value, scope));
  }
  return colors;
}

const rootScope = declarations(block(":root"));
const darkScope = declarations(block(".dark"));
const radiusToken = resolveVar(rootScope.get("radius") ?? "", rootScope);
const radius = resolveVar(radiusToken, rootScope);

const theme = {
  name: "DBX",
  cssVars: {
    theme: { radius },
    light: scheme(":root"),
    dark: scheme(".dark"),
  },
};

const text = `${JSON.stringify(theme, null, 2)}\n`;

if (checkOnly) {
  const current = existsSync(targetPath) ? readFileSync(targetPath, "utf8") : "";
  if (current !== text) {
    console.error("apps/nsh/theme.json is stale: run `node scripts/gen-nsh-theme.mjs`.");
    process.exit(1);
  }
  console.log("apps/nsh/theme.json matches apps/desktop/src/styles/tokens.css");
} else {
  writeFileSync(targetPath, text);
  console.log(`wrote ${targetPath} (radius ${radius})`);
}
