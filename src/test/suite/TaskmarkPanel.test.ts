import * as assert from 'assert';
import {
  TaskMarkUpdateMessage,
  TaskMarkErrorMessage,
  ToggleTaskMessage,
  toggleCheckboxInLine,
  resolveToggleTargetLineIndex
} from '../../messages';

suite('TaskmarkPanel message types', () => {
  test('TaskMarkUpdateMessage has type "update"', () => {
    const msg: TaskMarkUpdateMessage = {
      type: 'update',
      uri: 'file:///test.tmd',
      data: { tagColors: {}, groupTags: {}, days: {} },
      ganttData: { entities: [], lastDateStr: '' },
      warnings: []
    };
    assert.strictEqual(msg.type, 'update');
  });

  test('TaskMarkUpdateMessage includes warnings array', () => {
    const msg: TaskMarkUpdateMessage = {
      type: 'update',
      uri: 'file:///test.tmd',
      data: { tagColors: {}, groupTags: {}, days: {} },
      ganttData: { entities: [], lastDateStr: '' },
      warnings: ["Line 5: invalid date '2026-99-99', skipped"]
    };
    assert.strictEqual(msg.warnings.length, 1);
    assert.ok(msg.warnings[0].includes('2026-99-99'));
  });

  test('TaskMarkErrorMessage has type "parseError" and a message field', () => {
    const msg: TaskMarkErrorMessage = {
      type: 'parseError',
      message: 'unexpected token at line 3'
    };
    assert.strictEqual(msg.type, 'parseError');
    assert.strictEqual(msg.message, 'unexpected token at line 3');
  });

  test('ToggleTaskMessage has type "toggleTask" with uri, rawLine, and sourceLine', () => {
    const msg: ToggleTaskMessage = {
      type: 'toggleTask',
      uri: 'file:///test.tmd',
      rawLine: 4,
      sourceLine: '- [ ] task'
    };
    assert.strictEqual(msg.type, 'toggleTask');
    assert.strictEqual(msg.uri, 'file:///test.tmd');
    assert.strictEqual(msg.rawLine, 4);
    assert.strictEqual(msg.sourceLine, '- [ ] task');
  });
});

suite('resolveToggleTargetLineIndex', () => {
  const lines = ['# 2026-01-01', '- [ ] a', '- [ ] b', '- [ ] c'];
  const get = (i: number) => lines[i];

  test('returns rawLine when the line still matches', () => {
    assert.strictEqual(resolveToggleTargetLineIndex(lines.length, get, 2, '- [ ] b'), 2);
  });

  test('relocates when content moved but source line text is unchanged', () => {
    const shifted = ['intro', '# 2026-01-01', '- [ ] a', '- [ ] b', '- [ ] c'];
    const g = (i: number) => shifted[i];
    assert.strictEqual(resolveToggleTargetLineIndex(shifted.length, g, 2, '- [ ] b'), 3);
  });

  test('returns null when no line matches sourceLine', () => {
    assert.strictEqual(resolveToggleTargetLineIndex(lines.length, get, 2, '- [ ] gone'), null);
  });

  test('picks closest index among duplicate matching lines', () => {
    const dup = ['- [ ] same', 'x', '- [ ] same'];
    const g = (i: number) => dup[i];
    assert.strictEqual(resolveToggleTargetLineIndex(dup.length, g, 0, '- [ ] same'), 0);
    assert.strictEqual(resolveToggleTargetLineIndex(dup.length, g, 1, '- [ ] same'), 0);
    assert.strictEqual(resolveToggleTargetLineIndex(dup.length, g, 2, '- [ ] same'), 2);
  });
});

suite('toggleCheckboxInLine', () => {
  test('flips unchecked task to checked', () => {
    assert.strictEqual(toggleCheckboxInLine('- [ ] foo'), '- [x] foo');
  });

  test('flips checked task to unchecked', () => {
    assert.strictEqual(toggleCheckboxInLine('- [x] foo'), '- [ ] foo');
  });

  test('flips uppercase checked task to unchecked', () => {
    assert.strictEqual(toggleCheckboxInLine('- [X] foo'), '- [ ] foo');
  });

  test('preserves group marker without indentation', () => {
    assert.strictEqual(
      toggleCheckboxInLine('> - [ ] grouped'),
      '> - [x] grouped'
    );
  });

  test('returns null for indented task lines (parser does not accept them)', () => {
    assert.strictEqual(toggleCheckboxInLine('  - [ ] indented'), null);
    assert.strictEqual(toggleCheckboxInLine('  > - [ ] indented group'), null);
  });

  test('preserves content after checkbox including time and tags', () => {
    assert.strictEqual(
      toggleCheckboxInLine('- [ ] 10:00-11:00 Meeting #work'),
      '- [x] 10:00-11:00 Meeting #work'
    );
  });

  test('returns null for a line with no checkbox', () => {
    assert.strictEqual(toggleCheckboxInLine('- plain schedule'), null);
  });

  test('returns null for a date header', () => {
    assert.strictEqual(toggleCheckboxInLine('# 2026-04-18'), null);
  });

  test('returns null for an empty line', () => {
    assert.strictEqual(toggleCheckboxInLine(''), null);
  });

  test('only toggles the leading status checkbox when text contains bracketed content', () => {
    assert.strictEqual(
      toggleCheckboxInLine('- [ ] Check the [ ] box'),
      '- [x] Check the [ ] box'
    );
  });

  test('does not toggle a checked checkbox that appears inside text', () => {
    assert.strictEqual(
      toggleCheckboxInLine('- [ ] see [x] below'),
      '- [x] see [x] below'
    );
  });

  test('returns null when bracket pair is not at the start of the line', () => {
    assert.strictEqual(toggleCheckboxInLine('random [ ] text'), null);
  });

  test('returns null when non-bullet text precedes the checkbox', () => {
    assert.strictEqual(toggleCheckboxInLine('foo - [ ] bar'), null);
  });
});
