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
