// Pure logic for the .tmd CompletionItemProvider.
// VS Code wiring lives in extension.ts; this module only deals with strings
// and plain data so it can be unit-tested.

const TAG_DEFINITION_REGEX = /^#([^\s:]+)\s*:/;

export const REPEAT_OPTION_KEYWORDS: string[] = [
  'daily',
  'weekly',
  'monthly',
  'every:',
  'until:',
  'count:',
  'except:',
];

export const AT_KEYWORDS: string[] = [
  'repeat(',
  'tags',
  'end',
];

/**
 * Collect tag names known to the document.
 * Sources: `#name : color` rows inside an `@tags ... @end` block, and the
 * keys of the `taskmark.tagColors` setting if supplied.
 */
export function extractDefinedTags(
  documentText: string,
  tagColorsSetting?: Record<string, string>
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const lines = documentText === '' ? [] : documentText.split(/\r?\n/);
  let inTagsBlock = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '@tags') {
      inTagsBlock = true;
      continue;
    }
    if (line === '@end') {
      inTagsBlock = false;
      continue;
    }
    if (!inTagsBlock) {
      continue;
    }
    const m = line.match(TAG_DEFINITION_REGEX);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      result.push(m[1]);
    }
  }

  if (tagColorsSetting) {
    for (const name of Object.keys(tagColorsSetting)) {
      if (!seen.has(name)) {
        seen.add(name);
        result.push(name);
      }
    }
  }

  return result;
}

export interface TagCompletionItem {
  label: string;
  insertText: string;
}

export function buildTagCompletionItems(tags: string[]): TagCompletionItem[] {
  return tags.map(t => ({ label: t, insertText: t }));
}
