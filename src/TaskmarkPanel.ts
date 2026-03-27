import * as vscode from 'vscode';
import { parseTmd, TaskMarkData } from './parser';
import { getWebviewHtml } from './template';

export interface TaskMarkUpdateMessage {
  type: 'update';
  data: TaskMarkData;
}

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
        retainContextWhenHidden: true
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
    this.updateFromActiveEditor();

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

    vscode.workspace.onDidChangeConfiguration(
      e => {
        if (e.affectsConfiguration('taskmark.tagColors')) {
          this.updateFromActiveEditor();
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
      const configColors = vscode.workspace.getConfiguration('taskmark').get<Record<string, string>>('tagColors', {});
      parsedData.tagColors = { ...configColors, ...parsedData.tagColors };
      const message: TaskMarkUpdateMessage = {
        type: 'update',
        data: parsedData
      };
      this._panel.webview.postMessage(message);
    } catch (e) {
      console.error("TaskMark parse error", e);
      if (e instanceof Error) {
        vscode.window.showErrorMessage(`TaskMark parse error: ${e.message}`);
      } else {
        vscode.window.showErrorMessage('TaskMark parse error: An unknown error occurred.');
      }
    }
  }

  public dispose() {
    TaskmarkPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      this._disposables.pop()!.dispose();
    }
  }

  private _update() {
    const webview = this._panel.webview;
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css'));
    webview.html = getWebviewHtml(scriptUri, stylesUri);
  }
}
