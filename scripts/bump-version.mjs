/**
 * 统一更新静态资源版本号。
 *
 *   node scripts/bump-version.mjs 20261030-1
 *
 * 会更新 index.html、src/*.js、tests/*.js 和 sw.js 中的版本串；
 * 改完后记得重新部署，Service Worker 会用新版本建立缓存。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const next = process.argv[2];
if (!next || !/^\d{8}-\d+$/.test(next)) {
  console.error("用法：node scripts/bump-version.mjs 20261030-1");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "index.html",
  "sw.js",
  ...fs
    .readdirSync(path.join(root, "src"))
    .filter((file) => file.endsWith(".js"))
    .map((file) => `src/${file}`),
  ...fs
    .readdirSync(path.join(root, "tests"))
    .filter((file) => file.endsWith(".test.js"))
    .map((file) => `tests/${file}`),
];

const pattern = /\b(v?)20\d{6}-\d+\b/g;
let changed = 0;

for (const relative of files) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, "utf8");
  const after = before.replace(pattern, (_, prefix) => `${prefix}${next}`);
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed += 1;
    console.log(`updated ${relative}`);
  }
}

console.log(`\n${changed} 个文件已更新到 ${next}`);
