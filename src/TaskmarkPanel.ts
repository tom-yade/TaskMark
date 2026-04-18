import * as vscode from 'vscode';
import { parseTmd, VALID_CSS_COLOR_REGEX } from './parser';
import { buildGanttEntities } from './gantt';
import { getWebviewHtml } from './template';
import { debounce, DebouncedFn } from './utils/debounce';
import {
  TaskMarkUpdateMessage,
  TaskMarkErrorMessage,
  ToggleTaskMessage,
  toggleCheckboxInLine
} from './messages';

export {
  TaskMarkUpdateMessage,
  TaskMarkErrorMessage,
  ToggleTaskMessage,
  toggleCheckboxInLine
};

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

    this._panel.webview.onDidReceiveMessage(
      msg => this.handleWebviewMessage(msg),
      null,
      this._disposables
    );
  }

  private handleWebviewMessage(message: unknown): void {
    if (!message || typeof message !== 'object') {
      return;
    }
    const msg = message as { type?: unknown };
    if (msg.type === 'toggleTask') {
      const toggle = message as ToggleTaskMessage;
      if (typeof toggle.uri !== 'string' || typeof toggle.rawLine !== 'number') {
        return;
      }
      void this.toggleTaskInDocument(toggle.uri, toggle.rawLine);
    }
  }

  private async toggleTaskInDocument(uriString: string, rawLine: number): Promise<void> {
    try {
      const uri = vscode.Uri.parse(uriString);
      const document = await vscode.workspace.openTextDocument(uri);
      if (rawLine < 0 || rawLine >= document.lineCount) {
        return;
      }
      const line = document.lineAt(rawLine);
      const toggled = toggleCheckboxInLine(line.text);
      if (toggled === null || toggled === line.text) {
        return;
      }
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, line.range, toggled);
      const applied = await vscode.workspace.applyEdit(edit);
      if (applied) {
        this._debouncedUpdateFromDocument.cancel();
        this.updateFromDocument(document);
      } else {
        vscode.window.showErrorMessage(
          'TaskMark: Failed to toggle task. The file may be read-only or locked by another process.'
        );
      }
    } catch (e) {
      console.error('TaskMark toggleTask error', e);
      const detail = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(`TaskMark: Failed to toggle task. ${detail}`);
    }
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
      for (const [tag, color] of Object.entries(configColors)) {
        if (VALID_CSS_COLOR_REGEX.test(color)) {
          if (!parsedData.tagColors[tag]) {
            parsedData.tagColors[tag] = color;
          }
        } else {
          warnings.push(`Setting tagColors: invalid color '${color}' for tag '${tag}', skipped`);
        }
      }
      const message: TaskMarkUpdateMessage = {
        type: 'update',
        uri: document.uri.toString(),
        data: parsedData,
        ganttData: buildGanttEntities(parsedData),
        warnings: [...new Set(warnings)]
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
    webview.html = getWebviewHtml(scriptUri, stylesUri, webview.cspSource);
  }
}
