import { TaskMarkData } from './parser';
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

// Anchored to the start of the line, matching the same prefix shape as
// parser.ts ITEM_REGEX (optional indent, optional group marker, optional
// bullet) so only the status checkbox is touched — never a bracketed token
// that appears inside the task text.
const CHECKBOX_REGEX = /^(\s*(?:>\s*)?(?:-\s*)?\[\s*)([ xX])(\s*\])/;

export function toggleCheckboxInLine(line: string): string | null {
  const match = CHECKBOX_REGEX.exec(line);
  if (!match) {
    return null;
  }
  const toggled = match[2] === ' ' ? 'x' : ' ';
  return line.replace(CHECKBOX_REGEX, `$1${toggled}$3`);
}
