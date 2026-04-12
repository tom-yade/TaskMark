import * as assert from 'assert';
import { debounce } from '../../utils/debounce';

suite('debounce', () => {
  test('calls the function after the specified delay', done => {
    let callCount = 0;
    const fn = debounce(() => { callCount++; }, 50);

    fn();
    assert.strictEqual(callCount, 0, 'should not be called immediately');

    setTimeout(() => {
      assert.strictEqual(callCount, 1, 'should be called once after delay');
      done();
    }, 100);
  });

  test('calls the function only once when invoked multiple times within the delay', done => {
    let callCount = 0;
    const fn = debounce(() => { callCount++; }, 50);

    fn();
    fn();
    fn();

    setTimeout(() => {
      assert.strictEqual(callCount, 1, 'should be called only once');
      done();
    }, 100);
  });

  test('resets the timer on each call', done => {
    let callCount = 0;
    const fn = debounce(() => { callCount++; }, 50);

    fn();
    setTimeout(() => fn(), 30);
    setTimeout(() => fn(), 60);

    setTimeout(() => {
      assert.strictEqual(callCount, 0, 'should not have fired yet');
    }, 90);

    setTimeout(() => {
      assert.strictEqual(callCount, 1, 'should be called once after final call settles');
      done();
    }, 150);
  });

  test('calls the function with the latest arguments', done => {
    let lastArg: number | undefined;
    const fn = debounce((n: number) => { lastArg = n; }, 50);

    fn(1);
    fn(2);
    fn(3);

    setTimeout(() => {
      assert.strictEqual(lastArg, 3, 'should be called with the last argument');
      done();
    }, 100);
  });

  test('cancel prevents the pending call from firing', done => {
    let callCount = 0;
    const fn = debounce(() => { callCount++; }, 50);

    fn();
    fn.cancel();

    setTimeout(() => {
      assert.strictEqual(callCount, 0, 'should not be called after cancel');
      done();
    }, 100);
  });

  test('can be called normally after cancel', done => {
    let callCount = 0;
    const fn = debounce(() => { callCount++; }, 50);

    fn();
    fn.cancel();
    fn();

    setTimeout(() => {
      assert.strictEqual(callCount, 1, 'should be called once after re-invoking post-cancel');
      done();
    }, 100);
  });
});
