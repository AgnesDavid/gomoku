/**
 * 生成 .br / .gz 预压缩文件，供 Nginx 的 brotli_static / gzip_static 使用。
 * 托管商（Netlify、Cloudflare、Vercel）通常会自动压缩，不需要跑这个脚本。
 *
 *   node scripts/compress.mjs
 *   node scripts/compress.mjs --clean
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clean = process.argv.includes("--clean");

const targets = [
  "index.html",
  "styles.css",
  "sw.js",
  ...fs
    .readdirSync(path.join(root, "src"))
    .filter((file) => file.endsWith(".js"))
    .map((file) => `src/${file}`),
  ...fs
    .readdirSync(path.join(root, "vendor", "rapfi"))
    .filter((file) => /\.(js|wasm|data)$/.test(file))
    .map((file) => `vendor/rapfi/${file}`),
];

let before = 0;
let after = 0;

for (const relative of targets) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) continue;
  const source = fs.readFileSync(file);
  before += source.length;

  const brFile = `${file}.br`;
  const gzFile = `${file}.gz`;

  if (clean) {
    fs.rmSync(brFile, { force: true });
    fs.rmSync(gzFile, { force: true });
    continue;
  }

  const br = zlib.brotliCompressSync(source, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_GENERIC,
    },
  });
  const gz = zlib.gzipSync(source, { level: 9 });
  fs.writeFileSync(brFile, br);
  fs.writeFileSync(gzFile, gz);
  after += Math.min(br.length, gz.length);
  console.log(
    `${relative.padEnd(42)} ${(source.length / 1024).toFixed(0).padStart(5)}KB -> br ${(
      br.length / 1024
    ).toFixed(0)}KB / gz ${(gz.length / 1024).toFixed(0)}KB`,
  );
}

if (!clean) {
  console.log(
    `\n总计 ${(before / 1024 / 1024).toFixed(2)}MB -> 约 ${(after / 1024 / 1024).toFixed(
      2,
    )}MB（br/gz 取较小值估算）`,
  );
}
