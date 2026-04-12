import * as assert from 'assert';
import { TaskMarkUpdateMessage, TaskMarkErrorMessage } from '../../TaskmarkPanel';

suite('TaskmarkPanel message types', () => {
  test('TaskMarkUpdateMessage has type "update"', () => {
    const msg: TaskMarkUpdateMessage = {
      type: 'update',
      data: { tagColors: {}, days: {} },
      ganttData: { entities: [], lastDateStr: '' },
      warnings: []
    };
    assert.strictEqual(msg.type, 'update');
  });

  test('TaskMarkUpdateMessage includes warnings array', () => {
    const msg: TaskMarkUpdateMessage = {
      type: 'update',
      data: { tagColors: {}, days: {} },
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
});
