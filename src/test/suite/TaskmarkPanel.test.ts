import * as assert from 'assert';
import {
  TaskMarkUpdateMessage,
  TaskMarkErrorMessage,
  ToggleTaskMessage,
  toggleCheckboxInLine
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

  test('ToggleTaskMessage has type "toggleTask" with uri and rawLine', () => {
    const msg: ToggleTaskMessage = {
      type: 'toggleTask',
      uri: 'file:///test.tmd',
      rawLine: 4
    };
    assert.strictEqual(msg.type, 'toggleTask');
    assert.strictEqual(msg.uri, 'file:///test.tmd');
    assert.strictEqual(msg.rawLine, 4);
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

  test('preserves leading indent and group marker', () => {
    assert.strictEqual(
      toggleCheckboxInLine('  > - [ ] nested'),
      '  > - [x] nested'
    );
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
});
