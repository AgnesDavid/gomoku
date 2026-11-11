# 五子棋 · Gomoku

一个可以直接部署的纯静态五子棋网页：原生 ES Modules + Canvas，支持人机对弈、本地双人、AI 对 AI 演示、军师提示、自动存档、键盘操作和 PWA 离线安装。

## 功能

- **人机对弈**：六档难度，「新手 / 简单 / 普通 / 困难 / 高手 / 挑战」，AI 全部在本地计算。
- **本地双人**：同一台设备上黑方、白方轮流落子，双方都可以点「军师」；不计入人机战绩，模式会随存档保存。
- **WASM 引擎**：困难/高手/挑战使用 Rapfi WASM，80ms / 500ms / 5s 思考；首次加载约 1.3MB，加载失败先回退 JS AI Worker，再退主线程。
- **JS AI 也异步**：新手/简单/普通不再阻塞主线程，落子后界面照常响应。
- **军师提示**：轮到你时点「军师」，独立 Rapfi 实例用 1.5 秒分析，高亮推荐点并给出「直接成五 / 堵对方成五 / 做活三 / 堵活三」等理由；只提示、不代下。
- **形势估算**：状态卡下方可点「分析」，用 Rapfi 的 `WINRATE` 显示黑白胜率条；可选 0.5s / 0.8s / 2s，默认手动。打开「自动」后只在轮到人类时分析，AI 思考或演示中不会启动。
- **战绩**：按难度记录胜/负/和；AI 对 AI 演示累计黑胜/白胜/和棋。
- **AI 对 AI 演示**：双方可分别选择难度（黑方 / 白方），默认跟随当前主难度；可暂停/继续、交换黑白难度；可选「公平两局」：双方各执黑一次、按选手计分，1:1 记平局，不设第三局。
- **夜间模式**：右上角切换日间/夜间，默认跟随系统，选择会记住。
- **落子音效**：本地 Web Audio 合成，无音频文件；右上角「音效 / 静音」切换，默认开启，选择会记住。
- **分享局面**：把当前棋局编码进链接，朋友打开即可继续或复盘。
- **棋谱库**：支持导入 SGF、保存当前对局、删除棋谱，并从任意一手进入复盘。
- **自动存档**：每一步后把棋局、难度、执子存进 `localStorage`，刷新或切后台回来可以继续；演示和两局赛比分也会恢复。
- **防误触**：有棋局时开新局、切棋盘、换执子会先弹确认，不再一点就清盘。
- **可调棋盘**：13 × 13、15 × 15、19 × 19 三种尺寸，切换即开新局。
- **执子选择**：执黑先行或执白后行；执白时 AI 先落中心。
- **悔棋**：一次退回双方各一手，胜局也能撤回；AI 思考中点悔棋会先取消当前计算再回退。
- **复盘与 SGF**：可逐步前后翻看当前棋局，或导出标准 SGF 棋谱。
- **19 路触屏放大镜**：19 × 19 棋盘上按住拖动会显示放大镜，松手才落子，减少点错交叉点。
- **胜负结算层**：结束时在棋盘上显示「你赢了 / AI 获胜 / 和棋」，可直接再来一局、悔棋或关闭查看棋盘。
- **手机操作条**：窄屏时「新对局 / 悔棋 / 军师 / 演示」固定在底部，状态卡滚动时吸顶，不用来回找按钮。
- **键盘与读屏**：Canvas 可聚焦，方向键移动光标、回车/空格落子；`aria-live` 播报落子、军师建议和结算结果。
- **PWA 离线**：支持安装到桌面，首次加载后整套静态资源（含 Rapfi wasm/data）由 Service Worker 缓存，第二次打开可完全离线；开启省流量模式时跳过 1.3MB 引擎预缓存。
- **自由规则**：横、竖、斜任意方向连成五子即胜，长连同样算胜，无禁手。
- **细节**：军师高亮呼吸动画、落子动画、最后一手标记、胜利连线、悬停预览、响应式布局、`prefers-reduced-motion` 适配。

联机、禁手判定不在这一版范围内。

## 本地运行

页面使用 ES Modules，需要通过 HTTP 访问（浏览器不允许 `file://` 下加载模块）：

```bash
python -m http.server 8000
# 或者
npx serve .
```

然后打开 <http://localhost:8000>。Service Worker 在 `localhost` 和 HTTPS 下可用；如果是局域网 IP + 普通 HTTP，PWA 安装和离线缓存不会生效，但游戏本身正常。

## 部署

整个目录就是成品，不需要 `npm install` 或打包：

1. 把仓库推到 GitHub，在 Pages 里选择分支根目录即可；
2. 或把目录直接拖到 Netlify / Cloudflare Pages / Vercel；
3. 或上传到任意对象存储、Nginx 静态目录。

所有资源路径都是相对的（`./styles.css`、`./src/main.js`），部署在子路径（如 `https://example.com/gomoku/`）也能正常工作。`vendor/rapfi/*.wasm` 需要以 `application/wasm` 返回；GitHub Pages、Netlify、Cloudflare Pages 默认会正确处理，Nginx 可加上 `types { application/wasm wasm; }`。

### 缓存与压缩

- `_headers` 给 Netlify / Cloudflare Pages 用：HTML、`sw.js` 不缓存；带版本查询参数的 `/src/*` 和 `/vendor/rapfi/*` 长缓存。
- 托管商通常自动 Brotli/gzip。若用 Nginx，先运行：

  ```bash
  npm run compress
  ```

  会在文件旁生成 `.br` / `.gz`，然后开启 `brotli_static on;` 和 `gzip_static on;`。Rapfi wasm 约 1.23MB，Brotli 后约 255KB。
- 修改任何静态文件后统一升版本：

  ```bash
  npm run bump -- 20261030-1
  ```

  这会更新 `index.html`、`src/*.js`、`tests/*.js` 和 `sw.js` 里的版本串，避免浏览器继续用旧模块或旧 Service Worker。

### PWA 安装

- Android Chrome / Edge：页面右上角会出现「安装到桌面」；也可以从浏览器菜单安装。
- 安装按钮默认显示；如果浏览器还没触发原生安装提示（例如已经装过、或 Chrome 还没放行 `beforeinstallprompt`），点击会弹出当前浏览器的安装说明，而不是消失。
- iOS Safari：点分享按钮 →「添加到主屏幕」。
- 安装后从桌面图标打开，首次仍需联网加载一次；之后断网也能开局、悔棋和对弈，引擎不可用时先回退 JS AI Worker，再退主线程。
- 页面导航是「网络优先、3 秒超时回退缓存」，明确离线时直接读缓存；静态资源先精确匹配版本，网络失败才退回旧缓存，避免新版 HTML 配到旧 JS。
- 如果之前装过旧版，出现 `ERR_FAILED`/白屏而**无痕窗口正常**：打开 DevTools → Application → Service Workers → Unregister，再 Clear site data，关闭所有该站标签页后重开。只需清一次，之后自动更新。

## 目录结构

```
index.html            页面结构、结算层、确认弹窗
styles.css            视觉、移动端固定操作条、结算层与弹窗
manifest.webmanifest  PWA 清单
sw.js                 Service Worker 离线缓存
_headers              Netlify / Cloudflare Pages 缓存头
icons/                PWA 图标（180 / 192 / 512 / maskable）
src/main.js           UI 控制、模式调度、存档、键盘、军师
src/game.js           棋局状态与胜负判定（纯逻辑，无 DOM）
src/ai.js             评估函数 + Alpha-Beta 搜索 + VCF/VCT
src/js-ai.js          JS AI 的 Worker 控制器
src/js-ai-worker.js   JS AI 的 module worker
src/rapfi-ai.js       Rapfi WASM 主线程控制器
src/rapfi-worker.js   Rapfi WASM Worker 包装
src/advice.js         军师建议的棋型理由
src/eval.js           引擎胜率转黑白估算胜率
src/sgf.js            SGF 解析、校验与导出
src/series.js         公平两局赛的计分与换边规则
src/theme.js          日间/夜间主题
src/sound.js          Web Audio 落子音效
src/renderer.js       Canvas 绘制、命中检测、提示脉冲、键盘光标
src/pwa.js            Service Worker 注册与安装入口
scripts/              版本升级、预压缩脚本
vendor/rapfi/         Rapfi WASM 产物、GPL 许可证与来源说明
tests/                Node 原生测试
```

规则内核不依赖任何浏览器 API，JS AI、界面和测试共用同一份实现；Rapfi 只通过 Worker 与界面通信；军师使用独立的 Rapfi 实例，不会打断人机对弈引擎的置换表。

## 测试

需要 Node 20+：

```bash
npm test
```

覆盖内容包括：四个方向的胜负判定、边界与长连、非法落子、悔棋、不同棋盘尺寸，AI 的立即取胜 / 必须封堵 / 冲四算杀 / 合法性与耗时预算，军师的成五、堵五、活三理由，形势胜率换算，SGF 解析/导出，以及公平两局赛的计分与换边。

开发时还验证过：module worker 能正确返回开局和应手、存档能重放恢复、演示能暂停/继续、结算层与键盘光标正常。

## AI 对 AI 演示

- 点「演示」开始；面板里的「演示难度」可以分别设置黑方和白方，例如新手 vs 挑战、高手 vs 高手。
- 默认跟随当前主难度；用户改过之后保持自定义。
- 修改难度后从下一手生效；如果该方正在思考，会按新难度重算当前这一手。
- 勾选「公平两局」后，第一局执黑者为 A、执白者为 B；第二局自动交换黑白，双方各执黑一次，按选手计分。1:1 记平局，不设第三局，避免一方多拿一次先手。系列赛进行中双方难度会锁定，比分随对局一起保存。
- 演示中不可悔棋、不可用军师；「新对局」退出演示，结算层可以直接进入第二局或再来一届。
- 挑战档每步 5 秒，演示会比较慢；想看快节奏可以选新手/简单/普通。

## 本地双人

- 在「对局模式」里选「本地双人」，无需联网，也不会触发 AI 落子。
- 黑方、白方轮流落子；轮到谁，状态卡就显示谁，双方都可以点「军师」查看当前一手建议。
- 本地双人不写入人机战绩，也不参与演示累计；棋局、模式和复盘会随存档恢复。
- 「悔棋」在本地双人里只退回最后一手；人机模式仍退回双方各一手。

## 形势估算

- 状态卡下方的「分析」默认手动点击，不会每步自动跑；可选 0.5s / 0.8s / 2s。
- 打开「自动」后，只在轮到人类时异步分析；AI 思考、军师分析或演示进行中不会启动，避免抢 CPU。
- 引擎用 `INFO SHOW_DETAIL 2` 输出 `INFO WINRATE`、`INFO EVAL` 和深度；界面显示黑白估算胜率条、胜势/均势判断。
- 终局直接显示 100/0 或 50/50，不再请求引擎。
- 胜率是 Rapfi 的估算值，不是大量对局校准后的统计胜率；不同思考时间会略有差异。

## 复盘与棋谱

- 战绩卡里的「复盘」会进入只读模式，用「上一手 / 下一手」逐步查看当前对局；退出后恢复实时棋局。
- 复盘过程中不会触发 AI、军师或自动分析。
- 「导出 SGF 棋谱」会按当前历史生成标准 SGF，包含棋盘尺寸、日期、结果和双方落子。
- 棋谱库支持导入 SGF、保存当前对局和删除；导入时会校验 13/15/19 路、黑白交替、坐标范围和长度。

## 难度梯度

| 难度 | 引擎 | 特点 |
| --- | --- | --- |
| 新手 | JS，2 层 + 随机 | 相当于旧版「简单」，会下错 |
| 简单 | JS，4 层 | 相当于旧版「普通」，攻守均衡 |
| 普通 | JS，8 层 + VCF/VCT | 相当于旧版「高手」，会算杀 |
| 困难 | Rapfi WASM，80ms + 棋力限制 | 短时间、低强度、限深/限节点/缩候选 |
| 高手 | Rapfi WASM，500ms | 中长考，强于困难 |
| 挑战 | Rapfi WASM，5000ms | 5 秒长考，尽量接近 gomocalc 快棋 |

困难/高手/挑战在 WASM 加载失败时会自动回退到「普通」的 JS AI；军师提示同样走 Rapfi（1.5 秒固定强度），失败时回退到「普通」JS AI。军师使用单独 Worker，不会重置人机对弈引擎的会话。

挑战档按 gomocalc「快棋」的 5 秒思考对齐；但我们是单线程 + classical 权重，gomocalc 默认是 16 线程 + Mix9svq NNUE，所以挑战档仍可能略弱于 gomocalc 默认快棋。

## 调整 AI

低难度的 JS 参数集中在 `src/ai.js` 顶部的 `LEVELS`，困难/高手/挑战的 WASM 时间在 `src/rapfi-ai.js` 的 `RAPFI_LEVELS`：

```js
// src/ai.js：普通档（也是困难/高手/挑战的 WASM 回退）
const JS_MASTER = {
  rootMoves: 16,    // 根节点候选点数量
  innerMoves: 8,    // 深层节点候选点数量
  maxDepth: 8,      // 迭代加深的最大深度
  time: 1100,       // 单步时间上限（毫秒）
  vcf: { depth: 12, time: 140, nodes: 3200 },
  vct: { depth: 14, time: 180, nodes: 3600 },
};
```

```js
// src/rapfi-ai.js
const RAPFI_LEVELS = {
  hard: {
    time: 80, strength: 60,
    maxDepth: 8, maxNodes: 30000, caution: 2,
  },
  master: {
    time: 500, strength: 100,
    maxDepth: 64, maxNodes: 0, caution: 3,
  },
  challenge: {
    time: 5000, strength: 100,
    maxDepth: 64, maxNodes: 0, caution: 3,
  },
};

// 军师提示：固定 1.5 秒、满强度
const RAPFI_HINT = {
  time: 1500, strength: 100,
  maxDepth: 64, maxNodes: 0, caution: 3,
};
```

JS AI 按「连子长度 + 开放端数量」评估，搜索使用 Alpha-Beta、置换表、候选点战术排序、杀手着法/历史启发和迭代加深；普通档额外带 VCF（连续冲四）和 VCT（连续活三/冲四）算杀。困难/高手/挑战通过 Worker 与 Rapfi WASM 增量续弈（`TURN`）；只有执白首手、悔棋重建或军师分析时才用 `BOARD`/`DONE` 重放局面。军师在独立实例中分析，结束后清掉自己的会话，不影响主引擎。

Rapfi 是 GPLv3 软件，`vendor/rapfi/LICENSE.txt` 和 `SOURCE.md` 说明了来源与构建方式；修改 wasm 或再分发时需要遵守 GPLv3。

## 已知限制

- 困难/高手/挑战与军师提示需要浏览器支持 WebAssembly SIMD（现代 Chrome/Edge/Safari 均支持）；不支持或加载失败时先回退 JS AI Worker，Worker 也不可用才回退主线程。首次加载 wasm + 数据约 1.3MB，之后走浏览器缓存。
- 军师按 1.5 秒预算思考；首次点「军师」若引擎尚未加载，会先显示「军师加载中」，加载完成后才开始计时。
- AI 对 AI 演示双方可以分别选难度；选「挑战」时每一步 5 秒，演示会比较慢，建议先用普通/高手观看。「公平两局」第二局会自动交换黑白，保证双方各执黑一次。
- 形势胜率来自 Rapfi 的 `WINRATE` 估算，不是大量对局校准后的真实统计胜率；不同深度/思考时间会略有差异。
- 自动分析每一步会多跑一次约 0.8 秒的 Rapfi 分析，手机上建议按需使用。
- 自动存档存在当前浏览器 `localStorage`，换浏览器或清缓存后不会保留；没有云端同步。
- 无禁手规则，黑棋三三、四四、长连都不判负。
- 没有联机、计时。
