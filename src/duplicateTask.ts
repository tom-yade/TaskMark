// Pure helpers backing the TaskMark: Duplicate Task command.
// Kept free of vscode imports so the logic can be unit-tested without
// the VS Code test runner.

import { planInsertItemForDate, isValidDate, formatLocalDate } from './quickAdd';

export interface DuplicatePattern {
  mode: 'days' | 'months';
  interval: number;
}

export interface DuplicateEndCondition {
  kind: 'count' | 'until';
  count?: number;
  until?: string;
}

export const MAX_DUPLICATE_OCCURRENCES = 3650;

const EVERY_REGEX = /^([1-9]\d*)(days?|weeks?|months?)$/;
const DATE_HEADER_REGEX = /^#\s+(\d{4}-\d{1,2}-\d{1,2})/;

export function parseDuplicatePattern(input: string): DuplicatePattern | null {
  const s = input.trim();
  if (s === 'daily') {
    return { mode: 'days', interval: 1 };
  }
  if (s === 'weekly') {
    return { mode: 'days', interval: 7 };
  }
  if (s === 'monthly') {
    return { mode: 'months', interval: 1 };
  }
  if (s.startsWith('every:')) {
    const m = s.substring(6).match(EVERY_REGEX);
    if (!m) {
      return null;
    }
    const num = parseInt(m[1], 10);
    const unit = m[2].replace(/s$/, '');
    if (unit === 'day') {
      return { mode: 'days', interval: num };
    }
    if (unit === 'week') {
      return { mode: 'days', interval: num * 7 };
    }
    if (unit === 'month') {
      return { mode: 'months', interval: num };
    }
  }
  return null;
}

export function parseDuplicateEndCondition(input: string): DuplicateEndCondition | null {
  const s = input.trim();
  if (s.startsWith('count:')) {
    const raw = s.substring(6).trim();
    if (!/^\d+$/.test(raw)) {
      return null;
    }
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) {
      return null;
    }
    return { kind: 'count', count: Math.min(n, MAX_DUPLICATE_OCCURRENCES) };
  }
  if (s.startsWith('until:')) {
    const d = s.substring(6).trim();
    if (!isValidDate(d)) {
      return null;
    }
    return { kind: 'until', until: d };
  }
  return null;
}

export function generateDuplicateDates(
  sourceDate: string,
  pattern: DuplicatePattern,
  end: DuplicateEndCondition
): string[] {
  if (!isValidDate(sourceDate)) {
    return [];
  }
  const origin = toLocalDate(sourceDate);
  const dates: string[] = [];
  const maxIterations = end.kind === 'count'
    ? Math.min(end.count ?? 0, MAX_DUPLICATE_OCCURRENCES)
    : MAX_DUPLICATE_OCCURRENCES;
  const untilDate = end.kind === 'until' && end.until ? toLocalDate(end.until) : undefined;

  for (let i = 1; i < maxIterations; i++) {
    const next = new Date(origin.getFullYear(), origin.getMonth(), origin.getDate());
    if (pattern.mode === 'months') {
      const targetMonth = origin.getMonth() + pattern.interval * i;
      next.setMonth(targetMonth);
      const expectedMonth = ((targetMonth % 12) + 12) % 12;
      if (next.getMonth() !== expectedMonth) {
        next.setDate(0);
      }
    } else {
      next.setDate(origin.getDate() + pattern.interval * i);
    }
    if (untilDate && next > untilDate) {
      break;
    }
    dates.push(formatLocalDate(next));
  }
  return dates;
}

export interface DuplicateInsertion {
  /** Character offset in the original document where `text` should be spliced. */
  offset: number;
  /** Text to splice into the original document at `offset`. */
  text: string;
}

export interface DuplicateResult {
  /**
   * Sorted, merged list of insertions to apply to the original document.
   * Offsets are relative to the original `documentText`, so callers can
   * apply them directly with `TextEditorEdit.insert` (which evaluates
   * positions against the pre-edit document).
   */
  insertions: DuplicateInsertion[];
  insertedDates: string[];
}

export function duplicateTaskAcrossDates(
  documentText: string,
  sourceDate: string,
  taskLine: string,
  pattern: DuplicatePattern,
  end: DuplicateEndCondition,
  eol: string = '\n'
): DuplicateResult {
  const dates = generateDuplicateDates(sourceDate, pattern, end);
  if (dates.length === 0) {
    return { insertions: [], insertedDates: dates };
  }

  const existing: DuplicateInsertion[] = [];
  const newSectionDates: string[] = [];
  for (const date of dates) {
    const plan = planInsertItemForDate(documentText, date, taskLine, eol);
    if (plan.createdNewSection) {
      newSectionDates.push(date);
    } else {
      existing.push({ offset: plan.offset, text: plan.text });
    }
  }

  const combined: DuplicateInsertion[] = [...existing];
  if (newSectionDates.length > 0) {
    combined.push(buildAppendedNewSections(documentText, newSectionDates, taskLine, eol));
  }

  combined.sort((a, b) => a.offset - b.offset);
  const merged: DuplicateInsertion[] = [];
  for (const ins of combined) {
    const last = merged[merged.length - 1];
    if (last && last.offset === ins.offset) {
      last.text += ins.text;
    } else {
      merged.push({ ...ins });
    }
  }
  return { insertions: merged, insertedDates: dates };
}

function buildAppendedNewSections(
  documentText: string,
  newDates: string[],
  taskLine: string,
  eol: string
): DuplicateInsertion {
  const lines = documentText === '' ? [] : documentText.split(/\r?\n/);
  let trimEnd = lines.length;
  while (trimEnd > 0 && lines[trimEnd - 1].trim() === '') {
    trimEnd--;
  }
  const headExists = trimEnd > 0;
  const hasTail = trimEnd < lines.length;
  const sections = newDates.map(d => `# ${d}${eol}${taskLine}`);
  const joined = sections.join(`${eol}${eol}`);

  if (!headExists) {
    return { offset: 0, text: hasTail ? `${joined}${eol}` : joined };
  }
  if (hasTail) {
    let offset = 0;
    for (let i = 0; i < trimEnd; i++) {
      offset += lines[i].length + eol.length;
    }
    return { offset, text: `${eol}${joined}${eol}` };
  }
  return { offset: documentText.length, text: `${eol}${eol}${joined}` };
}

export function findSourceDateForLine(documentText: string, lineIndex: number): string | null {
  const lines = documentText === '' ? [] : documentText.split(/\r?\n/);
  for (let i = Math.min(lineIndex, lines.length - 1); i >= 0; i--) {
    const m = lines[i].match(DATE_HEADER_REGEX);
    if (m) {
      return normalizeDate(m[1]);
    }
  }
  return null;
}

function normalizeDate(raw: string): string {
  const [y, m, d] = raw.split('-');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function toLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
