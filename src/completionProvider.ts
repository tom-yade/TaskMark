import * as vscode from 'vscode';
import {
  AT_KEYWORDS,
  REPEAT_OPTION_KEYWORDS,
  extractDefinedTags,
} from './completion';

const TMD_SELECTOR: vscode.DocumentSelector = { language: 'tmd' };

export function registerCompletionProviders(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      TMD_SELECTOR,
      new TmdHashCompletionProvider(),
      '#'
    ),
    vscode.languages.registerCompletionItemProvider(
      TMD_SELECTOR,
      new TmdAtCompletionProvider(),
      '@'
    ),
    vscode.languages.registerCompletionItemProvider(
      TMD_SELECTOR,
      new TmdRepeatOptionProvider(),
      '(',
      ',',
      ' '
    ),
  );
}

class TmdHashCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] {
    const linePrefix = document.lineAt(position).text.slice(0, position.character);
    if (!/(?:^|\s)#[^\s#]*$/.test(linePrefix)) {
      return [];
    }
    const tagColors = vscode.workspace
      .getConfiguration('taskmark')
      .get<Record<string, string>>('tagColors', {});
    const tags = extractDefinedTags(document.getText(), tagColors);
    return tags.map(name => {
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Value);
      item.insertText = name;
      item.detail = 'TaskMark tag';
      return item;
    });
  }
}

class TmdAtCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] {
    const linePrefix = document.lineAt(position).text.slice(0, position.character);
    if (!/(?:^|\s)@[A-Za-z]*$/.test(linePrefix)) {
      return [];
    }
    return AT_KEYWORDS.map(keyword => {
      const label = keyword.endsWith('(') ? keyword.slice(0, -1) : keyword;
      const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Keyword);
      if (keyword === 'repeat(') {
        const snippet = new vscode.SnippetString('repeat(${1|daily,weekly,monthly|})');
        item.insertText = snippet;
        item.detail = '@repeat(...) modifier';
      } else if (keyword === 'tags') {
        const snippet = new vscode.SnippetString('tags\n#${1:Tag} : ${2:#color}\n@end');
        item.insertText = snippet;
        item.detail = '@tags ... @end block';
      } else {
        item.insertText = keyword;
        item.detail = `@${keyword}`;
      }
      return item;
    });
  }
}

class TmdRepeatOptionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] {
    const lineText = document.lineAt(position).text;
    const before = lineText.slice(0, position.character);
    const open = before.lastIndexOf('@repeat(');
    if (open === -1) {
      return [];
    }
    const close = before.indexOf(')', open);
    if (close !== -1) {
      return [];
    }
    return REPEAT_OPTION_KEYWORDS.map(keyword => {
      const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.EnumMember);
      item.insertText = keyword;
      item.detail = '@repeat option';
      return item;
    });
  }
}
