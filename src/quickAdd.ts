// Pure helpers backing the TaskMark: Add Task / Add Schedule commands.
// Kept free of vscode imports so the logic can be unit-tested without
// the VS Code test runner.

const DATE_HEADER_REGEX = /^#\s+(\d{4}-\d{1,2}-\d{1,2})/;
const FULL_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]?\d|2[0-3]):[0-5]\d$/;

export function formatTaskLine(text: string): string {
  return `- [ ] ${text.trim()}`;
}

export function formatScheduleLine(text: string, startTime: string, endTime?: string): string {
  const trimmed = text.trim();
  const time = endTime ? `${startTime}-${endTime}` : startTime;
  return trimmed ? `- ${time} ${trimmed}` : `- ${time}`;
}

export interface InsertResult {
  newText: string;
  /** Zero-based line index of the inserted item line in `newText`. */
  insertedLineIndex: number;
}

export interface InsertionPlan {
  /** Character offset in `documentText` where `text` should be spliced. */
  offset: number;
  /** Text to splice into `documentText` at `offset`. */
  text: string;
  /** Zero-based line index of the inserted item line in the resulting text. */
  insertedLineIndex: number;
  /** True when the plan also creates a new `# YYYY-MM-DD` section header. */
  createdNewSection: boolean;
}

/**
 * Plan how to insert `itemLine` into the section for `dateStr` without
 * materializing the full new document. Useful when the caller wants to
 * apply the change as a localized edit (e.g. `TextEditorEdit.insert`)
 * rather than replacing the whole document text.
 *
 * Semantics match {@link insertItemForDate}.
 */
export function planInsertItemForDate(
  documentText: string,
  dateStr: string,
  itemLine: string,
  eol: string = '\n'
): InsertionPlan {
  const lines = documentText === '' ? [] : documentText.split(/\r?\n/);
  const sectionStart = findSectionStart(lines, dateStr);
  if (sectionStart === -1) {
    return planNewSectionInsertion(documentText, lines, dateStr, itemLine, eol);
  }
  return planExistingSectionInsertion(documentText, lines, sectionStart, itemLine, eol);
}

/**
 * Insert `itemLine` into the section for `dateStr`.
 * - If a section header for the date exists, append the line after the
 *   last non-empty line within that section.
 * - If no section exists, append a new `# YYYY-MM-DD` section followed
 *   by the item to the end of the document, keeping any trailing blank
 *   lines intact.
 *
 * `dateStr` is matched against the section header in normalized form so
 * a header like `# 2026-3-5` still matches `dateStr = '2026-03-05'`.
 *
 * `eol` controls the line separator used when joining the result. Pass
 * the document's existing EOL (`\n` or `\r\n`) so line endings are not
 * silently converted on Windows-style files.
 */
export function insertItemForDate(
  documentText: string,
  dateStr: string,
  itemLine: string,
  eol: string = '\n'
): InsertResult {
  const plan = planInsertItemForDate(documentText, dateStr, itemLine, eol);
  return {
    newText: documentText.substring(0, plan.offset) + plan.text + documentText.substring(plan.offset),
    insertedLineIndex: plan.insertedLineIndex,
  };
}

function findSectionStart(lines: string[], dateStr: string): number {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(DATE_HEADER_REGEX);
    if (m && normalizeDate(m[1]) === dateStr) {
      return i;
    }
  }
  return -1;
}

function planExistingSectionInsertion(
  documentText: string,
  lines: string[],
  sectionStart: number,
  itemLine: string,
  eol: string
): InsertionPlan {
  let nextSection = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (DATE_HEADER_REGEX.test(lines[i])) {
      nextSection = i;
      break;
    }
  }
  let insertAfter = sectionStart;
  for (let i = sectionStart + 1; i < nextSection; i++) {
    if (lines[i].trim() !== '') {
      insertAfter = i;
    }
  }
  const insertedLineIndex = insertAfter + 1;
  if (insertedLineIndex < lines.length) {
    let offset = 0;
    for (let i = 0; i <= insertAfter; i++) {
      offset += lines[i].length + eol.length;
    }
    return { offset, text: `${itemLine}${eol}`, insertedLineIndex, createdNewSection: false };
  }
  return {
    offset: documentText.length,
    text: `${eol}${itemLine}`,
    insertedLineIndex,
    createdNewSection: false,
  };
}

function planNewSectionInsertion(
  documentText: string,
  lines: string[],
  dateStr: string,
  itemLine: string,
  eol: string
): InsertionPlan {
  let trimEnd = lines.length;
  while (trimEnd > 0 && lines[trimEnd - 1].trim() === '') {
    trimEnd--;
  }
  const headExists = trimEnd > 0;
  const hasTail = trimEnd < lines.length;

  if (!headExists) {
    const text = hasTail
      ? `# ${dateStr}${eol}${itemLine}${eol}`
      : `# ${dateStr}${eol}${itemLine}`;
    return { offset: 0, text, insertedLineIndex: 1, createdNewSection: true };
  }

  let offset = 0;
  for (let i = 0; i < trimEnd; i++) {
    offset += lines[i].length + eol.length;
  }
  if (hasTail) {
    return {
      offset,
      text: `${eol}# ${dateStr}${eol}${itemLine}${eol}`,
      insertedLineIndex: trimEnd + 2,
      createdNewSection: true,
    };
  }
  return {
    offset: documentText.length,
    text: `${eol}${eol}# ${dateStr}${eol}${itemLine}`,
    insertedLineIndex: trimEnd + 2,
    createdNewSection: true,
  };
}

function normalizeDate(raw: string): string {
  const [y, m, d] = raw.split('-');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export function isValidDate(s: string): boolean {
  if (!FULL_DATE_REGEX.test(s)) {
    return false;
  }
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function isValidTime(s: string): boolean {
  return TIME_REGEX.test(s);
}

export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function offsetDate(base: Date, days: number): Date {
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  next.setDate(next.getDate() + days);
  return next;
}
