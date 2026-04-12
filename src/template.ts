import * as vscode from 'vscode';

export function getWebviewHtml(scriptUri: vscode.Uri, stylesUri: vscode.Uri, cspSource: string): string {
  return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource};">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>TaskMark</title>
        <link href="${stylesUri}" rel="stylesheet">
      </head>
      <body>
        <div id="tm-parse-error-banner" class="tm-error-banner hidden"></div>
        <div id="tm-warning-banner" class="tm-warning-banner hidden"></div>
        <div class="tm-header">
          <div class="tm-toggle-container">
            <button class="tm-view-toggle active" id="btn-calendar">Calendar</button>
            <button class="tm-view-toggle" id="btn-timeline">Timeline</button>
          </div>
          <div class="tm-month-nav">
             <button class="tm-view-toggle" id="btn-today">Today</button>
             <div class="tm-toggle-container" id="calendar-granularity-toggles">
                <button class="tm-view-toggle active" id="btn-monthly">Monthly</button>
                <button class="tm-view-toggle" id="btn-weekly">Weekly</button>
                <button class="tm-view-toggle" id="btn-daily">Daily</button>
             </div>
             <button id="btn-prev-month">&lt;</button>
             <h2 id="current-month-display"></h2>
             <button id="btn-next-month">&gt;</button>
          </div>
        </div>
        <div class="tm-content" id="tm-content-area">
          <div class="tm-calendar-grid" id="tm-calendar"></div>
          <div class="tm-timeline-view hidden" id="tm-timeline"></div>
        </div>
        <script src="${scriptUri}"></script>
      </body>
      </html>`;
}
