import * as vscode from 'vscode';
import {
  DuplicateEndCondition,
  DuplicatePattern,
  duplicateTaskAcrossDates,
  findSourceDateForLine,
  parseDuplicateEndCondition,
  parseDuplicatePattern,
} from './duplicateTask';
import { isValidDate } from './quickAdd';

const TMD_LANGUAGE_ID = 'tmd';
const TASK_LINE_REGEX = /^\s*(?:>\s*)?-\s*\[/;
const EVERY_INPUT_REGEX = /^[1-9]\d*(?:days?|weeks?|months?)$/;

export function registerDuplicateTaskCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('taskmark.duplicateTask', () => runDuplicateTask()),
  );
}

async function runDuplicateTask(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== TMD_LANGUAGE_ID) {
    vscode.window.showErrorMessage('TaskMark: Open a .tmd file before running Duplicate Task.');
    return;
  }

  const document = editor.document;
  const lineIndex = editor.selection.active.line;
  const lineText = document.lineAt(lineIndex).text;
  if (!TASK_LINE_REGEX.test(lineText)) {
    vscode.window.showErrorMessage('TaskMark: Place the cursor on a task line (- [ ] ...) first.');
    return;
  }

  const fullText = document.getText();
  const sourceDate = findSourceDateForLine(fullText, lineIndex);
  if (!sourceDate) {
    vscode.window.showErrorMessage('TaskMark: No date header found above the current task.');
    return;
  }

  const pattern = await pickPattern();
  if (!pattern) {
    return;
  }

  const endCondition = await pickEndCondition();
  if (!endCondition) {
    return;
  }

  const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
  const { newText, insertedDates } = duplicateTaskAcrossDates(
    fullText,
    sourceDate,
    lineText,
    pattern,
    endCondition,
    eol,
  );

  if (insertedDates.length === 0) {
    vscode.window.showInformationMessage('TaskMark: No dates matched — nothing to duplicate.');
    return;
  }

  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(fullText.length),
  );
  const ok = await editor.edit(eb => eb.replace(fullRange, newText));
  if (!ok) {
    vscode.window.showErrorMessage('TaskMark: Failed to duplicate task.');
    return;
  }

  vscode.window.showInformationMessage(
    `TaskMark: Duplicated task into ${insertedDates.length} date${insertedDates.length === 1 ? '' : 's'}.`,
  );
}

async function pickPattern(): Promise<DuplicatePattern | undefined> {
  const choice = await vscode.window.showQuickPick(
    [
      { label: 'Daily', detail: 'Every day', value: 'daily' },
      { label: 'Weekly', detail: 'Every week', value: 'weekly' },
      { label: 'Monthly', detail: 'Every month', value: 'monthly' },
      { label: 'Every N days/weeks/months…', detail: 'Enter a custom interval', value: '__custom__' },
    ],
    { placeHolder: 'Repeat pattern' },
  );
  if (!choice) {
    return undefined;
  }
  if (choice.value !== '__custom__') {
    return parseDuplicatePattern(choice.value) ?? undefined;
  }
  const raw = await vscode.window.showInputBox({
    prompt: 'Custom interval',
    placeHolder: 'e.g. 3days, 2weeks, 3months',
    ignoreFocusOut: true,
    validateInput: v => (EVERY_INPUT_REGEX.test(v.trim()) ? null : 'Enter <N><unit> where unit is days/weeks/months'),
  });
  if (raw === undefined) {
    return undefined;
  }
  return parseDuplicatePattern(`every:${raw.trim()}`) ?? undefined;
}

async function pickEndCondition(): Promise<DuplicateEndCondition | undefined> {
  const choice = await vscode.window.showQuickPick(
    [
      { label: 'Count', detail: 'Number of occurrences (including the source)', value: 'count' },
      { label: 'Until', detail: 'End date (YYYY-MM-DD)', value: 'until' },
    ],
    { placeHolder: 'End condition' },
  );
  if (!choice) {
    return undefined;
  }
  if (choice.value === 'count') {
    const raw = await vscode.window.showInputBox({
      prompt: 'Occurrence count (including the source)',
      placeHolder: '4',
      ignoreFocusOut: true,
      validateInput: v => (/^[1-9]\d*$/.test(v.trim()) ? null : 'Enter a positive integer'),
    });
    if (raw === undefined) {
      return undefined;
    }
    return parseDuplicateEndCondition(`count:${raw.trim()}`) ?? undefined;
  }
  const raw = await vscode.window.showInputBox({
    prompt: 'End date (YYYY-MM-DD)',
    placeHolder: '2026-12-31',
    ignoreFocusOut: true,
    validateInput: v => (isValidDate(v.trim()) ? null : 'Enter a date as YYYY-MM-DD'),
  });
  if (raw === undefined) {
    return undefined;
  }
  return parseDuplicateEndCondition(`until:${raw.trim()}`) ?? undefined;
}
