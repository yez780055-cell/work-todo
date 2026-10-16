# Work Space · 工作待办

以电脑办公为主的个人工作待办空间，包含任务看板、例行任务、工作日历和 Index 笔记。

## 开发

```bash
npm install
npm run dev
```

## 检查与构建

```bash
npm test
npm run build
```

## Windows 桌面版

桌面版使用 Tauri 2。Windows 开发需要 Rust stable MSVC 工具链、Visual Studio Build Tools 的“使用 C++ 的桌面开发”组件、Windows SDK 和 WebView2 Runtime。

```bash
npm run tauri -- dev
npm run tauri -- build --bundles nsis
```

NSIS 安装包位于 `src-tauri/target/release/bundle/nsis/`。安装程序默认在系统尚未安装 WebView2 Runtime 时联网下载 bootstrapper。首次桌面启动会创建独立于浏览器的本地数据空间；在侧栏“数据备份”中导入网页版导出的 JSON 文件即可迁移，桌面数据与网页端不会自动同步。

## 数据

网页数据通过 IndexedDB 保存在当前浏览器和当前设备，不会上传到服务端或自动同步到其他设备。可在侧栏“数据备份”中导出或导入 JSON 备份。清除浏览器站点数据前，请先导出备份。桌面数据保存在 Tauri WebView2 的应用数据目录，与网页端相互隔离。

部署目标使用静态资源目录 `dist`。`.openai/hosting.json` 中的 `project_id` 用于关联私有部署项目。
