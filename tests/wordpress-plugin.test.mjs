import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const plugin = path.join(root, "wordpress-plugin", "keeperlab");
const read = file => readFile(path.join(plugin, file), "utf8");

test("plugin registra route e flush soltanto nel lifecycle", async () => {
  const main = await read("keeperlab.php");
  const routing = await read("includes/routing.php");
  assert.match(main, /register_activation_hook/);
  assert.match(main, /register_deactivation_hook/);
  assert.match(main, /flush_rewrite_rules/);
  assert.match(routing, /add_rewrite_rule/);
  assert.doesNotMatch(routing, /flush_rewrite_rules/);
});

test("template standalone non carica tema admin bar o iframe", async () => {
  const template = await read("templates/keeperlab-app.php");
  assert.match(template, /id="keeperlab-root"/);
  assert.match(template, /window\.KEEPERLAB_CONFIG/);
  assert.doesNotMatch(template, /wp_head|wp_footer|get_header|get_footer|iframe/i);
});

test("settings protegge capability nonce sanitizzazione e chiavi segrete", async () => {
  const settings = await read("includes/settings.php");
  const security = await read("includes/security.php");
  assert.match(settings, /manage_options/);
  assert.match(settings, /settings_fields/);
  assert.match(security, /sanitize_title/);
  assert.match(security, /esc_url_raw/);
  assert.match(security, /sb_secret_/);
  assert.match(security, /service_role/);
});

test("build WordPress usa il source master e runtime Supabase pubblico", async () => {
  const entry = await readFile(path.join(root, "wordpress-src", "main.tsx"), "utf8");
  const supabase = await readFile(path.join(root, "lib", "supabase.ts"), "utf8");
  const app = await readFile(path.join(root, "app", "keeper-app.tsx"), "utf8");
  const styles = await readFile(path.join(root, "app", "globals.css"), "utf8");
  assert.match(entry, /KeeperApp/);
  assert.match(entry, /AuthGate/);
  assert.match(supabase, /getKeeperLabRuntimeConfig/);
  assert.doesNotMatch(entry, /iframe/);
  assert.match(app, /modal-backdrop training-session-backdrop/);
  assert.match(styles, /\.rich-training-modal\{[^}]*height:100dvh/);
  assert.match(styles, /\.rich-training-modal \.training-modal-footer\{[^}]*position:sticky/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
});

test("pacchetto staged contiene solo plugin e asset production", async () => {
  const staged = path.join(root, "dist-wordpress", "keeperlab");
  const entries = await readdir(staged);
  assert.ok(entries.includes("keeperlab.php"));
  assert.ok(entries.includes("app"));
  assert.ok(!entries.includes("node_modules"));
  assert.ok(!entries.includes("tests"));
  const manifest = JSON.parse(await readFile(path.join(staged, "app", "manifest.json"), "utf8"));
  assert.ok(manifest["wordpress-src/main.tsx"]?.file);
});
