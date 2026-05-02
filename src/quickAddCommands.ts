import * as vscode from 'vscode';
import {
  formatLocalDate,
  formatScheduleLine,
  formatTaskLine,
  insertItemForDate,
  isValidDate,
  isValidTime,
  offsetDate,
} from './quickAdd';

const TMD_LANGUAGE_ID = 'tmd';

export function registerQuickAddCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('taskmark.addTask', () => runAddTask()),
    vscode.commands.registerCommand('taskmark.addSchedule', () => runAddSchedule()),
  );
}

async function runAddTask(): Promise<void> {
  const editor = await resolveTmdEditor();
  if (!editor) {
    return;
  }

  const body = await vscode.window.showInputBox({
    prompt: 'Task text',
    placeHolder: 'e.g. Review pull request',
    ignoreFocusOut: true,
    validateInput: v => (v.trim() === '' ? 'Task text cannot be empty' : null),
  });
  if (body === undefined) {
    return;
  }

  const dateStr = await pickDate();
  if (!dateStr) {
    return;
  }

  await applyInsertion(editor, dateStr, formatTaskLine(body));
}

async function runAddSchedule(): Promise<void> {
  const editor = await resolveTmdEditor();
  if (!editor) {
    return;
  }

  const body = await vscode.window.showInputBox({
    prompt: 'Schedule text',
    placeHolder: 'e.g. Team meeting',
    ignoreFocusOut: true,
    validateInput: v => (v.trim() === '' ? 'Schedule text cannot be empty' : null),
  });
  if (body === undefined) {
    return;
  }

  const startTime = await vscode.window.showInputBox({
    prompt: 'Start time (HH:mm)',
    placeHolder: '09:00',
    ignoreFocusOut: true,
    validateInput: v => (isValidTime(v) ? null : 'Enter time as HH:mm (24-hour)'),
  });
  if (startTime === undefined) {
    return;
  }

  const endTime = await vscode.window.showInputBox({
    prompt: 'End time (HH:mm) — leave blank for no end time',
    placeHolder: '10:00',
    ignoreFocusOut: true,
    validateInput: v => (v === '' || isValidTime(v) ? null : 'Enter time as HH:mm (24-hour)'),
  });
  if (endTime === undefined) {
    return;
  }

  const dateStr = await pickDate();
  if (!dateStr) {
    return;
  }

  const line = formatScheduleLine(body, startTime, endTime === '' ? undefined : endTime);
  await applyInsertion(editor, dateStr, line);
}

async function resolveTmdEditor(): Promise<vscode.TextEditor | undefined> {
  const active = vscode.window.activeTextEditor;
  if (active && active.document.languageId === TMD_LANGUAGE_ID) {
    return active;
  }

  const tmdDocs = vscode.workspace.textDocuments.filter(d => d.languageId === TMD_LANGUAGE_ID);
  if (tmdDocs.length === 0) {
    const tmdFiles = await vscode.workspace.findFiles('**/*.tmd', '**/node_modules/**', 20);
    if (tmdFiles.length === 0) {
      vscode.window.showErrorMessage('TaskMark: No .tmd file found in the workspace.');
      return undefined;
    }
    const picked = tmdFiles.length === 1
      ? tmdFiles[0]
      : await vscode.window.showQuickPick(
          tmdFiles.map(uri => ({ label: vscode.workspace.asRelativePath(uri), uri })),
          { placeHolder: 'Select a .tmd file' }
        ).then(p => p?.uri);
    if (!picked) {
      return undefined;
    }
    const doc = await vscode.workspace.openTextDocument(picked);
    return vscode.window.showTextDocument(doc);
  }

  if (tmdDocs.length === 1) {
    return vscode.window.showTextDocument(tmdDocs[0]);
  }

  const pick = await vscode.window.showQuickPick(
    tmdDocs.map(d => ({ label: vscode.workspace.asRelativePath(d.uri), document: d })),
    { placeHolder: 'Select a .tmd file' }
  );
  return pick ? vscode.window.showTextDocument(pick.document) : undefined;
}

async function pickDate(): Promise<string | undefined> {
  const now = new Date();
  const today = formatLocalDate(now);
  const tomorrow = formatLocalDate(offsetDate(now, 1));

  const choice = await vscode.window.showQuickPick(
    [
      { label: 'Today', detail: today, value: today },
      { label: 'Tomorrow', detail: tomorrow, value: tomorrow },
      { label: 'Pick a date…', detail: 'Enter YYYY-MM-DD', value: '__custom__' },
    ],
    { placeHolder: 'Target date' }
  );
  if (!choice) {
    return undefined;
  }
  if (choice.value !== '__custom__') {
    return choice.value;
  }
  return vscode.window.showInputBox({
    prompt: 'Date (YYYY-MM-DD)',
    placeHolder: today,
    ignoreFocusOut: true,
    validateInput: v => (isValidDate(v) ? null : 'Enter a date as YYYY-MM-DD'),
  });
}

async function applyInsertion(editor: vscode.TextEditor, dateStr: string, itemLine: string): Promise<void> {
  const document = editor.document;
  const original = document.getText();
  const { newText, insertedLineIndex } = insertItemForDate(original, dateStr, itemLine);

  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(original.length)
  );

  const ok = await editor.edit(eb => eb.replace(fullRange, newText));
  if (!ok) {
    vscode.window.showErrorMessage('TaskMark: Failed to insert item.');
    return;
  }

  const target = new vscode.Position(insertedLineIndex, document.lineAt(insertedLineIndex).text.length);
  editor.selection = new vscode.Selection(target, target);
  editor.revealRange(new vscode.Range(target, target), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}
