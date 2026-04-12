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

  // ─── State ───────────────────────────────────────────────────
  let baseView = 'calendar'; // 'calendar' | 'timeline'
  let activeView = 'monthly'; // 'monthly' | 'weekly' | 'daily'
  let currentDate = new Date();
  let currentTaskMarkData = null;
  let currentGanttData = null;
  let ganttZoom = 1; // 1 = 100px per day
  let collapsedGroups = new Set();
  let isPanning = false;
  let startPanX = 0;
  let startPanY = 0;
  let initialScrollL = 0;
  let initialScrollT = 0;

  // ─── DOM References ──────────────────────────────────────────
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

  /** Deterministic color from tag name, or explicit color from map */
  function getTagColor(tagName, tagColorsMap) {
    if (tagColorsMap && tagColorsMap[tagName]) {
      return tagColorsMap[tagName];
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

  // ─── Message Handling ────────────────────────────────────────

  window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'update') {
      currentTaskMarkData = message.data;
      currentGanttData = message.ganttData;
      render();
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
    } else {
      viewTimeline.classList.add('hidden');
      viewCalendar.classList.remove('hidden');
      monthNav?.classList.remove('hidden');
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
    viewTimeline.scrollLeft = initialScrollL - (e.clientX - startPanX);
    viewTimeline.scrollTop = initialScrollT - (e.clientY - startPanY);
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) stopPanning();
  });
  window.addEventListener('blur', stopPanning);

  // Keep group toggles visible at the left edge while scrolling horizontally
  viewTimeline?.addEventListener('scroll', () => {
    const sl = viewTimeline.scrollLeft;
    viewTimeline.querySelectorAll('.tm-gantt-group-toggle').forEach(el => {
      el.style.left = (sl + 4) + 'px';
    });
  });

  // Gantt zoom
  viewTimeline?.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      ganttZoom *= (e.deltaY < 0 ? 1.2 : 0.8);
      renderTimeline();
    }
  });

  // Date navigation
  function navigateDate(direction) {
    if (baseView === 'timeline' || activeView === 'monthly') {
      currentDate.setMonth(currentDate.getMonth() + direction);
    } else if (activeView === 'weekly') {
      currentDate.setDate(currentDate.getDate() + 7 * direction);
    } else if (activeView === 'daily') {
      currentDate.setDate(currentDate.getDate() + direction);
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

  function createItemsHtml(items, tagColorsMap, isMonthly = false) {
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
      const tagsHtml = (item.tags && item.tags.length > 0)
        ? item.tags.map(t => {
          const color = getTagColor(t, tagColorsMap);
          return `<span class="tm-tag" style="background-color: ${color}">${escapeHtml(t)}</span>`;
        }).join('')
        : '';

      const cbHtml = item.type === 'task' ? '<span class="tm-checkbox"></span>' : '';
      const timeHtml = itemHasTime(item) ? `<span class="tm-time">${item.time}</span>` : '';
      const classNames = `tm-item ${item.type} ${item.status || ''}`;
      const borderColor = getItemBorderColor(item.tags, tagColorsMap);

      return `<div class="${classNames}" style="border-left-color: ${borderColor}">
        ${cbHtml}
        <div>${timeHtml} ${escapeHtml(item.text)} ${tagsHtml}</div>
      </div>`;
    };

    const renderTaskSummary = (itemList, titleFallback) => {
      const tasks = itemList.filter(i => i.type === 'task');
      const schedules = itemList.filter(i => i.type === 'schedule');
      let outHtml = schedules.map(renderItem).join('');

      if (tasks.length > 0) {
        const doneCount = tasks.filter(t => t.status === 'done').length;
        const totalCount = tasks.length;
        const isAllDone = doneCount === totalCount;
        const firstTagTask = tasks.find(t => t.tags && t.tags.length > 0);
        const borderColor = firstTagTask
          ? getTagColor(firstTagTask.tags[0], tagColorsMap)
          : 'var(--tm-accent)';
        const classNames = `tm-item task ${isAllDone ? 'done' : ''}`;

        outHtml += `<div class="${classNames}" style="border-left-color: ${borderColor}">
          <span class="tm-checkbox"></span>
          <div><strong>${doneCount}/${totalCount}</strong> ${titleFallback}</div>
        </div>`;
      }
      return outHtml;
    };

    let html = '<div class="tm-items-list">';

    Object.keys(grouped).forEach(gName => {
      const groupContent = isMonthly
        ? renderTaskSummary(grouped[gName], 'Tasks')
        : grouped[gName].map(renderItem).join('');
      html += `<div class="tm-group-box">
        <div class="tm-group-title">${escapeHtml(gName)}</div>
        ${groupContent}
      </div>`;
    });

    if (isMonthly) {
      html += renderTaskSummary(standalone, 'Tasks');
    } else {
      html += standalone.map(renderItem).join('');
    }

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
    const rangeItems = [];
    Object.entries(currentTaskMarkData.days).forEach(([date, data]) => {
      if (date >= dStr) return;
      data.items.forEach(item => {
        if (item.endDate && item.endDate >= dStr) {
          rangeItems.push(item);
        }
      });
    });
    if (rangeItems.length === 0) return dayData;
    return { ...dayData, items: [...dayData.items, ...rangeItems] };
  }

  // ─── Multi-Day Band Rendering ────────────────────────────────

  /** Collect all range items from the dataset (items with endDate). */
  function collectAllRangeItems() {
    const rangeItems = [];
    Object.entries(currentTaskMarkData.days).forEach(([date, dayData]) => {
      dayData.items.forEach(item => {
        if (item.endDate) rangeItems.push({ date, item });
      });
    });
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
        el.innerHTML += createItemsHtml(regularItems, tagColors, true);
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
      cell.innerHTML += createItemsHtml(regularItems, tagColors);
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
    cell.innerHTML += createItemsHtml(dayData.items, currentTaskMarkData.tagColors);
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
  function renderGanttEntityBar(container, entity, startDate, pxPerMs, yOffset, totalWidth) {
    // Row background
    const rowBg = document.createElement('div');
    rowBg.className = 'tm-gantt-row-bg';
    rowBg.style.top = yOffset + 'px';
    rowBg.style.width = totalWidth + 'px';
    container.appendChild(rowBg);

    if (entity.isGroup) {
      const toggle = document.createElement('span');
      toggle.className = 'tm-gantt-group-toggle';
      toggle.textContent = collapsedGroups.has(entity.name) ? '▶' : '▼';
      toggle.style.top = (yOffset + 4) + 'px';
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (collapsedGroups.has(entity.name)) {
          collapsedGroups.delete(entity.name);
        } else {
          collapsedGroups.add(entity.name);
        }
        renderTimeline();
      });
      container.appendChild(toggle);
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

  /** Render child task rows below the group bar */
  function renderGroupChildren(container, entity, startDate, pxPerMs, groupYOffset, totalWidth) {
    entity.children.forEach((child, i) => {
      const childYOffset = groupYOffset + (GANTT_ROW_HEIGHT + 4) * (i + 1);

      // Child row background
      const rowBg = document.createElement('div');
      rowBg.className = 'tm-gantt-row-bg tm-gantt-child-row-bg';
      rowBg.style.top = childYOffset + 'px';
      rowBg.style.width = totalWidth + 'px';
      container.appendChild(rowBg);

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

    // Build container
    const ganttContainer = document.createElement('div');
    ganttContainer.className = 'tm-gantt-container';
    ganttContainer.style.width = totalWidth + 'px';
    const totalRowCount = entityArray.reduce((sum, e) => {
      const childCount = e.isGroup && !collapsedGroups.has(e.name) ? e.children.length : 0;
      return sum + 1 + childCount;
    }, 0);
    ganttContainer.style.height = (totalRowCount * (GANTT_ROW_HEIGHT + 4) + GANTT_HEADER_HEIGHT + 10) + 'px';

    // Render axis and column backgrounds
    renderGanttAxis(ganttContainer, startDate, totalRenderDays, pxPerMs);

    // Render entity bars
    let yOffset = GANTT_HEADER_HEIGHT;
    entityArray.forEach(entity => {
      const entityYOffset = yOffset;
      renderGanttEntityBar(ganttContainer, entity, startDate, pxPerMs, entityYOffset, totalWidth);
      yOffset += GANTT_ROW_HEIGHT + 4;
      if (entity.isGroup && !collapsedGroups.has(entity.name)) {
        renderGroupChildren(ganttContainer, entity, startDate, pxPerMs, entityYOffset, totalWidth);
        yOffset += (GANTT_ROW_HEIGHT + 4) * entity.children.length;
      }
    });

    viewTimeline.appendChild(ganttContainer);

    // Align toggle buttons to current scroll position
    const sl = viewTimeline.scrollLeft;
    ganttContainer.querySelectorAll('.tm-gantt-group-toggle').forEach(el => {
      el.style.left = (sl + 4) + 'px';
    });
  }

})();
