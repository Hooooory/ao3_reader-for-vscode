import * as vscode from 'vscode';
import { chromium } from 'playwright';

export function activate(context: vscode.ExtensionContext) {
    console.log('ao3-reader activated');

    let disposable = vscode.commands.registerCommand('ao3-reader.openAo3Fanfic', async () => {
        const url = await vscode.window.showInputBox({
            prompt: '请输入 AO3 小说链接',
            placeHolder: 'https://archiveofourown.org/works/xxxxxx/chapters/yyyyyy'
        });

        if (!url) {
            vscode.window.showWarningMessage('请输入有效的链接！');
            return;
        }

        // 额外加一个选项：是否用终端模式
        const mode = await vscode.window.showQuickPick(['在 VSCode 里阅读', '伪装成终端摸鱼模式'], {
            placeHolder: '请选择阅读模式'
        });

        if (!mode) {
            return;
        }

        vscode.window.showInformationMessage(`开始加载：${url} （模式：${mode}）`);

        const browser = await chromium.launch();
        const page = await browser.newPage();

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded' });

            const { contentText, contentHtml, title, chapterOptions } = await extractContent(page);

            // if (mode === '伪装成终端摸鱼模式') {
            //     const terminal = vscode.window.createTerminal('AO3 Reader');
            //     terminal.show();

            //     const printChapter = async (chapterUrl: string) => {
            //         await page.goto(chapterUrl, { waitUntil: 'domcontentloaded' });
            //         const { contentText: newContentText, title: newTitle } = await extractContent(page);
            //         terminal.sendText(`Write-Output "=== ${newTitle} ==="\n`);
            //         terminal.sendText(`Write-Output @"\n${newContentText}\n"@\n`);
            //         terminal.sendText(`Write-Output "--- 可输入章节编号切换章节，或输入 q 退出 ---"\n`);
            //     };

            //     const printChapterList = () => {
            //         terminal.sendText('Write-Output "章节列表："');
            //         chapterOptions.forEach((opt: {text: string }, index: number) => {
            //             terminal.sendText(`Write-Output "${index + 1}. ${opt.text}"`);
            //         });
            //     };

            //     // 初始打印
            //     terminal.sendText(`Write-Output "=== ${title} ==="\n`);
            //     terminal.sendText(`Write-Output @"\n${contentText}\n"@\n`);
            //     terminal.sendText(`Write-Output "--- 可输入章节编号切换章节，或输入 q 退出 ---"\n`);
            //     printChapterList();

            //     // 循环输入
            //     while (true) {
            //         const input = await vscode.window.showInputBox({
            //             prompt: '输入章节编号切换章节，或输入 q 退出',
            //             placeHolder: '例如 1 / 2 / q'
            //         });

            //         if (!input) {
            //             continue;
            //         }

            //         if (input === 'q') {
            //             terminal.sendText('Write-Output "退出阅读模式，感谢使用 ❤️"\n');
            //             await browser.close();
            //             console.log('playwright browser closed');
            //             break;
            //         }

            //         const match = input.match(/^(\d+)$/);
            //         if (match) {
            //             const index = parseInt(match[1]) - 1;
            //             if (index >= 0 && index < chapterOptions.length) {
            //                 const chapterUrl = new URL(chapterOptions[index].url, url).toString();
            //                 await printChapter(chapterUrl);
            //             } else {
            //                 vscode.window.showWarningMessage('无效编号，请重新输入');
            //             }
            //         } else {
            //             vscode.window.showWarningMessage('无效输入，请重新输入');
            //         }
            //     }

            //     return;
            // }

            if (mode === '伪装成终端摸鱼模式') {
                const output = vscode.window.createOutputChannel('AO3 Reader');
                output.show();

                const printChapter = async (chapterUrl: string) => {
                    await page.goto(chapterUrl, { waitUntil: 'domcontentloaded' });
                    const { contentText: newContentText, title: newTitle } = await extractContent(page);
                    output.clear();
                    printChapterList();
                    output.appendLine(`\n=== ${newTitle} ===\n`);
                    output.appendLine(newContentText);
                    output.appendLine('\n--- 可输入章节编号切换章节，或输入 q 退出 ---\n');
                };

                const printChapterList = () => {
                    output.appendLine('章节列表：');
                    chapterOptions.forEach((opt: { text: string }, index: number) => {
                        output.appendLine(`${index + 1}. ${opt.text}`);
                    });
                };

                // 初始打印
                output.clear();

                if (chapterOptions.length <= 1) {
                    // 短篇文，无章节切换
                    output.appendLine(`\n=== ${title} ===\n`);
                    output.appendLine(contentText);
                    output.appendLine('\n（此作品为单章短篇，无章节可切换）');
                    await browser.close();
                    console.log('playwright browser closed');
                    return;
                }

                // 正常多章节文
                printChapterList();
                output.appendLine(`\n=== ${title} ===\n`);
                output.appendLine(contentText);
                output.appendLine('\n--- 可输入章节编号切换章节，或输入 q 退出 ---\n');

                // 循环输入
                while (true) {
                    const input = await vscode.window.showInputBox({
                        prompt: '输入章节编号切换章节，或输入 q 退出',
                        placeHolder: '例如 1 / 2 / q'
                    });

                    if (!input) {
                        continue;
                    }

                    if (input === 'q') {
                        output.appendLine('\n退出阅读模式，感谢使用 ❤️');
                        await browser.close();
                        console.log('playwright browser closed');
                        break;
                    }

                    const match = input.match(/^(\d+)$/);
                    if (match) {
                        const index = parseInt(match[1]) - 1;
                        if (index >= 0 && index < chapterOptions.length) {
                            const chapterUrl = new URL(chapterOptions[index].url, url).toString();
                            await printChapter(chapterUrl);
                        } else {
                            vscode.window.showWarningMessage('无效编号，请重新输入');
                        }
                    } else {
                        vscode.window.showWarningMessage('无效输入，请重新输入');
                    }
                }

                return;
            }

            // 默认模式：Webview 窗口
            const panel = vscode.window.createWebviewPanel(
                'ao3FanficView',
                title,
                vscode.ViewColumn.One,
                {
                    enableScripts: true
                }
            );

            panel.webview.html = getWebviewHtml(contentHtml, title, chapterOptions);

            panel.webview.onDidReceiveMessage(async message => {
                if (message.command === 'loadChapter') {
                    const newUrl = message.chapterUrl;
                    vscode.window.showInformationMessage(`加载章节: ${newUrl}`);

                    const fullUrl = new URL(newUrl, url).toString();
                    try {
                        await page.goto(fullUrl, { waitUntil: 'domcontentloaded' });

                        const { contentHtml: newContentHtml, title: newTitle } = await extractContent(page);
                        panel.webview.html = getWebviewHtml(newContentHtml, newTitle, chapterOptions);
                    } catch (error) {
                        vscode.window.showErrorMessage(`加载失败: ${error}`);
                        // 不关闭 browser，让用户可以继续切换章节
                    }
                }
            });

            panel.onDidDispose(async () => {
                await browser.close();
                console.log('playwright browser closed');
            });

        } catch (error) {
            vscode.window.showErrorMessage(`加载失败: ${error}`);
            // await browser.close();
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}

async function extractContent(page: any) {
    const contentHtml = await page.$eval('#chapters .userstuff', (el: Element) => el.innerHTML);
    const contentText = await page.$eval('#chapters .userstuff', (el: HTMLElement) => el.innerText);
    const title = await page.title();

    const chapterOptions = await page.$$eval('#selected_id option', (options: Element[]) => {
        return options.map(option => ({
            text: option.textContent?.trim() || '',
            url: (option as HTMLOptionElement).value
        }));
    });

    return { contentHtml, contentText, title, chapterOptions };
}

function getWebviewHtml(content: string, title: string, chapterOptions: { text: string, url: string }[]) {
    const optionsHtml = chapterOptions.map(opt => `<option value="${opt.url}">${opt.text}</option>`).join('\n');

    return `
    <!DOCTYPE html>
    <html lang="zh-cn">
    <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <style>
            body {
                font-size: 14px;
                font-family: "Segoe UI", "Microsoft YaHei", Arial, sans-serif;
                line-height: 1.7;
            }
            h1 {
                font-size: 18px;
            }
            #content {
                margin-top: 1em;
                font-size: 14px;
            }
            select, button {
                font-size: 14px;
            }
        </style>
    </head>
    <body>
        <h1>${title}</h1>
        <select id="chapterSelect">
            ${optionsHtml}
        </select>
        <button id="loadChapter">加载章节</button>
        <div id="content">
            ${content}
        </div>

        <script>
            const vscode = acquireVsCodeApi();

            document.getElementById('loadChapter').addEventListener('click', () => {
                const select = document.getElementById('chapterSelect');
                const chapterUrl = select.value;
                vscode.postMessage({
                    command: 'loadChapter',
                    chapterUrl: chapterUrl
                });
            });
        </script>
    </body>
    </html>
    `;
}