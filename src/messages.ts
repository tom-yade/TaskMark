import { TaskMarkData, TASK_LINE_PREFIX_NC } from './parser';
import { GanttData } from './gantt';

export interface TaskMarkUpdateMessage {
  type: 'update';
  uri: string;
  data: TaskMarkData;
  ganttData: GanttData;
  warnings: string[];
  fontSize: number;
}

export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 24;
export const FONT_SIZE_DEFAULT = 14;

export function resolveFontSize(value: unknown, fallback: number = FONT_SIZE_DEFAULT): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  const floored = Math.floor(value);
  return Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, floored));
}

export interface TaskMarkErrorMessage {
  type: 'parseError';
  message: string;
}

export interface ToggleTaskMessage {
  type: 'toggleTask';
  uri: string;
  rawLine: number;
  /** Full document line as captured when the panel last parsed the file. */
  sourceLine: string;
}

// Leading line prefix matches parser ITEM_REGEX (TASK_LINE_PREFIX_NC + \s*).
// Bracket interior mirrors ITEM: \[\s*([xX\s])\s*\] — one mark character
// with flexible inner whitespace. Only that mark is swapped ('x' todo→done,
// ASCII space done→todo) so surrounding spaces inside the brackets are kept.
const CHECKBOX_LINE_REGEX = new RegExp(
  `^(${TASK_LINE_PREFIX_NC}\\s*)(\\[)(\\s*)([xX\\s])(\\s*)(\\])`
);

export function toggleCheckboxInLine(line: string): string | null {
  const match = CHECKBOX_LINE_REGEX.exec(line);
  if (!match) {
    return null;
  }
  const mark = match[4];
  const isDone = mark.trim().toLowerCase() === 'x';
  const newMark = isDone ? ' ' : 'x';
  return (
    match[1] +
    match[2] +
    match[3] +
    newMark +
    match[5] +
    match[6] +
    line.slice(match[0].length)
  );
}

/**
 * Resolves which zero-based line index to toggle when `rawLine` may be stale
 * (e.g. the document changed since the webview rendered). Uses exact line text
 * equality with the value captured at parse time. When multiple lines match,
 * picks the index closest to `rawLine`, breaking ties toward a lower line number.
 */
export function resolveToggleTargetLineIndex(
  lineCount: number,
  getLineText: (index: number) => string,
  rawLine: number,
  sourceLine: string
): number | null {
  if (lineCount <= 0 || rawLine < 0) {
    return null;
  }
  if (rawLine < lineCount && getLineText(rawLine) === sourceLine) {
    return rawLine;
  }
  const matches: number[] = [];
  for (let j = 0; j < lineCount; j++) {
    if (getLineText(j) === sourceLine) {
      matches.push(j);
    }
  }
  if (matches.length === 0) {
    return null;
  }
  if (matches.length === 1) {
    return matches[0];
  }
  let best = matches[0];
  let bestDist = Math.abs(best - rawLine);
  for (let k = 1; k < matches.length; k++) {
    const m = matches[k];
    const d = Math.abs(m - rawLine);
    if (d < bestDist || (d === bestDist && m < best)) {
      best = m;
      bestDist = d;
    }
  }
  return best;
}
