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

const CHECKBOX_REGEX = /\[([ xX])\]/;

export function toggleCheckboxInLine(line: string): string | null {
  const match = CHECKBOX_REGEX.exec(line);
  if (!match) {
    return null;
  }
  const toggled = match[1] === ' ' ? 'x' : ' ';
  return line.replace(CHECKBOX_REGEX, `[${toggled}]`);
}
