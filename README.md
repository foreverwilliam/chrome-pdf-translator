# PDF Translator - Chrome 扩展

PDF 双栏翻译器：左侧显示原文 PDF，右侧显示中文翻译。

## 快速开始

### 1. 运行安装脚本

在 `pdf-translator` 文件夹中打开终端，运行：

```bash
python setup.py
```

这会自动完成两件事：
- 下载 PDF.js 库到 `lib/` 文件夹
- 生成扩展图标到 `icons/` 文件夹

无需安装任何 Python 依赖，标准库即可。

### 2. 安装到 Chrome

1. 打开 Chrome，地址栏输入 `chrome://extensions/`
2. 右上角打开 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择 `pdf-translator` 文件夹
5. 安装完成，工具栏会出现插件图标

### 3. 配置 API Key

1. 点击工具栏的插件图标
2. 选择翻译服务（DeepL / OpenAI / DeepSeek / 自定义）
3. 输入对应的 API Key
4. 如选择"自定义"，还需填写 API 端点 URL 和模型名称（兼容 OpenAI Chat Completions 格式）
5. 点击 **保存设置**

### 4. 使用翻译

1. 点击插件图标 → **打开翻译器**
2. 点击"打开 PDF"或直接拖放 PDF 文件到左侧区域
3. 点击"翻译当前页"翻译单页，或"翻译全部"翻译所有页面
4. 右侧面板实时显示翻译结果
5. 点击右侧某段译文可展开查看英文原文对照

## 支持的翻译服务

| 服务 | 获取 Key | 特点 |
|------|----------|------|
| DeepL | https://www.deepl.com/pro-api | 翻译质量最好，Free 有 50 万字/月 |
| OpenAI | https://platform.openai.com/api-keys | 灵活，支持 GPT-4o 等多种模型 |
| DeepSeek | https://platform.deepseek.com/api_keys | 高性价比，支持 V3 和 R1 模型 |
| 自定义 | 自行配置 | 兼容 OpenAI 格式的任意 API（如 Qwen、GLM、Ollama 等） |

## 功能

- 左右分栏对照阅读
- PDF 翻页与缩放
- 拖放 PDF 文件加载
- 逐段实时翻译（带加载动画）
- 点击译文展开原文对照
- 左右面板同步滚动
- 可拖动中间分隔线调整面板比例
- 暗色主题

## 文件结构

```
pdf-translator/
├── manifest.json          # Chrome 扩展配置
├── background.js          # Service Worker (翻译 API 调用)
├── setup.py               # 一键安装脚本
├── viewer/
│   ├── viewer.html        # 主界面
│   ├── viewer.js          # PDF 渲染 + 翻译核心逻辑
│   └── viewer.css         # 界面样式
├── popup/
│   ├── popup.html         # 设置弹窗
│   └── popup.js           # 设置逻辑
├── lib/                   # (setup.py 自动下载)
│   ├── pdf.min.js
│   └── pdf.worker.min.js
└── icons/                 # (setup.py 自动生成)
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 开源与许可

- 本项目主体代码以 [MIT](LICENSE) 许可发布（可自行在 `LICENSE` 中把版权行改成你的姓名或组织）。
- `lib/pdf.min.js` 与 `lib/pdf.worker.min.js` 来自 [Mozilla PDF.js](https://github.com/mozilla/pdf.js)（Apache License 2.0），文件内保留原始许可声明。
