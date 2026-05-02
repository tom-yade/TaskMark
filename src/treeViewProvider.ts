import * as vscode from 'vscode';
import { MarkItem, parseTmd } from './parser';
import { resolveToggleTargetLineIndex, toggleCheckboxInLine } from './messages';
import {
  CategoryId,
  CATEGORY_ORDER,
  TreeCategorizedItems,
  categorizeForTreeView,
  categoryLabel,
  formatItemLabel,
  todayDateStr
} from './treeView';

interface CategoryNode {
  kind: 'category';
  id: CategoryId;
}

interface ItemNode {
  kind: 'item';
  category: CategoryId;
  item: MarkItem;
  uri: vscode.Uri;
}

export type TreeNode = CategoryNode | ItemNode;

function categoryIcon(id: CategoryId): vscode.ThemeIcon {
  switch (id) {
    case 'today': return new vscode.ThemeIcon('calendar');
    case 'thisWeek': return new vscode.ThemeIcon('calendar');
    case 'overdue': return new vscode.ThemeIcon('warning');
    case 'recentlyDone': return new vscode.ThemeIcon('check');
  }
}

export class TaskmarkTreeDataProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChange = new vscode.EventEmitter<TreeNode | undefined>();
  public readonly onDidChangeTreeData = this._onDidChange.event;

  private _activeUri: vscode.Uri | undefined;
  private _categorized: TreeCategorizedItems = {
    today: [], thisWeek: [], overdue: [], recentlyDone: []
  };
  private _todayStr: string = todayDateStr();

  refresh(): void {
    this._todayStr = todayDateStr();
    const editor = this._findTmdEditor();
    if (editor) {
      this._activeUri = editor.document.uri;
      const { data } = parseTmd(editor.document.getText());
      this._categorized = categorizeForTreeView(data, this._todayStr);
    } else {
      this._activeUri = undefined;
      this._categorized = { today: [], thisWeek: [], overdue: [], recentlyDone: [] };
    }
    this._onDidChange.fire(undefined);
  }

  private _findTmdEditor(): vscode.TextEditor | undefined {
    const active = vscode.window.activeTextEditor;
    if (active && active.document.languageId === 'tmd') {
      return active;
    }
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.languageId === 'tmd') {
        return editor;
      }
    }
    return undefined;
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    if (node.kind === 'category') {
      const items = this._categorized[node.id];
      const label = categoryLabel(node.id, this._todayStr);
      const treeItem = new vscode.TreeItem(
        `${label} (${items.length})`,
        items.length > 0
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.None
      );
      treeItem.iconPath = categoryIcon(node.id);
      treeItem.contextValue = `taskmarkCategory.${node.id}`;
      return treeItem;
    }

    const treeItem = new vscode.TreeItem(formatItemLabel(node.item), vscode.TreeItemCollapsibleState.None);
    treeItem.description = node.item.tags.length > 0
      ? node.item.tags.map(t => `#${t}`).join(' ')
      : undefined;
    treeItem.tooltip = `${node.item.startDate}${node.item.endDate ? ` : ${node.item.endDate}` : ''}\n${node.item.sourceLine}`;
    treeItem.command = {
      command: 'taskmark.tree.revealItem',
      title: 'Reveal in editor',
      arguments: [node]
    };
    treeItem.contextValue = node.item.type === 'task' ? 'taskmarkTask' : 'taskmarkSchedule';
    if (node.item.type === 'task') {
      treeItem.iconPath = new vscode.ThemeIcon(
        node.item.status === 'done' ? 'pass-filled' : 'circle-large-outline'
      );
    } else {
      treeItem.iconPath = new vscode.ThemeIcon('clock');
    }
    return treeItem;
  }

  getChildren(node?: TreeNode): TreeNode[] {
    if (!node) {
      return CATEGORY_ORDER.map(id => ({ kind: 'category', id }));
    }
    if (node.kind === 'category') {
      const uri = this._activeUri;
      if (!uri) { return []; }
      return this._categorized[node.id].map(item => ({
        kind: 'item',
        category: node.id,
        item,
        uri
      }));
    }
    return [];
  }

  async revealItem(node: ItemNode): Promise<void> {
    const document = await vscode.workspace.openTextDocument(node.uri);
    const lineIdx = resolveToggleTargetLineIndex(
      document.lineCount,
      i => document.lineAt(i).text,
      node.item.rawLine,
      node.item.sourceLine
    );
    const targetLine = lineIdx ?? Math.min(node.item.rawLine, document.lineCount - 1);
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    const range = document.lineAt(targetLine).range;
    editor.selection = new vscode.Selection(range.start, range.start);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  }

  async toggleItem(node: ItemNode): Promise<void> {
    if (node.item.type !== 'task') { return; }
    const document = await vscode.workspace.openTextDocument(node.uri);
    const lineIdx = resolveToggleTargetLineIndex(
      document.lineCount,
      i => document.lineAt(i).text,
      node.item.rawLine,
      node.item.sourceLine
    );
    if (lineIdx === null) {
      vscode.window.showInformationMessage(
        'TaskMark: That task no longer matches the file (it may have been edited).'
      );
      return;
    }
    const line = document.lineAt(lineIdx);
    const toggled = toggleCheckboxInLine(line.text);
    if (toggled === null || toggled === line.text) { return; }
    const edit = new vscode.WorkspaceEdit();
    edit.replace(node.uri, line.range, toggled);
    await vscode.workspace.applyEdit(edit);
  }
}
