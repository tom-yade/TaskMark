import * as assert from 'assert';
import { TaskMarkUpdateMessage, TaskMarkErrorMessage } from '../../TaskmarkPanel';

suite('TaskmarkPanel message types', () => {
  test('TaskMarkUpdateMessage has type "update"', () => {
    const msg: TaskMarkUpdateMessage = {
      type: 'update',
      data: { tagColors: {}, days: {} },
      ganttData: { entities: [], lastDateStr: '' }
    };
    assert.strictEqual(msg.type, 'update');
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
