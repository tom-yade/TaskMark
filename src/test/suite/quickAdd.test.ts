import * as assert from 'assert';
import {
  formatTaskLine,
  formatScheduleLine,
  insertItemForDate,
  isValidDate,
  isValidTime,
  formatLocalDate,
  offsetDate,
} from '../../quickAdd';

suite('Quick Add Test Suite', () => {
  test('formatTaskLine wraps text in checkbox syntax', () => {
    assert.strictEqual(formatTaskLine('Buy milk'), '- [ ] Buy milk');
  });

  test('formatScheduleLine produces start-end form when endTime is set', () => {
    assert.strictEqual(
      formatScheduleLine('Meeting', '09:00', '10:00'),
      '- 09:00-10:00 Meeting'
    );
  });

  test('formatScheduleLine produces start-only form when endTime is omitted', () => {
    assert.strictEqual(
      formatScheduleLine('Lunch', '12:00'),
      '- 12:00 Lunch'
    );
  });

  test('formatScheduleLine trims whitespace around the body', () => {
    assert.strictEqual(
      formatScheduleLine('  Meeting  ', '09:00', '10:00'),
      '- 09:00-10:00 Meeting'
    );
  });

  test('insertItemForDate inserts a line into the existing date section', () => {
    const text = [
      '# 2026-03-26',
      '- 09:00 Existing',
      '',
      '# 2026-03-27',
      '- 10:00 Other',
    ].join('\n');

    const { newText, insertedLineIndex } = insertItemForDate(text, '2026-03-26', '- [ ] New');

    assert.strictEqual(insertedLineIndex, 2);
    assert.strictEqual(
      newText,
      [
        '# 2026-03-26',
        '- 09:00 Existing',
        '- [ ] New',
        '',
        '# 2026-03-27',
        '- 10:00 Other',
      ].join('\n')
    );
  });

  test('insertItemForDate creates a new section when the date is missing', () => {
    const text = [
      '# 2026-03-26',
      '- 09:00 Existing',
    ].join('\n');

    const { newText, insertedLineIndex } = insertItemForDate(text, '2026-03-30', '- [ ] New');

    assert.strictEqual(
      newText,
      [
        '# 2026-03-26',
        '- 09:00 Existing',
        '',
        '# 2026-03-30',
        '- [ ] New',
      ].join('\n')
    );
    assert.strictEqual(insertedLineIndex, 4);
  });

  test('insertItemForDate handles empty documents', () => {
    const { newText, insertedLineIndex } = insertItemForDate('', '2026-03-30', '- [ ] New');

    assert.strictEqual(newText, ['# 2026-03-30', '- [ ] New'].join('\n'));
    assert.strictEqual(insertedLineIndex, 1);
  });

  test('insertItemForDate keeps trailing empty lines after the new section', () => {
    const text = '# 2026-03-26\n- A\n\n\n';
    const { newText } = insertItemForDate(text, '2026-03-30', '- [ ] B');
    assert.ok(newText.endsWith('\n\n\n'));
    assert.ok(newText.includes('# 2026-03-30\n- [ ] B'));
  });

  test('insertItemForDate matches sections written with single-digit month/day', () => {
    const text = '# 2026-3-5\n- A';
    const { newText } = insertItemForDate(text, '2026-03-05', '- [ ] B');
    assert.strictEqual(newText, '# 2026-3-5\n- A\n- [ ] B');
  });

  test('isValidDate accepts well-formed YYYY-MM-DD', () => {
    assert.strictEqual(isValidDate('2026-03-26'), true);
    assert.strictEqual(isValidDate('2026-12-31'), true);
  });

  test('isValidDate rejects malformed and impossible dates', () => {
    assert.strictEqual(isValidDate('2026-13-01'), false);
    assert.strictEqual(isValidDate('2026-02-30'), false);
    assert.strictEqual(isValidDate('2026/03/26'), false);
    assert.strictEqual(isValidDate(''), false);
    assert.strictEqual(isValidDate('not-a-date'), false);
  });

  test('isValidTime accepts HH:mm in 24-hour range', () => {
    assert.strictEqual(isValidTime('00:00'), true);
    assert.strictEqual(isValidTime('09:30'), true);
    assert.strictEqual(isValidTime('23:59'), true);
    assert.strictEqual(isValidTime('9:30'), true);
  });

  test('isValidTime rejects out-of-range values', () => {
    assert.strictEqual(isValidTime('24:00'), false);
    assert.strictEqual(isValidTime('12:60'), false);
    assert.strictEqual(isValidTime('9-30'), false);
    assert.strictEqual(isValidTime(''), false);
  });

  test('formatLocalDate emits zero-padded YYYY-MM-DD from a Date', () => {
    assert.strictEqual(formatLocalDate(new Date(2026, 2, 5)), '2026-03-05');
    assert.strictEqual(formatLocalDate(new Date(2026, 11, 31)), '2026-12-31');
  });

  test('offsetDate adds days without mutating the input', () => {
    const base = new Date(2026, 2, 30);
    const next = offsetDate(base, 1);
    assert.strictEqual(formatLocalDate(next), '2026-03-31');
    assert.strictEqual(formatLocalDate(offsetDate(base, 2)), '2026-04-01');
    assert.strictEqual(formatLocalDate(base), '2026-03-30');
  });
});
