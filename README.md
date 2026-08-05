# 敲了个敲

一个给打工人的 Windows / macOS 桌面打字宠物。它常驻桌面，在 Word、浏览器、聊天工具、IDE 等其他软件获得焦点时也能统计按键数量和速度；不记录字符内容。

## 现在能做什么

- 透明、无边框、可拖动、可置顶的桌面宠物
- 全局键盘计数，自动排除修饰键、锁定键和长按重复
- 实时 KPM、WPM 估算、今日键数、活跃时长、时段分布和历史日榜
- 4 个原创代码绘制角色、4 套皮肤以及 3 档宠物尺寸
- 系统托盘控制显示、暂停统计、置顶、尺寸和退出
- 同一 WiFi 自动发现“附近工友”，按今日累计键数生成每秒刷新的实时榜
- 15 / 30 / 60 分钟工位房、6 位房间码和实时局内榜单
- 本地收藏“常用搭子”，下次在同一局域网碰面时快速识别
- 开机启动选项和本地 JSON 持久化

## 附近工友怎么玩

1. 两台或多台电脑连接同一个 WiFi 或局域网。
2. 打开“附近工友”，开启“局域网可见”。
3. 不用组房即可查看附近工友的今日键数排名、当前 KPM 和输入状态。
4. 想短时间冲刺时，一人可创建 15、30 或 60 分钟工位房。
5. 其他人从附近列表直接加入，或输入房主的 6 位房间码。

附近工友不需要注册账号或云端服务器，Windows 和 Mac 可以在同一 WiFi 下互相发现。Windows 首次询问网络访问时，只需允许“专用网络”。公司网络若禁用了 mDNS、设备隔离或点对点连接，自动发现可能不可用。

## 数据与隐私

本机保存：

- 每日按键总数、活跃秒数、峰值 KPM 和每小时统计
- 累计按键数、角色、皮肤、昵称和窗口偏好
- 随机设备 ID 与常用搭子列表

开启附近工友后，局域网内只会同步：

- 随机设备 ID、昵称和角色形象
- 在线与输入状态、房间码和比赛时长
- 今日累计键数、实时 KPM 和局内按键数量

不会保存或发送字符、键名、组合键、剪贴板内容、窗口标题、文档内容或历史统计。完整说明见 [PRIVACY.md](./PRIVACY.md)。

## 本地运行

需要 Windows 10/11 或 macOS 12 及更高版本，以及 Node.js 20 或更高版本。

```bash
npm install
npm run dev
```

启动后默认只出现桌面宠物。双击宠物，或双击托盘图标，可打开数据面板。浏览器中的 `http://127.0.0.1:5173/` 只用于界面预览，无法捕获其他软件的全局按键或使用局域网功能。

## 检查与构建

```bash
npm test
npm run test:lan
npm run lint
npm run build
```

`npm run test:lan` 会在本机临时启动两个局域网节点，验证 mDNS 发现、房间广播、WebSocket 加入和实时榜单同步。

生成 Windows 安装包（在 Windows 上运行）：

```bash
npm run dist:win
```

生成无 Apple Developer 证书的 Mac 安装包（必须在 macOS 上运行）：

```bash
npm run dist:mac
```

该命令会分别生成 Intel（`x64`）和 Apple Silicon（`arm64`）的 DMG / ZIP，并执行 ad-hoc 签名。只构建当前需要的架构时可使用 `npm run dist:mac:x64` 或 `npm run dist:mac:arm64`。

安装包输出到 `release/`。原生全局键盘模块会被 Electron Builder 自动解包，以便打包后正常加载。Mac 首次安装、键盘权限和正式签名说明见 [docs/MACOS.md](./docs/MACOS.md)。推送 `v*` 标签后，[macOS 工作流](./.github/workflows/build-macos.yml) 会在 GitHub 的 Mac runner 上构建并附加安装包。

## 项目结构

```text
electron/main.cjs          Electron 窗口、托盘、全局键盘与数据持久化
electron/lan-service.cjs   局域网发现、WebSocket 房间和榜单协议
electron/preload.cjs       受限 IPC 桥
electron/platform-support.cjs  macOS 权限入口与跨平台启动配置
scripts/lan-smoke.cjs      可重复运行的局域网冒烟验证
src/PetOverlay.tsx         透明桌面宠物
src/views/                 数据、节奏、附近工友、排行和换装页面
src/components/            导航与代码绘制角色
src/pet.css                桌面宠物和数据面板样式
```

## 当前边界

- “附近工友”和“常用搭子”只在同一局域网工作，没有云端账号体系。
- 工位房适合熟人间轻量比拼，不提供强对抗作弊检测。
- 退出房间或关闭软件后不会保留历史对局记录。
- 跨网络好友、邀请通知、赛季榜和账号同步属于后续云端版本范围。

## 参与贡献

欢迎提交 Issue 和 Pull Request。涉及键盘统计或局域网协议的改动，请同时补充测试，并确保任何新数据字段都不会包含用户输入内容。

本项目采用 [MIT License](./LICENSE)。
