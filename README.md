# AO3 Reader

A Visual Studio Code extension for reading public AO3 works in a Webview or in the Output panel.

一个可以在 VS Code 中阅读 AO3 公开作品的扩展，支持普通阅读和 Output 面板阅读模式。

## Install / 安装

Marketplace 用户只需要安装扩展，不需要单独安装 Node.js、npm、Playwright 或浏览器。

从源码运行：

```bash
npm ci
npm run compile
```

然后在 VS Code 中打开本项目并按 `F5`，会启动 Extension Development Host。

打包 VSIX：

```bash
npm run package
```

## Usage / 使用

1. 打开命令面板：Windows/Linux 使用 `Ctrl+Shift+P`，macOS 使用 `Cmd+Shift+P`。
2. 运行 `Open AO3 Fanfiction`。
3. 粘贴 AO3 作品或章节链接，例如：
   `https://archiveofourown.org/works/1234567/chapters/2345678`
4. 选择“在 VSCode 里阅读”或“伪装成终端摸鱼模式”。

“终端模式”的内容显示在 **Output / 输出** 面板，不是真正的 Terminal / 终端。

## Network / 网络与代理

扩展需要能够访问 `https://archiveofourown.org`。如果你的网络不能直连 AO3，请先配置可用代理，然后在 VS Code 设置中搜索 `http.proxy` 并填入代理地址，例如：

```text
http://127.0.0.1:7890
```

扩展也支持 `HTTPS_PROXY`、`HTTP_PROXY` 环境变量。修改代理后请执行 `Developer: Reload Window`。

## Limitations / 限制

- 支持 `/works/<id>` 和 `/works/<id>/chapters/<id>` 链接。
- 需要登录才能阅读的作品目前不支持。
- 如果 AO3 返回 403、5xx 或连接超时，请检查 AO3 状态、网络与代理。

## Feedback / 联系作者

欢迎提交 GitHub issue，或联系 `bluetrainswemissed@proton.me`。

## License

MIT
