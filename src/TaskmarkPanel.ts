import * as vscode from 'vscode';
import { parseTmd } from './parser';

export class TaskmarkPanel {
  public static currentPanel: TaskmarkPanel | undefined;
  public static readonly viewType = 'taskmark';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (TaskmarkPanel.currentPanel) {
      TaskmarkPanel.currentPanel._panel.reveal(column);
      // Manually trigger an update if it already exists
      TaskmarkPanel.currentPanel.updateFromActiveEditor();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      TaskmarkPanel.viewType,
      'TaskMark',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        retainContextWhenHidden: true // Keep Webview state when switching tabs
      }
    );

    TaskmarkPanel.currentPanel = new TaskmarkPanel(panel, extensionUri);
  }

  public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    TaskmarkPanel.currentPanel = new TaskmarkPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._update();
    this.updateFromActiveEditor(); // Initial load

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    vscode.workspace.onDidChangeTextDocument(
      e => {
        if (e.document === vscode.window.activeTextEditor?.document) {
          if (e.document.languageId === 'tmd') {
            this.updateFromDocument(e.document);
          }
        }
      },
      null,
      this._disposables
    );

    vscode.window.onDidChangeActiveTextEditor(
      editor => {
        if (editor && editor.document.languageId === 'tmd') {
          this.updateFromDocument(editor.document);
        }
      },
      null,
      this._disposables
    );
  }

  private updateFromActiveEditor() {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === 'tmd') {
      this.updateFromDocument(editor.document);
    }
  }

  private updateFromDocument(document: vscode.TextDocument) {
    try {
      const text = document.getText();
      const parsedData = parseTmd(text);
      this._panel.webview.postMessage({
        type: 'update',
        data: parsedData
      });
    } catch (e) {
      console.error("TaskMark parse error", e);
    }
  }

  public dispose() {
    TaskmarkPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _update() {
    const webview = this._panel.webview;
    this._panel.webview.html = this._getHtmlForWebview(webview);
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css'));

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>TaskMark</title>
        <link href="${stylesUri}" rel="stylesheet">
      </head>
      <body>
        <div class="tm-header">
          <div class="tm-toggle-container">
            <button class="tm-view-toggle active" id="btn-calendar">Calendar</button>
            <button class="tm-view-toggle" id="btn-timeline">Timeline</button>
          </div>
          <div class="tm-month-nav">
             <button class="tm-view-toggle" id="btn-today">Today</button>
             <div class="tm-toggle-container" id="calendar-granularity-toggles">
                <button class="tm-view-toggle active" id="btn-monthly">Monthly</button>
                <button class="tm-view-toggle" id="btn-weekly">Weekly</button>
                <button class="tm-view-toggle" id="btn-daily">Daily</button>
             </div>
             <button id="btn-prev-month">&lt;</button>
             <h2 id="current-month-display">2026-03</h2>
             <button id="btn-next-month">&gt;</button>
          </div>
        </div>
        <div class="tm-content" id="tm-content-area">
          <div class="tm-calendar-grid" id="tm-calendar"></div>
          <div class="tm-timeline-view hidden" id="tm-timeline"></div>
        </div>
        <script src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}
