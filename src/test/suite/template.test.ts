import * as assert from 'assert';
import { getWebviewHtml } from '../../template';

suite('Template Test Suite', () => {
  function getHtml(): string {
    const fakeUri = { toString: () => 'vscode-resource://fake/script.js' } as any;
    const fakeStyles = { toString: () => 'vscode-resource://fake/style.css' } as any;
    return getWebviewHtml(fakeUri, fakeStyles, 'vscode-resource:');
  }

  test('template contains zoom-in button', () => {
    const html = getHtml();
    assert.ok(html.includes('id="btn-zoom-in"'), 'template should include a zoom-in button with id="btn-zoom-in"');
  });

  test('template contains zoom-out button', () => {
    const html = getHtml();
    assert.ok(html.includes('id="btn-zoom-out"'), 'template should include a zoom-out button with id="btn-zoom-out"');
  });

  test('zoom controls are inside tm-zoom-controls container', () => {
    const html = getHtml();
    assert.ok(html.includes('tm-zoom-controls'), 'template should include tm-zoom-controls container');
    const zoomStart = html.indexOf('tm-zoom-controls');
    const zoomSection = html.slice(zoomStart, zoomStart + 200);
    assert.ok(zoomSection.includes('btn-zoom-in'), 'zoom controls container should include zoom-in button');
    assert.ok(zoomSection.includes('btn-zoom-out'), 'zoom controls container should include zoom-out button');
  });

  test('zoom-in button label is +', () => {
    const html = getHtml();
    const zoomInIdx = html.indexOf('id="btn-zoom-in"');
    assert.ok(zoomInIdx !== -1, 'btn-zoom-in should exist');
    const snippet = html.slice(zoomInIdx, zoomInIdx + 60);
    assert.ok(snippet.includes('+'), 'zoom-in button should have + label');
  });

  test('zoom-out button label is -', () => {
    const html = getHtml();
    const zoomOutIdx = html.indexOf('id="btn-zoom-out"');
    assert.ok(zoomOutIdx !== -1, 'btn-zoom-out should exist');
    const snippet = html.slice(zoomOutIdx, zoomOutIdx + 60);
    assert.ok(snippet.includes('-'), 'zoom-out button should have - label');
  });
});
