(function () {
  // ─── Constants ───────────────────────────────────────────────
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MS_PER_MINUTE = 60000;
  const MS_PER_HOUR = 3600000;
  const MS_PER_DAY = 24 * MS_PER_HOUR;
  const GANTT_ROW_HEIGHT = 40;
  const GANTT_HEADER_HEIGHT = 50;
  const GANTT_MIN_BAR_WIDTH = 12;

  // ─── State ───────────────────────────────────────────────────
  let baseView = 'calendar'; // 'calendar' | 'timeline'
  let activeView = 'monthly'; // 'monthly' | 'weekly' | 'daily'
  let currentDate = new Date();
  let currentTaskMarkData = null;
  let ganttZoom = 1; // 1 = 100px per day
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
    return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
  }

  /** Get today's date as 'YYYY-MM-DD' */
  function getTodayStr() {
    return new Date().toISOString().split('T')[0];
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
    const h = Math.abs(hash) % 360;
    const s = 60 + (Math.abs(hash) % 20);
    const l = 45 + (Math.abs(hash) % 15);
    return `hsl(${h}, ${s}%, ${l}%)`;
  }

  /** Get border color from the first tag, falling back to accent */
  function getItemBorderColor(item, tagColorsMap) {
    if (item.tags && item.tags.length > 0) {
      return getTagColor(item.tags[0], tagColorsMap);
    }
    return 'var(--tm-accent)';
  }

  // ─── Message Handling ────────────────────────────────────────

  window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'update') {
      currentTaskMarkData = message.data;
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

  // Gantt panning
  viewTimeline?.addEventListener('mousedown', (e) => {
    isPanning = true;
    startPanX = e.clientX;
    startPanY = e.clientY;
    initialScrollL = viewTimeline.scrollLeft;
    initialScrollT = viewTimeline.scrollTop;
    viewTimeline.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    viewTimeline.scrollLeft = initialScrollL - (e.clientX - startPanX);
    viewTimeline.scrollTop = initialScrollT - (e.clientY - startPanY);
  });
  window.addEventListener('mouseup', () => {
    isPanning = false;
    if (viewTimeline) viewTimeline.style.cursor = 'grab';
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
    if (!currentTaskMarkData) return;

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
        return timeA === timeB ? a.rawLine - b.rawLine : timeA.localeCompare(timeB);
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
          return `<span class="tm-tag" style="background-color: ${color}">${t}</span>`;
        }).join('')
        : '';

      const cbHtml = item.type === 'task' ? '<span class="tm-checkbox"></span>' : '';
      const timeHtml = item.time ? `<span class="tm-time">${item.time}</span>` : '';
      const classNames = `tm-item ${item.type} ${item.status || ''}`;
      const borderColor = getItemBorderColor(item, tagColorsMap);

      return `<div class="${classNames}" style="border-left-color: ${borderColor}">
        ${cbHtml}
        <div>${timeHtml} ${item.text} ${tagsHtml}</div>
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
        <div class="tm-group-title">${gName}</div>
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

  /** Get day data from the current dataset, with fallback */
  function getDayData(dStr) {
    return currentTaskMarkData.days[dStr] || { items: [] };
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

    // Previous month padding
    const prevDateObj = new Date(year, monthIndex, 0);
    const prevMonthLastDay = prevDateObj.getDate();
    for (let i = startPadding - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const dayOfWeek = new Date(prevDateObj.getFullYear(), prevDateObj.getMonth(), d).getDay();
      const dStr = formatDateStr(prevDateObj.getFullYear(), prevDateObj.getMonth() + 1, d);
      viewCalendar.appendChild(createCell(d, true, false, dayOfWeek, dStr));
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      const dStr = formatDateStr(year, monthIndex + 1, i);
      const dayOfWeek = new Date(year, monthIndex, i).getDay();
      const dayData = getDayData(dStr);
      const cell = createCell(i, false, dStr === todayStr, dayOfWeek, dStr);
      cell.innerHTML += createItemsHtml(dayData.items, tagColors, true);
      viewCalendar.appendChild(cell);
    }

    // Next month padding
    const totalCells = startPadding + totalDays;
    const endPadding = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    const nextDateObj = new Date(year, monthIndex + 1, 1);
    for (let i = 1; i <= endPadding; i++) {
      const dayOfWeek = new Date(nextDateObj.getFullYear(), nextDateObj.getMonth(), i).getDay();
      const dStr = formatDateStr(nextDateObj.getFullYear(), nextDateObj.getMonth() + 1, i);
      viewCalendar.appendChild(createCell(i, true, false, dayOfWeek, dStr));
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

    for (let i = 0; i < 7; i++) {
      const dStr = formatDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate());
      const dayOfWeek = d.getDay();
      const dayData = getDayData(dStr);
      const cell = createCell(d.getDate(), false, dStr === todayStr, dayOfWeek, dStr);
      cell.style.flex = '1';
      cell.innerHTML += createItemsHtml(dayData.items, tagColors);
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

  /** Collect entities (groups and standalone items) from sorted dates */
  function collectGanttEntities(sortedDates) {
    const entities = {};

    sortedDates.forEach(dStr => {
      const dayData = currentTaskMarkData.days[dStr];
      const dayStartMs = parseLocalDate(dStr).getTime();

      dayData.items.forEach(item => {
        let startMs = dayStartMs;
        let endMs = dayStartMs + MS_PER_DAY - 1;

        if (item.time) {
          const parts = item.time.split('-');
          const sTime = parts[0].trim().split(':');
          if (sTime.length >= 2) {
            startMs = dayStartMs + parseInt(sTime[0]) * MS_PER_HOUR + parseInt(sTime[1]) * MS_PER_MINUTE;
          }
          if (parts[1]) {
            const eTime = parts[1].trim().split(':');
            if (eTime.length >= 2) {
              endMs = dayStartMs + parseInt(eTime[0]) * MS_PER_HOUR + parseInt(eTime[1]) * MS_PER_MINUTE;
            }
          } else {
            endMs = startMs + MS_PER_HOUR;
          }
        }

        const eName = item.group ? `[Group] ${item.group}` : item.text;
        if (!entities[eName]) {
          entities[eName] = {
            name: item.group || item.text,
            isGroup: !!item.group,
            minTime: startMs,
            maxTime: endMs,
            tags: item.tags || [],
            tasksTotal: 0,
            tasksDone: 0,
            items: []
          };
        } else {
          if (startMs < entities[eName].minTime) entities[eName].minTime = startMs;
          if (endMs > entities[eName].maxTime) entities[eName].maxTime = endMs;
        }

        entities[eName].items.push({
          startMs,
          endMs,
          isTask: item.type === 'task',
          isDone: item.status === 'done'
        });

        if (item.type === 'task') {
          entities[eName].tasksTotal++;
          if (item.status === 'done') entities[eName].tasksDone++;
        }
      });
    });

    return Object.values(entities).sort(
      (a, b) => a.minTime - b.minTime || a.name.localeCompare(b.name)
    );
  }

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

    const bgColor = getItemBorderColor({ tags: entity.tags }, currentTaskMarkData.tagColors);

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
        pBar.style.borderRight = '2px solid rgba(255,255,255,0.6)';
      }
    } else {
      pBar.style.width = '100%';
    }
    pBar.style.backgroundColor = bgColor;
    bar.appendChild(pBar);

    // Label
    const progText = entity.tasksTotal > 0 ? ` [${entity.tasksDone}/${entity.tasksTotal}]` : '';
    bar.appendChild(createGanttLabel(entity.name + progText));
    container.appendChild(bar);
  }

  function renderStandaloneBars(container, entity, startDate, pxPerMs, yOffset, bgColor) {
    entity.items.forEach(itemObj => {
      const left = (itemObj.startMs - startDate.getTime()) * pxPerMs;
      const width = Math.max((itemObj.endMs - itemObj.startMs) * pxPerMs, GANTT_MIN_BAR_WIDTH);

      const bar = createGanttBar(left, yOffset, width, bgColor);

      const pBar = document.createElement('div');
      pBar.className = 'tm-gantt-progress';
      if (itemObj.isTask) {
        pBar.style.width = itemObj.isDone ? '100%' : '0%';
      } else {
        pBar.style.width = '100%';
      }
      pBar.style.backgroundColor = bgColor;
      bar.appendChild(pBar);

      bar.appendChild(createGanttLabel(entity.name));
      container.appendChild(bar);
    });
  }

  /** Create a positioned Gantt bar element */
  function createGanttBar(left, yOffset, width, borderColor) {
    const bar = document.createElement('div');
    bar.className = 'tm-gantt-absolute-bar';
    bar.style.left = left + 'px';
    bar.style.top = (yOffset + 4) + 'px';
    bar.style.width = width + 'px';
    bar.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
    bar.style.border = `1px solid ${borderColor}`;
    return bar;
  }

  /** Create a label span for a Gantt bar */
  function createGanttLabel(text) {
    const label = document.createElement('span');
    label.className = 'tm-gantt-bar-label';
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

    // Calculate padded date range (align to week boundaries)
    const startDate = parseLocalDate(sortedDates[0]);
    startDate.setDate(startDate.getDate() - startDate.getDay());
    const endDate = parseLocalDate(sortedDates[sortedDates.length - 1]);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()) + 1);

    // Clamp zoom
    ganttZoom = Math.max(0.1, Math.min(48, ganttZoom));

    const totalMs = endDate.getTime() - startDate.getTime();
    const pxPerDay = 100 * ganttZoom;
    const pxPerMs = pxPerDay / MS_PER_DAY;
    const totalWidth = totalMs * pxPerMs;
    const totalRenderDays = Math.ceil(totalMs / MS_PER_DAY);

    // Collect entities
    const entityArray = collectGanttEntities(sortedDates);

    // Build container
    const ganttContainer = document.createElement('div');
    ganttContainer.className = 'tm-gantt-container';
    ganttContainer.style.width = totalWidth + 'px';
    ganttContainer.style.height = (entityArray.length * (GANTT_ROW_HEIGHT + 4) + GANTT_HEADER_HEIGHT + 10) + 'px';

    // Render axis and column backgrounds
    renderGanttAxis(ganttContainer, startDate, totalRenderDays, pxPerMs);

    // Render entity bars
    let yOffset = GANTT_HEADER_HEIGHT;
    entityArray.forEach(entity => {
      renderGanttEntityBar(ganttContainer, entity, startDate, pxPerMs, yOffset, totalWidth);
      yOffset += GANTT_ROW_HEIGHT;
    });

    viewTimeline.appendChild(ganttContainer);
  }

})();
