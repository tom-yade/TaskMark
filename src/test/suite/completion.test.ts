import * as assert from 'assert';
import {
  extractDefinedTags,
  REPEAT_OPTION_KEYWORDS,
  AT_KEYWORDS,
  buildTagCompletionItems,
} from '../../completion';

suite('Completion Test Suite', () => {
  test('extractDefinedTags returns tags listed inside the @tags block', () => {
    const text = [
      '@tags',
      '#meeting : #ff0000',
      '#work : #0088ff',
      '@end',
      '',
      '# 2026-03-26',
      '- A #meeting',
    ].join('\n');

    assert.deepStrictEqual(extractDefinedTags(text), ['meeting', 'work']);
  });

  test('extractDefinedTags ignores tags written outside the block', () => {
    const text = [
      '# 2026-03-26',
      '- A #stray',
    ].join('\n');

    assert.deepStrictEqual(extractDefinedTags(text), []);
  });

  test('extractDefinedTags skips lines that are not tag definitions', () => {
    const text = [
      '@tags',
      '#good : #ff0000',
      'invalid line',
      '#also-good : red',
      '@end',
    ].join('\n');

    assert.deepStrictEqual(extractDefinedTags(text), ['good', 'also-good']);
  });

  test('extractDefinedTags merges tag names from taskmark.tagColors when provided', () => {
    const text = '';
    const tagColors: Record<string, string> = { important: '#ff0000', mtg: '#3498db' };
    const tags = extractDefinedTags(text, tagColors);
    assert.deepStrictEqual([...tags].sort(), ['important', 'mtg']);
  });

  test('extractDefinedTags deduplicates tags coming from both sources', () => {
    const text = [
      '@tags',
      '#mtg : #3498db',
      '@end',
    ].join('\n');
    const tagColors: Record<string, string> = { mtg: '#000000', other: '#fff' };
    const tags = extractDefinedTags(text, tagColors);
    assert.strictEqual(tags.length, 2);
    assert.ok(tags.includes('mtg'));
    assert.ok(tags.includes('other'));
  });

  test('REPEAT_OPTION_KEYWORDS includes the documented modifiers', () => {
    for (const k of ['daily', 'weekly', 'monthly', 'every:', 'until:', 'count:', 'except:']) {
      assert.ok(REPEAT_OPTION_KEYWORDS.includes(k), `expected ${k} in REPEAT_OPTION_KEYWORDS`);
    }
  });

  test('AT_KEYWORDS includes repeat / tags / end', () => {
    assert.ok(AT_KEYWORDS.some(k => k.startsWith('repeat')));
    assert.ok(AT_KEYWORDS.includes('tags'));
    assert.ok(AT_KEYWORDS.includes('end'));
  });

  test('buildTagCompletionItems returns one entry per tag with the bare name as label', () => {
    const items = buildTagCompletionItems(['meeting', 'work']);
    assert.strictEqual(items.length, 2);
    assert.deepStrictEqual(items.map(i => i.label), ['meeting', 'work']);
    assert.deepStrictEqual(items.map(i => i.insertText), ['meeting', 'work']);
  });
});
