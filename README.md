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

## 数据

数据通过 IndexedDB 保存在当前浏览器和当前设备，不会上传到服务端或自动同步到其他设备。可在侧栏“数据备份”中导出或导入 JSON 备份。清除浏览器站点数据前，请先导出备份。

部署目标使用静态资源目录 `dist`。`.openai/hosting.json` 中的 `project_id` 用于关联私有部署项目。
