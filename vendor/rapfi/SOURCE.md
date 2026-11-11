# Rapfi WASM 构建来源

本目录的 `rapfi-single-simd128.js` / `.wasm` / `.data` 由 [Rapfi](https://github.com/dotb1ue/rapfi) 编译而来。

- 上游版本：`dotb1ue/rapfi` master（下载时对应提交见 GitHub 仓库）
- 许可证：GNU GPL v3，完整文本见 `LICENSE.txt`
- 评估网络：`rapfi-networks` 的 `classical/model260809.bin`（CC0-1.0），配置为 `gomocalc-classical260809.toml`
- 构建方式：Emscripten 6.0.13 + CMake/Ninja

```text
emcmake cmake .. -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DNO_COMMAND_MODULES=ON \
  -DNO_MULTI_THREADING=ON \
  -DUSE_WASM_SIMD=ON \
  -DUSE_WASM_SIMD_RELAXED=OFF
```

规则固定为 `INFO RULE 0`（FREESTYLE，无禁手，五子或以上获胜），坐标模式为 `none`。

Rapfi 源码：https://github.com/dotb1ue/rapfi

本目录不再附带源码 zip，以减小部署包体积。**注意：Rapfi 是 GPLv3 软件，公开分发 wasm 时需要按 GPLv3 提供对应源码或书面 offer。** 个人本地使用不受影响；如果要公开部署，建议保留上游源码链接，或重新放回源码包。

如需重新构建，请按上游 `Readme.md` 的 WebAssembly 章节操作；若修改源码，需按 GPLv3 提供对应源码。
