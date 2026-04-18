(function () {
  // ─── Constants ───────────────────────────────────────────────
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MS_PER_MINUTE = 60000;
  const MS_PER_HOUR = 3600000;
  const MS_PER_DAY = 24 * MS_PER_HOUR;
  const GANTT_ROW_HEIGHT = 40;
  const GANTT_HEADER_HEIGHT = 50;
  const GANTT_MIN_BAR_WIDTH = 12;
  const GANTT_LABEL_OFFSET_X = 6;
  const GANTT_LABEL_OFFSET_Y = 4;
  const GANTT_ZOOM_IN_FACTOR = 1.25;
  const GANTT_ZOOM_OUT_FACTOR = 0.8;

  // ─── State ───────────────────────────────────────────────────
  let baseView = 'calendar'; // 'calendar' | 'timeline'
  let activeView = 'monthly'; // 'monthly' | 'weekly' | 'daily'
  let currentDate = new Date();
  let currentUri = null;
  let currentTaskMarkData = null;
  let currentGanttData = null;
  let rangeItemIndex = null; // Pre-built index: date string -> range items spanning that date
  let ganttZoom = 1; // 1 = 100px per day
  let expandedGroups = new Set();
  let isPanning = false;
  let hasDragged = false;
  let startPanX = 0;
  let startPanY = 0;
  let initialScrollL = 0;
  let initialScrollT = 0;

  // ─── DOM References ──────────────────────────────────────────
  const errorBanner = document.getElementById('tm-parse-error-banner');
  const warningBanner = document.getElementById('tm-warning-banner');
  const btnCalendar = document.getElementById('btn-calendar');
  const btnTimeline = document.getElementById('btn-timeline');
  const btnMonthly = document.getElementById('btn-monthly');
  const btnWeekly = document.getElementById('btn-weekly');
  const btnDaily = document.getElementById('btn-daily');
  const btnToday = document.getElementById('btn-today');
  const btnPrevMonth = document.getElementById('btn-prev-month');
  const btnNextMonth = document.getElementById('btn-next-month');
  const viewCalendar = document.getElementById('tm-calendar');
  const viewTimeline = document.getElementById('tm-timeline');
  const monthNav = document.querySelector('.tm-month-nav');
  const monthDisplay = document.getElementById('current-month-display');
  const zoomControls = document.getElementById('tm-zoom-controls');
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');

  // ─── Utility Functions ───────────────────────────────────────

  /** Format date parts into 'YYYY-MM-DD' string */
  function formatDateStr(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  /** Parse 'YYYY-MM-DD' string into a local midnight Date */
  function parseLocalDate(dateStr) {
    const p = dateStr.split('-');
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }

  /** Get today's date as 'YYYY-MM-DD' */
  function getTodayStr() {
    const d = new Date();
    return formatDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  /** Return CSS class name for day-of-week index (0=Sun, 6=Sat) */
  function getDayClass(dayOfWeek) {
    if (dayOfWeek === 0) return 'sun';
    if (dayOfWeek === 6) return 'sat';
    return '';
  }

  // Keep in sync with VALID_CSS_COLOR_REGEX in src/parser.ts
  const VALID_CSS_COLOR_RE = /^(?:#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|(?:rgb|hsl)a?\(\s*\d[\d.]*%?(?:\s*[,/\s]\s*\d[\d.]*%?){2,3}\s*\)|[a-zA-Z]{1,30})$/;

  /** Deterministic color from tag name, or explicit color from map */
  function getTagColor(tagName, tagColorsMap) {
    if (tagColorsMap && tagColorsMap[tagName]) {
      if (VALID_CSS_COLOR_RE.test(tagColorsMap[tagName])) {
        return tagColorsMap[tagName];
      }
      console.warn(`[TaskMark] Invalid color value for tag "${tagName}": "${tagColorsMap[tagName]}", using fallback`);
    }
    let hash = 0;
    for (let i = 0; i < tagName.length; i++) {
      hash = tagName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const absHash = Math.abs(hash);
    const h = absHash % 360;
    const s = 60 + (absHash % 20);
    const l = 45 + (absHash % 15);
    return `hsl(${h}, ${s}%, ${l}%)`;
  }

  /** Get border color from the first tag, falling back to accent */
  function getItemBorderColor(tags, tagColorsMap) {
    if (tags && tags.length > 0) {
      return getTagColor(tags[0], tagColorsMap);
    }
    return 'var(--tm-accent)';
  }

  /** Build HTML for a list of tag pills */
  function createTagPillsHtml(tags, tagColorsMap) {
    if (!tags || tags.length === 0) return '';
    return tags.map(t => {
      const color = getTagColor(t, tagColorsMap);
      return `<span class="tm-tag" style="background-color: ${color}">${escapeHtml(t)}</span>`;
    }).join('');
  }

  /** Escape special HTML characters to prevent XSS when embedding user content */
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Convert 'H:MM' time string to total minutes for numeric comparison */
  function timeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':');
    return parseInt(h, 10) * 60 + parseInt(m, 10);
  }

  /** Items with a date range (endDate) don't use a time field */
  function itemHasTime(item) {
    return !!(item.time && !item.endDate);
  }

  /** End-of-day timestamp for a 'YYYY-MM-DD' string (inclusive).
   *  Uses setDate(+1) instead of adding MS_PER_DAY to handle DST correctly. */
  function getEndOfDayMs(dateStr) {
    const d = parseLocalDate(dateStr);
    d.setDate(d.getDate() + 1);
    return d.getTime() - 1;
  }

  /** Build an index mapping each date to range items that span into it.
   *  Called once per data update so getDayData can do O(1) lookups. */
  function buildRangeItemIndex(taskMarkData) {
    if (!taskMarkData) return {};
    const index = {};
    Object.entries(taskMarkData.days).forEach(([startDate, data]) => {
      data.items.forEach(item => {
        if (!item.endDate || item.endDate <= startDate) return;
        // Add this item to every date after startDate through endDate
        const start = parseLocalDate(startDate);
        const end = parseLocalDate(item.endDate);
        const cursor = new Date(start);
        cursor.setDate(cursor.getDate() + 1);
        while (cursor <= end) {
          const key = formatDateStr(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
          if (!index[key]) index[key] = [];
          index[key].push(item);
          cursor.setDate(cursor.getDate() + 1);
        }
      });
    });
    return index;
  }

  // ─── Message Handling ────────────────────────────────────────

  window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'update') {
      if (message.uri && message.uri !== currentUri) {
        currentUri = message.uri;
        expandedGroups = new Set();
        ganttZoom = 1;
        if (viewTimeline) {
          viewTimeline.scrollLeft = 0;
          viewTimeline.scrollTop = 0;
        }
      }
      currentTaskMarkData = message.data;
      currentGanttData = message.ganttData;
      rangeItemIndex = buildRangeItemIndex(currentTaskMarkData);
      if (errorBanner) {
        errorBanner.textContent = '';
        errorBanner.classList.add('hidden');
      }
      if (warningBanner) {
        if (message.warnings && message.warnings.length > 0) {
          warningBanner.textContent = message.warnings.join('\n');
          warningBanner.classList.remove('hidden');
        } else {
          warningBanner.textContent = '';
          warningBanner.classList.add('hidden');
        }
      }
      render();
    } else if (message.type === 'parseError') {
      if (errorBanner) {
        errorBanner.textContent = `Parse error: ${message.message}`;
        errorBanner.classList.remove('hidden');
      }
      if (warningBanner) {
        warningBanner.textContent = '';
        warningBanner.classList.add('hidden');
      }
    }
  });

  // ─── UI State Management ─────────────────────────────────────

  function updateActiveButtons() {
    [btnCalendar, btnTimeline].forEach(b => b?.classList.remove('active'));
    if (baseView === 'calendar') btnCalendar?.classList.add('active');
    if (baseView === 'timeline') btnTimeline?.classList.add('active');

    [btnMonthly, btnWeekly, btnDaily].forEach(b => b?.classList.remove('active'));
    if (activeView === 'monthly') btnMonthly?.classList.add('active');
    if (activeView === 'weekly') btnWeekly?.classList.add('active');
    if (activeView === 'daily') btnDaily?.classList.add('active');

    if (baseView === 'timeline') {
      viewTimeline.classList.remove('hidden');
      viewCalendar.classList.add('hidden');
      monthNav?.classList.add('hidden');
      zoomControls.classList.remove('hidden');
    } else {
      viewTimeline.classList.add('hidden');
      viewCalendar.classList.remove('hidden');
      monthNav?.classList.remove('hidden');
      zoomControls.classList.add('hidden');
    }
  }

  function switchView(newBaseView, newActiveView) {
    baseView = newBaseView;
    if (newActiveView) activeView = newActiveView;
    updateActiveButtons();
    render();
  }

  // ─── Event Listeners ─────────────────────────────────────────

  btnCalendar?.addEventListener('click', () => switchView('calendar'));
  btnTimeline?.addEventListener('click', () => switchView('timeline'));
  btnMonthly?.addEventListener('click', () => switchView('calendar', 'monthly'));
  btnWeekly?.addEventListener('click', () => switchView('calendar', 'weekly'));
  btnDaily?.addEventListener('click', () => switchView('calendar', 'daily'));

  btnToday?.addEventListener('click', () => {
    currentDate = new Date();
    render();
  });

  viewCalendar?.addEventListener('click', (e) => {
    const wrap = e.target.closest('.clickable-date');
    if (wrap && wrap.dataset.date) {
      currentDate = parseLocalDate(wrap.dataset.date);
      switchView('calendar', 'daily');
    }
  });

  function stopPanning() {
    if (!isPanning) return;
    isPanning = false;
    document.body.style.userSelect = '';
    viewTimeline.style.cursor = 'grab';
  }

  // Gantt panning
  viewTimeline?.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isPanning = true;
    hasDragged = false;
    startPanX = e.clientX;
    startPanY = e.clientY;
    initialScrollL = viewTimeline.scrollLeft;
    initialScrollT = viewTimeline.scrollTop;
    viewTimeline.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none'; // suppress text selection during drag only
  });
  window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    // Button released outside the window: end panning on the next in-window mousemove
    if (!(e.buttons & 1)) {
      stopPanning();
      return;
    }
    if (!hasDragged) {
      const dx = e.clientX - startPanX;
      const dy = e.clientY - startPanY;
      if (dx * dx + dy * dy > 9) hasDragged = true;
    }
    viewTimeline.scrollLeft = initialScrollL - (e.clientX - startPanX);
    viewTimeline.scrollTop = initialScrollT - (e.clientY - startPanY);
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) stopPanning();
  });
  window.addEventListener('blur', stopPanning);

  // Gantt zoom
  function applyZoom(factor) {
    ganttZoom *= factor;
    renderTimeline();
  }

  viewTimeline.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      applyZoom(e.deltaY < 0 ? GANTT_ZOOM_IN_FACTOR : GANTT_ZOOM_OUT_FACTOR);
    }
  });

  btnZoomIn.addEventListener('click', () => applyZoom(GANTT_ZOOM_IN_FACTOR));
  btnZoomOut.addEventListener('click', () => applyZoom(GANTT_ZOOM_OUT_FACTOR));

  // Date navigation
  function navigateDate(direction) {
    if (baseView === 'timeline' || activeView === 'monthly') {
      const y = currentDate.getFullYear();
      const m = currentDate.getMonth() + direction;
      // Clamp day to last day of target month to avoid overflow (e.g. Jan 31 + 1 month = Feb 28)
      const maxDay = new Date(y, m + 1, 0).getDate();
      const d = Math.min(currentDate.getDate(), maxDay);
      currentDate = new Date(y, m, d);
    } else if (activeView === 'weekly') {
      currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 7 * direction);
    } else if (activeView === 'daily') {
      currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + direction);
    }
    render();
  }

  btnPrevMonth?.addEventListener('click', () => navigateDate(-1));
  btnNextMonth?.addEventListener('click', () => navigateDate(1));

  // ─── Main Render ─────────────────────────────────────────────

  function render() {
    if (!currentTaskMarkData || !currentGanttData) return;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const date = currentDate.getDate();

    // Update header date display
    if (baseView === 'timeline' || activeView === 'monthly') {
      monthDisplay.textContent = `${year}/${month}`;
    } else if (activeView === 'weekly') {
      const weekStart = new Date(currentDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      monthDisplay.textContent =
        `${weekStart.getMonth() + 1}/${weekStart.getDate()} - ${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`;
    } else if (activeView === 'daily') {
      monthDisplay.textContent = `${year}/${month}/${date}`;
    }

    // Dispatch to view renderer
    if (baseView === 'timeline') {
      renderTimeline();
    } else if (activeView === 'monthly') {
      renderCalendar(year, month - 1);
    } else if (activeView === 'weekly') {
      renderWeekly();
    } else if (activeView === 'daily') {
      renderDaily();
    }
  }

  // ─── Calendar Items HTML ─────────────────────────────────────

  function createItemsHtml(items, tagColorsMap, isMonthly = false, dateStr = '') {
    if (!items || items.length === 0) return '';

    const sortedItems = [...items].sort((a, b) => {
      const timeA = (a.type === 'schedule' && a.time) ? a.time.split('-')[0].trim() : null;
      const timeB = (b.type === 'schedule' && b.time) ? b.time.split('-')[0].trim() : null;

      if (timeA && timeB) {
        const diff = timeToMinutes(timeA) - timeToMinutes(timeB);
        return diff !== 0 ? diff : a.rawLine - b.rawLine;
      }
      if (timeA && !timeB) return -1;
      if (!timeA && timeB) return 1;
      return a.rawLine - b.rawLine;
    });

    const grouped = {};
    const standalone = [];

    sortedItems.forEach(item => {
      if (item.group) {
        if (!grouped[item.group]) grouped[item.group] = [];
        grouped[item.group].push(item);
      } else {
        standalone.push(item);
      }
    });

    const renderItem = (item) => {
      const tagsHtml = createTagPillsHtml(item.tags, tagColorsMap);

      const cbHtml = item.type === 'task' ? '<span class="tm-checkbox"></span>' : '';
      const timeHtml = itemHasTime(item) ? `<span class="tm-time">${item.time}</span>` : '';
      const compactClass = isMonthly ? ' compact' : '';
      const classNames = `tm-item ${item.type} ${item.status || ''}${compactClass}`;
      const borderColor = getItemBorderColor(item.tags, tagColorsMap);

      return `<div class="${classNames}" style="border-left-color: ${borderColor}">
        ${cbHtml}
        <div class="tm-item-body">${timeHtml} <span class="tm-item-text">${escapeHtml(item.text)}</span> ${tagsHtml}</div>
      </div>`;
    };

    const getGroupBorderColor = (gName, itemList) => {
      if (gName && currentTaskMarkData.groupTags) {
        const lookupDates = new Set();
        if (dateStr) lookupDates.add(dateStr);
        itemList.forEach(i => { if (i.startDate) lookupDates.add(i.startDate); });
        for (const d of lookupDates) {
          const gTags = currentTaskMarkData.groupTags[`${d}::${gName}`];
          if (gTags && gTags.length > 0) return getTagColor(gTags[0], tagColorsMap);
        }
        return 'var(--tm-accent)';
      }
      const firstTagItem = itemList.find(i => i.tags && i.tags.length > 0);
      return firstTagItem ? getTagColor(firstTagItem.tags[0], tagColorsMap) : 'var(--tm-accent)';
    };

    const renderTaskSummary = (itemList, titleFallback, gName = '') => {
      const tasks = itemList.filter(i => i.type === 'task');
      const schedules = itemList.filter(i => i.type === 'schedule');
      let outHtml = schedules.map(renderItem).join('');

      if (tasks.length > 0) {
        const doneCount = tasks.filter(t => t.status === 'done').length;
        const totalCount = tasks.length;
        const isAllDone = doneCount === totalCount;
        const borderColor = getGroupBorderColor(gName, itemList);
        const classNames = `tm-item task compact ${isAllDone ? 'done' : ''}`;

        outHtml += `<div class="${classNames}" style="border-left-color: ${borderColor}">
          <span class="tm-checkbox"></span>
          <div class="tm-item-body"><span class="tm-item-text"><strong>${doneCount}/${totalCount}</strong> ${titleFallback}</span></div>
        </div>`;
      }
      return outHtml;
    };

    let html = '<div class="tm-items-list">';

    Object.keys(grouped).forEach(gName => {
      const groupBorderColor = getGroupBorderColor(gName, grouped[gName]);
      const groupContent = isMonthly
        ? renderTaskSummary(grouped[gName], 'Tasks', gName)
        : grouped[gName].map(renderItem).join('');
      html += `<div class="tm-group-box" style="border-left-color: ${groupBorderColor}">
        <div class="tm-group-title">${escapeHtml(gName)}</div>
        ${groupContent}
      </div>`;
    });

    html += standalone.map(renderItem).join('');

    html += '</div>';
    return html;
  }

  // ─── Shared Calendar Helpers ─────────────────────────────────

  /** Render the Sun–Sat day-of-week header row */
  function renderDayHeaders(container) {
    DAY_NAMES.forEach((name, i) => {
      const el = document.createElement('div');
      el.className = `tm-day-header ${getDayClass(i)}`;
      el.textContent = name;
      container.appendChild(el);
    });
  }

  /** Create a single calendar cell */
  function createCell(dayNo, isOtherMonth, isToday, dayOfWeek, dStr) {
    const el = document.createElement('div');
    el.className = [
      'tm-cal-cell',
      isOtherMonth ? 'other-month' : '',
      isToday ? 'today' : '',
      getDayClass(dayOfWeek),
      dStr ? 'clickable-date' : ''
    ].filter(Boolean).join(' ');

    if (dStr) el.dataset.date = dStr;
    if (dayNo !== '') {
      el.innerHTML = `<div class="tm-cal-date-wrap"><span class="tm-cal-date">${dayNo}</span></div>`;
    }
    return el;
  }

  /** Get day data from the current dataset, including range items that span into dStr */
  function getDayData(dStr) {
    const dayData = currentTaskMarkData.days[dStr] || { items: [] };
    const spanning = rangeItemIndex && rangeItemIndex[dStr];
    if (!spanning || spanning.length === 0) return dayData;
    return { ...dayData, items: [...dayData.items, ...spanning] };
  }

  // ─── Multi-Day Band Rendering ────────────────────────────────

  /** Collect all range items from the dataset (items with endDate).
   *  Grouped range items are merged into one representative entry per group,
   *  using the group name as the label and the widest date span across the group. */
  function collectAllRangeItems() {
    const rangeItems = [];
    const groupMerged = Object.create(null);

    Object.entries(currentTaskMarkData.days).forEach(([date, dayData]) => {
      dayData.items.forEach(item => {
        if (!item.endDate) return;

        if (item.group) {
          const key = item.group;
          if (!groupMerged[key]) {
            const groupTags = currentTaskMarkData.groupTags && currentTaskMarkData.groupTags[`${date}::${item.group}`];
            const tags = groupTags || [];
            groupMerged[key] = { date, item: { ...item, text: item.group, tags } };
          } else {
            const existing = groupMerged[key];
            if (date < existing.date) { existing.date = date; }
            if (item.endDate > existing.item.endDate) { existing.item.endDate = item.endDate; }
          }
        } else {
          rangeItems.push({ date, item });
        }
      });
    });

    Object.values(groupMerged).forEach(({ date, item }) => rangeItems.push({ date, item }));
    return rangeItems;
  }

  /** Count day difference between two local-midnight Date objects (DST-safe via Math.round). */
  function dayDiff(fromDate, toDate) {
    return Math.round((toDate - fromDate) / MS_PER_DAY);
  }

  /**
   * Collect range events overlapping [weekStartStr, weekEndStr] and assign band rows
   * to prevent visual overlap. Returns an array of band descriptors.
   */
  function collectWeekBands(weekStartStr, weekEndStr, rangeItems) {
    const weekStartDate = parseLocalDate(weekStartStr);
    const events = [];

    rangeItems.forEach(({ date, item }) => {
      if (date > weekEndStr || item.endDate < weekStartStr) return;

      const clippedStart = date < weekStartStr ? weekStartStr : date;
      const clippedEnd = item.endDate > weekEndStr ? weekEndStr : item.endDate;

      const colStart = dayDiff(weekStartDate, parseLocalDate(clippedStart)) + 1;
      const colEnd = dayDiff(weekStartDate, parseLocalDate(clippedEnd)) + 2;

      events.push({
        item,
        colStart,
        colEnd,
        isStart: date >= weekStartStr,
        isEnd: item.endDate <= weekEndStr,
      });
    });

    // Sort by start column, then longer spans first for stable top-down placement
    events.sort((a, b) => a.colStart - b.colStart || (b.colEnd - b.colStart) - (a.colEnd - a.colStart));

    // Assign band rows to avoid visual overlap within the same week
    const rowEnds = [];
    events.forEach(event => {
      let assigned = false;
      for (let r = 0; r < rowEnds.length; r++) {
        if (rowEnds[r] <= event.colStart) {
          event.bandRow = r;
          rowEnds[r] = event.colEnd;
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        event.bandRow = rowEnds.length;
        rowEnds.push(event.colEnd);
      }
    });

    return events;
  }

  /**
   * Build a per-column map from week band data.
   * Returns { map: { colIndex -> [{bandRow, isStart, isEnd, item}] }, maxRow: number }
   */
  function buildCellBandMap(weekBands) {
    const map = {};
    let maxRow = -1;
    weekBands.forEach(band => {
      if (band.bandRow > maxRow) maxRow = band.bandRow;
      for (let col = band.colStart; col < band.colEnd; col++) {
        if (!map[col]) map[col] = [];
        map[col].push({
          bandRow: band.bandRow,
          isStart: band.isStart && col === band.colStart,
          isEnd: band.isEnd && col === band.colEnd - 1,
          showLabel: col === band.colStart,
          item: band.item
        });
      }
    });
    return { map, maxRow };
  }

  /** Create HTML for band segments inside a single cell */
  function createCellBandsHtml(cellBands, maxRow, tagColorsMap) {
    if (maxRow < 0 || !cellBands || cellBands.length === 0) return '';

    const rowMap = {};
    cellBands.forEach(b => { rowMap[b.bandRow] = b; });

    let html = '<div class="tm-cell-bands">';
    for (let r = 0; r <= maxRow; r++) {
      const band = rowMap[r];
      if (band) {
        const classes = ['tm-cell-band'];
        if (band.isStart) classes.push('band-start');
        if (band.isEnd) classes.push('band-end');
        const color = getItemBorderColor(band.item.tags, tagColorsMap);
        const text = band.showLabel ? escapeHtml(band.item.text) : '';
        html += `<div class="${classes.join(' ')}" style="background-color: ${color}">${text}</div>`;
      } else {
        html += '<div class="tm-cell-band-spacer"></div>';
      }
    }
    html += '</div>';
    return html;
  }

  // ─── Calendar Views ──────────────────────────────────────────

  function renderCalendar(year, monthIndex) {
    viewCalendar.innerHTML = '';
    viewCalendar.className = 'tm-calendar-grid monthly';
    renderDayHeaders(viewCalendar);

    const firstDay = new Date(year, monthIndex, 1);
    const lastDay = new Date(year, monthIndex + 1, 0);
    const startPadding = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const todayStr = getTodayStr();
    const tagColors = currentTaskMarkData.tagColors;

    // Build full cell list (prev padding + current month + next padding) as complete weeks
    const cells = [];

    const prevDateObj = new Date(year, monthIndex, 0);
    for (let i = startPadding - 1; i >= 0; i--) {
      const d = prevDateObj.getDate() - i;
      const dObj = new Date(prevDateObj.getFullYear(), prevDateObj.getMonth(), d);
      cells.push({
        dayNo: d,
        isOtherMonth: true,
        isToday: false,
        dayOfWeek: dObj.getDay(),
        dStr: formatDateStr(dObj.getFullYear(), dObj.getMonth() + 1, d)
      });
    }

    for (let i = 1; i <= totalDays; i++) {
      const dStr = formatDateStr(year, monthIndex + 1, i);
      cells.push({
        dayNo: i,
        isOtherMonth: false,
        isToday: dStr === todayStr,
        dayOfWeek: new Date(year, monthIndex, i).getDay(),
        dStr
      });
    }

    const totalCells = startPadding + totalDays;
    const endPadding = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    const nextDateObj = new Date(year, monthIndex + 1, 1);
    for (let i = 1; i <= endPadding; i++) {
      const dObj = new Date(nextDateObj.getFullYear(), nextDateObj.getMonth(), i);
      cells.push({
        dayNo: i,
        isOtherMonth: true,
        isToday: false,
        dayOfWeek: dObj.getDay(),
        dStr: formatDateStr(dObj.getFullYear(), dObj.getMonth() + 1, i)
      });
    }

    // Render week by week: band segments inside each cell
    const rangeItems = collectAllRangeItems();
    const numWeeks = cells.length / 7;
    for (let w = 0; w < numWeeks; w++) {
      const weekCells = cells.slice(w * 7, (w + 1) * 7);
      const weekStartStr = weekCells[0].dStr;
      const weekEndStr = weekCells[6].dStr;

      const weekBands = collectWeekBands(weekStartStr, weekEndStr, rangeItems);
      const { map: bandMap, maxRow } = buildCellBandMap(weekBands);

      weekCells.forEach((cell, i) => {
        const colIndex = i + 1;
        const dayItems = (currentTaskMarkData.days[cell.dStr] || { items: [] }).items;
        const regularItems = dayItems.filter(item => !item.endDate);
        const el = createCell(cell.dayNo, cell.isOtherMonth, cell.isToday, cell.dayOfWeek, cell.dStr);
        el.innerHTML += createCellBandsHtml(bandMap[colIndex], maxRow, tagColors);
        el.innerHTML += createItemsHtml(regularItems, tagColors, true, cell.dStr);
        viewCalendar.appendChild(el);
      });
    }
  }

  function renderWeekly() {
    viewCalendar.innerHTML = '';
    viewCalendar.className = 'tm-calendar-grid weekly';
    renderDayHeaders(viewCalendar);

    const d = new Date(currentDate);
    d.setDate(d.getDate() - d.getDay());
    const todayStr = getTodayStr();
    const tagColors = currentTaskMarkData.tagColors;

    const weekStartStr = formatDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const weekEndDate = new Date(d);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    const weekEndStr = formatDateStr(weekEndDate.getFullYear(), weekEndDate.getMonth() + 1, weekEndDate.getDate());

    const rangeItems = collectAllRangeItems();
    const weekBands = collectWeekBands(weekStartStr, weekEndStr, rangeItems);
    const { map: bandMap, maxRow } = buildCellBandMap(weekBands);

    for (let i = 0; i < 7; i++) {
      const dStr = formatDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate());
      const dayOfWeek = d.getDay();
      const colIndex = i + 1;
      const dayItems = (currentTaskMarkData.days[dStr] || { items: [] }).items;
      const regularItems = dayItems.filter(item => !item.endDate);
      const cell = createCell(d.getDate(), false, dStr === todayStr, dayOfWeek, dStr);
      cell.style.flex = '1';
      cell.innerHTML += createCellBandsHtml(bandMap[colIndex], maxRow, tagColors);
      cell.innerHTML += createItemsHtml(regularItems, tagColors, false, dStr);
      viewCalendar.appendChild(cell);
      d.setDate(d.getDate() + 1);
    }
  }

  function renderDaily() {
    viewCalendar.innerHTML = '';
    viewCalendar.className = 'tm-calendar-grid daily';

    const d = new Date(currentDate);
    const dayOfWeek = d.getDay();

    const el = document.createElement('div');
    el.className = `tm-day-header ${getDayClass(dayOfWeek)}`;
    el.textContent = DAY_NAMES[dayOfWeek];
    viewCalendar.appendChild(el);

    const dStr = formatDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const todayStr = getTodayStr();
    const dayData = getDayData(dStr);
    const cell = createCell('', false, dStr === todayStr, dayOfWeek);
    cell.style.flex = '1';
    cell.innerHTML += createItemsHtml(dayData.items, currentTaskMarkData.tagColors, false, dStr);
    viewCalendar.appendChild(cell);
  }

  // ─── Gantt / Timeline View ───────────────────────────────────

  /** Render the date axis row and weekend column backgrounds */
  function renderGanttAxis(container, startDate, totalRenderDays, pxPerMs) {
    const axisRow = document.createElement('div');
    axisRow.className = 'tm-gantt-axis';
    const isHourly = ganttZoom > 2.5;

    for (let i = 0; i < totalRenderDays; i++) {
      const d = new Date(startDate.getTime() + i * MS_PER_DAY);
      const dayOfWeek = d.getDay();
      const leftPx = (i * MS_PER_DAY) * pxPerMs;
      const widthPx = MS_PER_DAY * pxPerMs;

      // Weekend column background (full height)
      const colBg = document.createElement('div');
      colBg.className = `tm-gantt-col-bg ${getDayClass(dayOfWeek)}`;
      colBg.style.left = leftPx + 'px';
      colBg.style.width = widthPx + 'px';
      container.appendChild(colBg);

      // Axis day header
      const dayDiv = document.createElement('div');
      dayDiv.className = 'tm-gantt-axis-day';
      if (dayOfWeek === 0) dayDiv.classList.add('sun-text');
      if (dayOfWeek === 6) dayDiv.classList.add('sat-text');
      dayDiv.style.left = leftPx + 'px';
      dayDiv.style.width = widthPx + 'px';
      dayDiv.innerHTML = `<strong>${d.getMonth() + 1}/${d.getDate()}</strong>`;

      // Hourly sub-labels when zoomed in
      if (isHourly) {
        const hrContainer = document.createElement('div');
        hrContainer.className = 'tm-gantt-axis-hours';
        const step = ganttZoom > 10 ? 1 : (ganttZoom > 5 ? 2 : 6);
        for (let h = 0; h < 24; h += step) {
          const hDiv = document.createElement('div');
          hDiv.style.left = (h * MS_PER_HOUR) * pxPerMs + 'px';
          hDiv.textContent = `${h}:00`;
          hrContainer.appendChild(hDiv);
        }
        dayDiv.appendChild(hrContainer);
      }
      axisRow.appendChild(dayDiv);
    }
    container.appendChild(axisRow);
  }

  /** Render a single Gantt bar (group or standalone) */
  function renderGanttEntityBar(container, entity, startDate, pxPerMs, yOffset, totalWidth, skipRowBg) {
    if (!skipRowBg) {
      const rowBg = document.createElement('div');
      rowBg.className = 'tm-gantt-row-bg';
      rowBg.style.top = yOffset + 'px';
      rowBg.style.width = totalWidth + 'px';
      container.appendChild(rowBg);
    }

    const bgColor = getItemBorderColor(entity.tags, currentTaskMarkData.tagColors);

    if (entity.isGroup) {
      renderGroupBar(container, entity, startDate, pxPerMs, yOffset, bgColor);
    } else {
      renderStandaloneBars(container, entity, startDate, pxPerMs, yOffset, bgColor);
    }
  }

  function renderGroupBar(container, entity, startDate, pxPerMs, yOffset, bgColor) {
    const left = (entity.minTime - startDate.getTime()) * pxPerMs;
    const width = Math.max((entity.maxTime - entity.minTime) * pxPerMs, GANTT_MIN_BAR_WIDTH);

    const bar = createGanttBar(left, yOffset, width, bgColor);
    bar.classList.add('tm-gantt-group-bar');

    // Progress fill
    const pBar = document.createElement('div');
    pBar.className = 'tm-gantt-progress';
    if (entity.tasksTotal > 0) {
      const progress = (entity.tasksDone / entity.tasksTotal) * 100;
      pBar.style.width = progress + '%';
      if (progress > 0 && progress < 100) {
        pBar.style.borderRight = '2px solid var(--tm-card-border)';
      }
    } else {
      pBar.style.width = '100%';
    }
    pBar.style.backgroundColor = bgColor;
    bar.appendChild(pBar);

    const indicator = document.createElement('span');
    indicator.className = 'tm-gantt-group-indicator';
    indicator.textContent = expandedGroups.has(entity.id) ? '▼' : '▶';
    bar.appendChild(indicator);

    bar.addEventListener('click', (e) => {
      e.stopPropagation();
      if (hasDragged) return;
      if (expandedGroups.has(entity.id)) {
        expandedGroups.delete(entity.id);
      } else {
        expandedGroups.add(entity.id);
      }
      renderTimeline();
    });

    container.appendChild(bar);

    // Label (outside bar, to the right)
    const progText = entity.tasksTotal > 0 ? ` [${entity.tasksDone}/${entity.tasksTotal}]` : '';
    container.appendChild(createGanttLabel(entity.name + progText, left + width, yOffset));
  }

  function renderStandaloneBars(container, entity, startDate, pxPerMs, yOffset, bgColor) {
    entity.children.forEach(child => {
      const left = (child.startMs - startDate.getTime()) * pxPerMs;
      const width = Math.max((child.endMs - child.startMs) * pxPerMs, GANTT_MIN_BAR_WIDTH);

      const bar = createGanttBar(left, yOffset, width, bgColor);

      const pBar = document.createElement('div');
      pBar.className = 'tm-gantt-progress';
      if (child.isTask) {
        pBar.style.width = child.isDone ? '100%' : '0%';
      } else {
        pBar.style.width = '100%';
      }
      pBar.style.backgroundColor = bgColor;
      bar.appendChild(pBar);
      container.appendChild(bar);

      // Label (outside bar, to the right)
      container.appendChild(createGanttLabel(entity.name, left + width, yOffset));
    });
  }

  /** Render row backgrounds for the child area below a lane (called once per lane). */
  function renderGroupChildRowBgs(container, childCount, groupYOffset, totalWidth) {
    for (let i = 0; i < childCount; i++) {
      const rowBg = document.createElement('div');
      rowBg.className = 'tm-gantt-row-bg tm-gantt-child-row-bg';
      rowBg.style.top = (groupYOffset + (GANTT_ROW_HEIGHT + 4) * (i + 1)) + 'px';
      rowBg.style.width = totalWidth + 'px';
      container.appendChild(rowBg);
    }
  }

  /** Render child task bars below the group bar (row backgrounds are rendered separately). */
  function renderGroupChildren(container, entity, startDate, pxPerMs, groupYOffset, totalWidth) {
    entity.children.forEach((child, i) => {
      const childYOffset = groupYOffset + (GANTT_ROW_HEIGHT + 4) * (i + 1);

      const childColor = getItemBorderColor(child.tags, currentTaskMarkData.tagColors);
      const left = (child.startMs - startDate.getTime()) * pxPerMs;
      const width = Math.max((child.endMs - child.startMs) * pxPerMs, GANTT_MIN_BAR_WIDTH);

      const bar = createGanttBar(left, childYOffset, width, childColor);
      bar.classList.add('tm-gantt-child-bar');

      const pBar = document.createElement('div');
      pBar.className = 'tm-gantt-progress';
      if (child.isTask) {
        pBar.style.width = child.isDone ? '100%' : '0%';
      } else {
        pBar.style.width = '100%';
      }
      pBar.style.backgroundColor = childColor;
      bar.appendChild(pBar);
      container.appendChild(bar);

      // Label (outside bar, to the right)
      container.appendChild(createGanttLabel(child.text, left + width, childYOffset));
    });
  }

  /** Create a positioned Gantt bar element */
  function createGanttBar(left, yOffset, width, borderColor) {
    const bar = document.createElement('div');
    bar.className = 'tm-gantt-absolute-bar';
    bar.style.left = left + 'px';
    bar.style.top = (yOffset + 4) + 'px';
    bar.style.width = width + 'px';
    bar.style.backgroundColor = 'var(--tm-card-bg)';
    bar.style.border = `1px solid ${borderColor}`;
    return bar;
  }

  /** Create a label element positioned outside the bar */
  function createGanttLabel(text, leftPx, yOffset) {
    const label = document.createElement('span');
    label.className = 'tm-gantt-bar-label';
    label.style.left = (leftPx + GANTT_LABEL_OFFSET_X) + 'px';
    label.style.top = (yOffset + GANTT_LABEL_OFFSET_Y) + 'px';
    label.textContent = text;
    return label;
  }

  /** Main timeline (Gantt) renderer */
  function renderTimeline() {
    const savedScrollLeft = viewTimeline.scrollLeft;
    const savedScrollTop = viewTimeline.scrollTop;
    viewTimeline.innerHTML = '';
    viewTimeline.className = 'tm-gantt-view';

    const sortedDates = Object.keys(currentTaskMarkData.days).sort();

    if (sortedDates.length === 0) {
      viewTimeline.innerHTML = '<div style="opacity: 0.5; padding: 20px;">No events or tasks found.</div>';
      return;
    }

    // Calculate start date (align to week boundary)
    const startDate = parseLocalDate(sortedDates[0]);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    // Clamp zoom
    ganttZoom = Math.max(0.1, Math.min(48, ganttZoom));

    // Use pre-computed entities from the extension (built via buildGanttEntities in gantt.ts)
    const entityArray = currentGanttData.entities;
    const lastDateStr = currentGanttData.lastDateStr;
    const endDate = parseLocalDate(lastDateStr);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()) + 1);

    const totalMs = endDate.getTime() - startDate.getTime();
    const pxPerDay = 100 * ganttZoom;
    const pxPerMs = pxPerDay / MS_PER_DAY;
    const totalWidth = totalMs * pxPerMs;
    const totalRenderDays = Math.ceil(totalMs / MS_PER_DAY);

    // Group entities by lane while preserving order of first occurrence
    const laneGroups = [];
    const seenLanes = new Map();
    entityArray.forEach(entity => {
      if (!seenLanes.has(entity.lane)) {
        seenLanes.set(entity.lane, laneGroups.length);
        laneGroups.push([entity]);
      } else {
        laneGroups[seenLanes.get(entity.lane)].push(entity);
      }
    });

    // Precompute max expanded child count per lane (reused for height and rendering)
    const laneMaxChildCounts = laneGroups.map(laneEntities =>
      laneEntities.reduce((max, e) =>
        e.isGroup && expandedGroups.has(e.id) ? Math.max(max, e.children.length) : max, 0)
    );

    // Build container
    const ganttContainer = document.createElement('div');
    ganttContainer.className = 'tm-gantt-container';
    ganttContainer.style.width = totalWidth + 'px';
    const totalRowCount = laneGroups.reduce((sum, _, i) => sum + 1 + laneMaxChildCounts[i], 0);
    ganttContainer.style.height = (totalRowCount * (GANTT_ROW_HEIGHT + 4) + GANTT_HEADER_HEIGHT + 10) + 'px';

    // Render axis and column backgrounds
    renderGanttAxis(ganttContainer, startDate, totalRenderDays, pxPerMs);

    // Render entity bars grouped by lane (same lane = same row)
    let yOffset = GANTT_HEADER_HEIGHT;
    laneGroups.forEach((laneEntities, laneIdx) => {
      const laneYOffset = yOffset;
      yOffset += GANTT_ROW_HEIGHT + 4;

      // Render all bars for this lane first
      laneEntities.forEach((entity, i) => {
        renderGanttEntityBar(ganttContainer, entity, startDate, pxPerMs, laneYOffset, totalWidth, i > 0);
      });

      // Render children of each expanded entity relative to laneYOffset.
      // Row backgrounds are rendered once for the full child area depth.
      const maxChildCount = laneMaxChildCounts[laneIdx];
      if (maxChildCount > 0) {
        renderGroupChildRowBgs(ganttContainer, maxChildCount, laneYOffset, totalWidth);
        laneEntities.forEach(entity => {
          if (entity.isGroup && expandedGroups.has(entity.id)) {
            renderGroupChildren(ganttContainer, entity, startDate, pxPerMs, laneYOffset, totalWidth);
          }
        });
        yOffset += (GANTT_ROW_HEIGHT + 4) * maxChildCount;
      }
    });

    viewTimeline.appendChild(ganttContainer);
    viewTimeline.scrollLeft = savedScrollLeft;
    viewTimeline.scrollTop = savedScrollTop;
  }

})();
