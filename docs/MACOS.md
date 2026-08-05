# macOS 安装与发布

敲了个敲支持 macOS 12 及更高版本。Apple Silicon（M1/M2/M3/M4 等）请选择文件名含 `arm64` 的安装包；Intel Mac 请选择 `x64`。

## 安装无证书版本

GitHub Actions 默认生成经过 ad-hoc 签名、但没有 Apple Developer 身份签名和公证的 DMG / ZIP。安装步骤如下：

1. 打开 DMG，将“敲了个敲”拖入“应用程序”。
2. 在“应用程序”中按住 Control 点击应用，选择“打开”。
3. 如果系统仍然拦截，打开“系统设置 > 隐私与安全性”，在安全提示下选择“仍要打开”。
4. 进入应用的数据面板，按提示分别允许“辅助功能”和“输入监控”。
5. 回到应用点击“重新检测”；若仍没有计数，点击“重启应用”。

授权对象与应用所在路径、包标识及签名有关。替换安装包后如果权限失效，请在系统设置中移除旧条目，再重新添加 `/Applications/敲了个敲.app`。

ad-hoc 签名只保证应用包内部代码在签名后没有被修改，不代表 Apple 验证了开发者身份，也不会绕过 Gatekeeper。项目不会生成或冒充第三方开发者证书。

## 本地构建

DMG 依赖 macOS 自带的 `hdiutil` 和 `codesign`，因此必须在 Mac 或 GitHub 的 macOS runner 上生成：

```bash
npm ci
npm test
npm run lint
npm run dist:mac
```

输出包括：

- `敲了个敲-<version>-arm64.dmg` / `.zip`
- `敲了个敲-<version>-x64.dmg` / `.zip`

项目的 `scripts/after-pack-mac.cjs` 会在无证书构建中执行稳定包标识的 ad-hoc 签名。可以用下面的命令验证解包后的应用：

```bash
codesign --verify --deep --strict "release/mac-arm64/敲了个敲.app"
codesign -dv --verbose=4 "release/mac-arm64/敲了个敲.app"
```

## GitHub 自动构建

`.github/workflows/build-macos.yml` 支持手动运行，也会在推送 `v*` 标签时构建两个架构。手动运行的产物位于工作流 Artifacts；标签构建还会自动创建或更新对应的 GitHub Release。

```bash
git tag v0.3.0
git push origin v0.3.0
```

## 正式签名与公证

面向普通用户公开分发时，建议使用 Apple Developer ID Application 证书和 Apple 公证。配置好 Electron Builder 支持的证书及公证环境变量后运行：

```bash
npm run dist:mac:signed
```

常用环境变量为 `CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD` 和 `APPLE_TEAM_ID`。不要把证书、密码或 API Key 提交到仓库；在 GitHub 上应存入 Actions Secrets。正式签名和公证只能在 macOS 上完成。

## 键盘权限说明

应用通过 Electron 的 `systemPreferences.isTrustedAccessibilityClient(...)` 检测辅助功能权限，并为辅助功能、输入监控提供系统设置入口。权限未授予时不会启动全局键盘钩子；授权后只累计事件数量和时间，不保存字符、键名、组合键、窗口标题或文档内容。

Mac 与 Windows 使用同一套局域网发现和 WebSocket 协议，因此同一 WiFi 下可以互相看到今日实时排名、KPM 和输入状态。
