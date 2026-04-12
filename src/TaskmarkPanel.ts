import * as vscode from 'vscode';
import { parseTmd, TaskMarkData } from './parser';
import { buildGanttEntities, GanttData } from './gantt';
import { getWebviewHtml } from './template';
import { debounce, DebouncedFn } from './utils/debounce';

export interface TaskMarkUpdateMessage {
  type: 'update';
  data: TaskMarkData;
  ganttData: GanttData;
  warnings: string[];
}

export interface TaskMarkErrorMessage {
  type: 'parseError';
  message: string;
}

export class TaskmarkPanel {
  public static currentPanel: TaskmarkPanel | undefined;
  public static readonly viewType = 'taskmark';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private readonly _debouncedUpdateFromDocument: DebouncedFn<(document: vscode.TextDocument) => void>;

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
    this._debouncedUpdateFromDocument = debounce(
      (document: vscode.TextDocument) => this.updateFromDocument(document),
      250
    );

    this._update();
    this.updateFromActiveEditor();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    vscode.workspace.onDidChangeTextDocument(
      e => {
        if (e.document === vscode.window.activeTextEditor?.document) {
          if (e.document.languageId === 'tmd') {
            this._debouncedUpdateFromDocument(e.document);
          }
        }
      },
      null,
      this._disposables
    );

    vscode.window.onDidChangeActiveTextEditor(
      editor => {
        this._debouncedUpdateFromDocument.cancel();
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
      const { data: parsedData, warnings } = parseTmd(text);
      const configColors = vscode.workspace.getConfiguration('taskmark').get<Record<string, string>>('tagColors', {});
      parsedData.tagColors = { ...configColors, ...parsedData.tagColors };
      const message: TaskMarkUpdateMessage = {
        type: 'update',
        data: parsedData,
        ganttData: buildGanttEntities(parsedData),
        warnings
      };
      this._panel.webview.postMessage(message);
    } catch (e) {
      const errorText = e instanceof Error ? e.message : String(e);
      console.error("TaskMark parse error", e);
      const errorMessage: TaskMarkErrorMessage = { type: 'parseError', message: errorText };
      this._panel.webview.postMessage(errorMessage);
    }
  }

  public dispose() {
    TaskmarkPanel.currentPanel = undefined;
    this._debouncedUpdateFromDocument.cancel();
    this._panel.dispose();
    vscode.Disposable.from(...this._disposables).dispose();
    this._disposables = [];
  }

  private _update() {
    const webview = this._panel.webview;
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css'));
    webview.html = getWebviewHtml(scriptUri, stylesUri);
  }
}
