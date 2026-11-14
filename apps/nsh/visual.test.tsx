// The visual pass's checks: the first screen and the connection form, with
// the same defaults the Vue dialog has. Run in a window with
// `nsh test visual.test.tsx --target windows`; the screenshots land in
// `.screenshots/` for the 1:1 comparison in docs/nsh-gui-migration.md §8.
import { expect, open, test } from "nsh/test";

test("the welcome page is the app's first screen", async () => {
  const app = await open(".");
  await app.waitFor("text:快速开始");
  await app.screenshot(".screenshots/welcome.png");
});

test("the connection dialog starts on the form with SQL Server defaults", async () => {
  const app = await open(".");
  await app.press("id:new-connection");
  await app.waitFor("id:connection-dialog");
  await app.waitFor("text:连接信息");

  // Controlled native inputs show their values, not just placeholders.
  expect(app.value("id:connection-host")).toBe("127.0.0.1");
  expect(app.value("id:connection-port")).toBe("1433");
  expect(app.value("id:connection-user")).toBe("sa");

  await app.screenshot(".screenshots/connection-dialog.png");

  await app.type("id:connection-name", "Local SQL Server");
  await app.keyboard.press("tab");
  await app.waitFor("text:Local SQL Server");
  await app.screenshot(".screenshots/connection-dialog-typed.png");
});

test("a saved connection opens the query tab and asks for its password", async () => {
  const app = await open(".");
  await app.press("id:new-connection");
  await app.waitFor("id:connection-dialog");
  await app.type("id:connection-name", "Visual Server");
  await app.press("id:connection-save");
  await app.waitFor("id:connection-list >> text:Visual Server >> nth=0");
  await app.press("id:connection-list >> text:Visual Server >> nth=0");
  await app.waitFor("text:连接密码", { timeout: 15000 });
  await app.screenshot(".screenshots/workbench-connect.png");
});

test("the workbench draws its tabs, editor and result grid", async () => {
  const app = await open(".");
  await app.press("id:new-connection");
  await app.waitFor("id:connection-dialog");
  await app.type("id:connection-name", "Demo Server");
  await app.press("id:connection-save");
  await app.waitFor("id:connection-list >> text:Demo Server >> nth=0");
  await app.press("id:connection-list >> text:Demo Server >> nth=0");
  await app.waitFor("text:查询 1");
  await app.waitFor("text:master");
  await app.screenshot(".screenshots/workbench.png");
});
