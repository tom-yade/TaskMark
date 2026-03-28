import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Sample test', () => {
    assert.strictEqual(-1, [1, 2, 3].indexOf(5));
    assert.strictEqual(-1, [1, 2, 3].indexOf(0));
  });

  test('taskmark.openView command is registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('taskmark.openView'), 'taskmark.openView command should be registered');
  });

  test('package.json has keybinding for tmd files', () => {
    const packageJsonPath = path.join(__dirname, '..', '..', '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    assert.ok(packageJson.contributes.keybindings, 'package.json should have keybindings');
    const keybindings: Array<{ command: string; when: string }> = packageJson.contributes.keybindings;
    const openViewBinding = keybindings.find((kb) => kb.command === 'taskmark.openView');
    assert.ok(openViewBinding, 'taskmark.openView should have a keybinding');
    assert.ok(openViewBinding.when.includes('tmd'), 'keybinding should be scoped to tmd files');
  });

  test('package.json has editor/title menu entry for tmd files', () => {
    const packageJsonPath = path.join(__dirname, '..', '..', '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    assert.ok(packageJson.contributes.menus, 'package.json should have menus');
    assert.ok(packageJson.contributes.menus['editor/title'], 'package.json should have editor/title menu');
    const editorTitleMenus: Array<{ command: string; when: string; group: string }> =
      packageJson.contributes.menus['editor/title'];
    const openViewMenu = editorTitleMenus.find((m) => m.command === 'taskmark.openView');
    assert.ok(openViewMenu, 'taskmark.openView should appear in editor/title menu');
    assert.ok(openViewMenu.when.includes('tmd'), 'editor/title menu entry should be scoped to tmd files');
  });

  test('taskmark.openView command has an icon', () => {
    const packageJsonPath = path.join(__dirname, '..', '..', '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    const commands: Array<{ command: string; title: string; icon?: string }> =
      packageJson.contributes.commands;
    const openViewCmd = commands.find((c) => c.command === 'taskmark.openView');
    assert.ok(openViewCmd, 'taskmark.openView command should be defined');
    assert.ok(openViewCmd.icon, 'taskmark.openView command should have an icon for the title bar button');
  });
});
