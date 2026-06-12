import * as https from 'https';
import * as vscode from 'vscode';
import { load } from 'cheerio';
import { HttpsProxyAgent } from 'https-proxy-agent';

const AO3_HOSTS = new Set(['archiveofourown.org', 'www.archiveofourown.org']);
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;

interface ChapterOption {
    text: string;
    url: string;
}

interface WorkContent {
    contentHtml: string;
    contentText: string;
    title: string;
    chapterOptions: ChapterOption[];
}

export function activate(context: vscode.ExtensionContext) {
    const output = vscode.window.createOutputChannel('AO3 Reader');

    const disposable = vscode.commands.registerCommand('ao3-reader.openAo3Fanfic', async () => {
        const input = await vscode.window.showInputBox({
            prompt: '请输入 AO3 小说链接',
            placeHolder: 'https://archiveofourown.org/works/xxxxxx/chapters/yyyyyy'
        });

        if (!input) {
            return;
        }

        let url: URL;
        try {
            url = normalizeAo3Url(input);
        } catch (error) {
            vscode.window.showErrorMessage(getErrorMessage(error));
            return;
        }

        const mode = await vscode.window.showQuickPick(
            ['在 VSCode 里阅读', '伪装成终端摸鱼模式'],
            { placeHolder: '请选择阅读模式' }
        );

        if (!mode) {
            return;
        }

        try {
            const content = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: '正在加载 AO3 作品...',
                    cancellable: false
                },
                () => loadWork(url)
            );

            if (mode === '伪装成终端摸鱼模式') {
                await openOutputReader(output, url, content);
                return;
            }

            openWebviewReader(context, url, content);
        } catch (error) {
            vscode.window.showErrorMessage(getErrorMessage(error));
        }
    });

    context.subscriptions.push(disposable, output);
}

export function deactivate() {}

async function openOutputReader(output: vscode.OutputChannel, baseUrl: URL, initial: WorkContent) {
    let content = initial;
    output.show();

    while (true) {
        renderOutputChapter(output, content);

        if (content.chapterOptions.length <= 1) {
            output.appendLine('\n（此作品为单章短篇，无章节可切换）');
            return;
        }

        const input = await vscode.window.showInputBox({
            prompt: '输入章节编号切换章节，输入 q 退出',
            placeHolder: '例如 1 / 2 / q'
        });

        if (!input || input.toLowerCase() === 'q') {
            output.appendLine('\n退出阅读模式。');
            return;
        }

        const index = Number.parseInt(input, 10) - 1;
        if (!/^\d+$/.test(input) || index < 0 || index >= content.chapterOptions.length) {
            vscode.window.showWarningMessage('无效章节编号，请重新输入。');
            continue;
        }

        const chapterUrl = normalizeAo3Url(new URL(content.chapterOptions[index].url, baseUrl).toString());
        content = await loadWork(chapterUrl);
    }
}

function renderOutputChapter(output: vscode.OutputChannel, content: WorkContent) {
    output.clear();

    if (content.chapterOptions.length > 1) {
        output.appendLine('章节列表：');
        content.chapterOptions.forEach((option, index) => {
            output.appendLine(`${index + 1}. ${option.text}`);
        });
    }

    output.appendLine(`\n=== ${content.title} ===\n`);
    output.appendLine(content.contentText);
}

function openWebviewReader(
    context: vscode.ExtensionContext,
    baseUrl: URL,
    initial: WorkContent
) {
    const panel = vscode.window.createWebviewPanel(
        'ao3FanficView',
        initial.title,
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    const render = (content: WorkContent) => {
        panel.title = content.title;
        panel.webview.html = getWebviewHtml(panel.webview, content);
    };

    render(initial);

    panel.webview.onDidReceiveMessage(
        async message => {
            if (message.command !== 'loadChapter' || typeof message.chapterUrl !== 'string') {
                return;
            }

            try {
                const chapterUrl = normalizeAo3Url(new URL(message.chapterUrl, baseUrl).toString());
                render(await loadWork(chapterUrl));
            } catch (error) {
                vscode.window.showErrorMessage(getErrorMessage(error));
            }
        },
        undefined,
        context.subscriptions
    );
}

async function loadWork(url: URL): Promise<WorkContent> {
    const html = await requestHtml(url);
    const $ = load(html);
    let article = $('#chapters .userstuff[role="article"], #chapters .userstuff.module').first();

    // AO3 single-chapter works may omit the article/module attributes used on chapter pages.
    if (!article.length) {
        article = $('#chapters > .userstuff').first();
    }
    if (!article.length && $('#chapters').is('.userstuff')) {
        article = $('#chapters').first();
    }

    if (!article.length) {
        const pageError = $('#main .error, #main .caution, #main .notice').first().text().trim();
        const detail = pageError || '页面中没有找到章节正文。该作品可能需要登录、已被删除或禁止访客访问。';
        throw new Error(detail);
    }

    article.find('script, style, iframe, object, embed, form, input, button').remove();
    article.find('*').each((_, element) => {
        const attributes = Object.keys(element.attribs ?? {});
        for (const attribute of attributes) {
            const value = element.attribs?.[attribute] ?? '';
            if (attribute.toLowerCase().startsWith('on') || /^\s*javascript:/i.test(value)) {
                $(element).removeAttr(attribute);
            }
        }
    });

    const title = $('h2.title.heading').first().text().replace(/\s+/g, ' ').trim()
        || $('title').text().replace(/\s+/g, ' ').trim()
        || 'AO3 Reader';

    const workId = url.pathname.match(/^\/works\/(\d+)/)?.[1];
    const chapterOptions = $('#selected_id option').map((_, option) => {
        const value = $(option).attr('value') ?? '';
        const chapterUrl = workId && /^\d+$/.test(value)
            ? `/works/${workId}/chapters/${value}`
            : value;

        return {
            text: $(option).text().replace(/\s+/g, ' ').trim(),
            url: chapterUrl
        };
    }).get().filter(option => option.url);

    return {
        contentHtml: article.html() ?? '',
        contentText: article.text().replace(/\n{3,}/g, '\n\n').trim(),
        title,
        chapterOptions
    };
}

function requestHtml(url: URL, redirects = 0): Promise<string> {
    if (redirects > MAX_REDIRECTS) {
        return Promise.reject(new Error('AO3 重定向次数过多。'));
    }

    const proxy = getProxyUrl();
    const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;

    return new Promise((resolve, reject) => {
        const request = https.get(
            url,
            {
                agent,
                headers: {
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Encoding': 'identity',
                    'Cookie': 'view_adult=true',
                    'User-Agent': 'AO3-Reader-VSCode/0.0.9'
                }
            },
            response => {
                const status = response.statusCode ?? 0;
                const location = response.headers.location;

                if (status >= 300 && status < 400 && location) {
                    response.resume();
                    try {
                        resolve(requestHtml(normalizeAo3Url(new URL(location, url).toString()), redirects + 1));
                    } catch (error) {
                        reject(error);
                    }
                    return;
                }

                if (status !== 200) {
                    response.resume();
                    reject(new Error(`AO3 请求失败（HTTP ${status}）。请检查网络、代理或作品访问权限。`));
                    return;
                }

                response.setEncoding('utf8');
                let body = '';
                response.on('data', chunk => {
                    body += chunk;
                });
                response.on('end', () => resolve(body));
            }
        );

        request.setTimeout(REQUEST_TIMEOUT_MS, () => {
            request.destroy(new Error('连接 AO3 超时。请检查网络或 VS Code 的 http.proxy 设置。'));
        });
        request.on('error', reject);
    });
}

function getProxyUrl(): string | undefined {
    const configured = vscode.workspace.getConfiguration('http').get<string>('proxy')?.trim();
    return configured
        || process.env.HTTPS_PROXY
        || process.env.https_proxy
        || process.env.HTTP_PROXY
        || process.env.http_proxy;
}

function normalizeAo3Url(value: string): URL {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || !AO3_HOSTS.has(url.hostname)) {
        throw new Error('请输入 archiveofourown.org 的 HTTPS 作品链接。');
    }
    if (!/^\/works\/\d+(?:\/chapters\/\d+)?\/?$/.test(url.pathname)) {
        throw new Error('链接格式应为 /works/作品编号 或 /works/作品编号/chapters/章节编号。');
    }
    url.hash = '';
    return url;
}

function getWebviewHtml(webview: vscode.Webview, content: WorkContent) {
    const nonce = `${Date.now()}${Math.random().toString(36).slice(2)}`;
    const optionsHtml = content.chapterOptions
        .map(option => `<option value="${escapeHtml(option.url)}">${escapeHtml(option.text)}</option>`)
        .join('\n');
    const chapterControls = content.chapterOptions.length > 1
        ? `<div class="controls">
            <select id="chapterSelect">${optionsHtml}</select>
            <button id="loadChapter">加载章节</button>
        </div>`
        : '';

    return `<!DOCTYPE html>
    <html lang="zh-cn">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy"
              content="default-src 'none'; img-src https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
        <title>${escapeHtml(content.title)}</title>
        <style>
            body { max-width: 780px; margin: 0 auto; padding: 24px; font: 16px/1.75 var(--vscode-font-family); color: var(--vscode-foreground); }
            h1 { font-size: 1.4rem; }
            .controls { display: flex; gap: 8px; margin: 16px 0 24px; }
            select { flex: 1; }
            select, button { padding: 6px 8px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); }
            a { color: var(--vscode-textLink-foreground); }
            img { max-width: 100%; }
        </style>
    </head>
    <body>
        <h1>${escapeHtml(content.title)}</h1>
        ${chapterControls}
        <main>${content.contentHtml}</main>
        <script nonce="${nonce}">
            const button = document.getElementById('loadChapter');
            button?.addEventListener('click', () => {
                const select = document.getElementById('chapterSelect');
                acquireVsCodeApi().postMessage({
                    command: 'loadChapter',
                    chapterUrl: select.value
                });
            });
        </script>
    </body>
    </html>`;
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getErrorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return `AO3 Reader：${message}`;
}
