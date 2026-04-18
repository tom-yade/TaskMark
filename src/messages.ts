import { TaskMarkData, TASK_LINE_PREFIX_SRC } from './parser';
import { GanttData } from './gantt';

export interface TaskMarkUpdateMessage {
  type: 'update';
  uri: string;
  data: TaskMarkData;
  ganttData: GanttData;
  warnings: string[];
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

// Anchored to the start of the line and built from the same
// TASK_LINE_PREFIX_SRC as parser.ts ITEM_REGEX, so that only the leading
// status checkbox of a line that parser would recognise as a task is
// ever matched. Leading indentation is intentionally rejected because
// parser.ts ITEM_REGEX does not accept indented task lines either.
// Capture layout:
//   1: full prefix up to and including '[' and optional inner space
//   2: group marker '>\s*' (nested within group 1)
//   3: bullet '-'         (nested within group 1)
//   4: the checkbox character (' ' | 'x' | 'X')
//   5: optional inner space + ']'
const CHECKBOX_REGEX = new RegExp(
  `^(${TASK_LINE_PREFIX_SRC}\\s*\\[\\s*)([ xX])(\\s*\\])`
);

export function toggleCheckboxInLine(line: string): string | null {
  const match = CHECKBOX_REGEX.exec(line);
  if (!match) {
    return null;
  }
  const toggled = match[4] === ' ' ? 'x' : ' ';
  return line.replace(CHECKBOX_REGEX, `$1${toggled}$5`);
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
