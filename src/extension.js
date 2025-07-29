"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const playwright_1 = require("playwright"); // playwright 用法
function activate(context) {
    console.log('ao3-reader activated');
    let disposable = vscode.commands.registerCommand('ao3-reader.openAo3Fanfic', async () => {
        const url = await vscode.window.showInputBox({
            prompt: 'Enter AO3 fanfic URL',
            placeHolder: 'https://archiveofourown.org/works/xxxxxx'
        });
        if (!url) {
            vscode.window.showWarningMessage('Invalid URL!');
            return;
        }
        vscode.window.showInformationMessage(`Loading: ${url}`);
        try {
            const browser = await playwright_1.chromium.launch();
            const page = await browser.newPage();
            await page.goto(url, { timeout: 60000 }); // 60秒超时，避免卡住
            const content = await page.content();
            const panel = vscode.window.createWebviewPanel('ao3FanficView', 'AO3 Fanfic', vscode.ViewColumn.One, {});
            panel.webview.html = content;
            await browser.close();
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to load: ${error}`);
        }
    });
    context.subscriptions.push(disposable);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map