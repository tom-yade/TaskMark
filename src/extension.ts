import * as vscode from 'vscode';
import { TaskmarkPanel } from './TaskmarkPanel';
import { registerQuickAddCommands } from './quickAddCommands';
import { registerCompletionProviders } from './completionProvider';
import { TaskmarkTreeDataProvider } from './treeViewProvider';
import { debounce } from './utils/debounce';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('taskmark.openView', () => {
      TaskmarkPanel.createOrShow(context.extensionUri);
    })
  );

  registerQuickAddCommands(context);
  registerCompletionProviders(context);
  registerTreeView(context);

  if (vscode.window.registerWebviewPanelSerializer) {
    vscode.window.registerWebviewPanelSerializer(TaskmarkPanel.viewType, {
      async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, _state: unknown) {
        TaskmarkPanel.revive(webviewPanel, context.extensionUri);
      }
    });
  }
}

function registerTreeView(context: vscode.ExtensionContext) {
  const provider = new TaskmarkTreeDataProvider();
  const treeView = vscode.window.createTreeView('taskmarkOverview', {
    treeDataProvider: provider,
    showCollapseAll: true
  });
  context.subscriptions.push(treeView);

  provider.refresh();

  const debouncedRefresh = debounce(() => provider.refresh(), 250);

  context.subscriptions.push(
    vscode.commands.registerCommand('taskmark.tree.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('taskmark.tree.revealItem', (node) => {
      if (node && node.kind === 'item') {
        void provider.revealItem(node);
      }
    }),
    vscode.commands.registerCommand('taskmark.tree.toggleItem', (node) => {
      if (node && node.kind === 'item') {
        void provider.toggleItem(node);
      }
    }),
    vscode.window.onDidChangeActiveTextEditor(() => provider.refresh()),
    vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.languageId === 'tmd') {
        debouncedRefresh();
      }
    }),
    { dispose: () => debouncedRefresh.cancel() }
  );
}
