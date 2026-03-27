import * as vscode from 'vscode';
import { TaskmarkPanel } from './TaskmarkPanel';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('taskmark.openView', () => {
      TaskmarkPanel.createOrShow(context.extensionUri);
    })
  );

  if (vscode.window.registerWebviewPanelSerializer) {
    vscode.window.registerWebviewPanelSerializer(TaskmarkPanel.viewType, {
      async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, _state: unknown) {
        TaskmarkPanel.revive(webviewPanel, context.extensionUri);
      }
    });
  }
}
