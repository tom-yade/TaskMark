import * as assert from 'assert';
import * as vscode from 'vscode';

interface CommandContribution {
  command: string;
  title: string;
  icon?: string;
}

interface KeybindingContribution {
  command: string;
  key: string;
  mac?: string;
  when: string;
}

interface MenuContribution {
  command: string;
  when: string;
  group: string;
}

interface PackageJsonContributes {
  commands: CommandContribution[];
  keybindings: KeybindingContribution[];
  // eslint-disable-next-line @typescript-eslint/naming-convention
  menus: { 'editor/title': MenuContribution[] };
}

interface PackageJson {
  contributes: PackageJsonContributes;
}

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension('Yadecode.taskmark');
    await extension?.activate();
  });

  test('taskmark.openView command is registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('taskmark.openView'), 'taskmark.openView command should be registered');
  });

  suite('package.json contributes', () => {
    let packageJson: PackageJson;

    suiteSetup(() => {
      const extension = vscode.extensions.getExtension('Yadecode.taskmark');
      assert.ok(extension, 'Extension Yadecode.taskmark should be installed');
      packageJson = extension.packageJSON as PackageJson;
    });

    test('taskmark.openView command has an icon', () => {
      const openViewCmd = packageJson.contributes.commands.find((c) => c.command === 'taskmark.openView');
      assert.ok(openViewCmd, 'taskmark.openView command should be defined');
      assert.strictEqual(openViewCmd.icon, '$(open-preview)', 'taskmark.openView command icon should be $(open-preview)');
    });

    test('has keybinding for tmd files', () => {
      const openViewBinding = packageJson.contributes.keybindings.find((kb) => kb.command === 'taskmark.openView');
      assert.ok(openViewBinding, 'taskmark.openView should have a keybinding');
      assert.strictEqual(openViewBinding.key, 'ctrl+shift+v', 'keybinding key should be ctrl+shift+v');
      assert.strictEqual(openViewBinding.mac, 'cmd+shift+v', 'keybinding mac should be cmd+shift+v');
      assert.strictEqual(openViewBinding.when, 'editorLangId == tmd', 'keybinding should be scoped to tmd files');
    });

    test('has editor/title menu entry for tmd files', () => {
      const editorTitleMenus = packageJson.contributes.menus['editor/title'];
      assert.ok(editorTitleMenus, 'package.json should have editor/title menu');
      const openViewMenu = editorTitleMenus.find((m) => m.command === 'taskmark.openView');
      assert.ok(openViewMenu, 'taskmark.openView should appear in editor/title menu');
      assert.strictEqual(openViewMenu.when, 'editorLangId == tmd', 'editor/title menu entry should be scoped to tmd files');
      assert.strictEqual(openViewMenu.group, 'navigation', 'editor/title menu entry should be in the navigation group');
    });
  });
});
