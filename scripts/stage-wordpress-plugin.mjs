import { cp, mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "wordpress-plugin", "keeperlab");
const builtApp = path.join(root, "build-wordpress", "app");
const destination = path.join(root, "dist-wordpress", "keeperlab");

await stat(path.join(builtApp, "manifest.json"));
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
await cp(builtApp, path.join(destination, "app"), { recursive: true });
await mkdir(path.join(destination, "app", "icons"), { recursive: true });
await cp(path.join(root, "public", "icon-192.png"), path.join(destination, "app", "icons", "icon-192.png"));

const manifest = JSON.parse(await readFile(path.join(destination, "app", "manifest.json"), "utf8"));
const entry = manifest["wordpress-src/main.tsx"] ?? Object.values(manifest).find(value => value?.isEntry);
if (!entry?.file) throw new Error("WordPress entry missing from Vite manifest");

console.log(destination);
