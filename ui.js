/* CTT-SIS Tiến độ học tập - dashboard UI. */
(function () {
  'use strict';

  let hostEl;
  let shadow;
  let panelOpen = false;
  let currentPanelMode = null;
  let assetsPromise;
  let selectedModule = null;
  let copyHandlerBound = false;
  const PROGRAM_PATH = '/Students/StudentProgram.aspx';
  const MARKS_PATH = '/Students/StudentCourseMarks.aspx';

  function fmt(n) {
    return (Math.round(n * 100) / 100).toString();
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[ch]);
  }

  function summarize(courses) {
    const total = courses.length;
    const done = courses.filter(c => c.taken).length;
    const totalCredit = courses.reduce((s, c) => s + (c.credit || 0), 0);
    const doneCredit = courses.filter(c => c.taken).reduce((s, c) => s + (c.credit || 0), 0);
    return {
      total,
      done,
      totalCredit,
      doneCredit,
      missing: courses.filter(c => !c.taken),
      passed: courses.filter(c => c.taken),
    };
  }

  function statusFor(rule, sum) {
    if (rule === 'all') {
      return sum.done === sum.total
        ? { label: 'Hoàn thành', cls: 'done' }
        : { label: `Thiếu ${sum.total - sum.done} môn · ${sum.totalCredit - sum.doneCredit} TC`, cls: 'todo' };
    }
    return sum.done >= rule
      ? { label: `Đã đủ ${sum.done}/${rule} môn`, cls: 'done' }
      : { label: `Cần thêm ${rule - sum.done} môn`, cls: 'todo' };
  }

  function gradeText(value) {
    return value == null || value === '' || Number.isNaN(value) ? '-' : escapeHTML(value);
  }

  function scoreText(course) {
    if (!course.credit) return '-';
    return gradeText(course.score);
  }

  function codeCell(course) {
    const code = escapeHTML(course.code);
    if (course.taken) return `<td class="code">${code}</td>`;
    return `<td class="code">
      <span class="code-with-copy">
        <span>${code}</span>
        <button class="copy-code-btn" type="button" data-code="${code}" title="Copy mã HP" aria-label="Copy mã HP ${code}">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      </span>
    </td>`;
  }

  function courseTable(courses, showCredit, showGrades) {
    if (!courses.length) return '<div class="empty-note">Không có môn nào.</div>';
    return `<table class="course-list">
      ${showGrades ? `<thead><tr>
        <th>Mã HP</th>
        <th>Tên học phần</th>
        ${showCredit ? '<th class="credit-head">TC</th>' : ''}
        <th>Điểm chữ</th>
        <th>Điểm số</th>
      </tr></thead>` : ''}
      <tbody>${courses.map(c => `
      <tr>
        ${codeCell(c)}
        <td>${escapeHTML(c.name)}</td>
        ${showCredit ? `<td class="credit">${escapeHTML(c.credit || 0)}</td>` : ''}
        ${showGrades ? `<td class="grade-cell">${gradeText(c.grade)}</td><td class="grade-cell">${scoreText(c)}</td>` : ''}
      </tr>`).join('')}</tbody></table>`;
  }

  function gradeRank(letter) {
    const point = gradePoint(letter);
    return point == null ? -2 : point;
  }

  function gradePoint(letter) {
    const grade = String(letter || '').trim().toUpperCase();
    return {
      'A+': 4,
      A: 4,
      'B+': 3.5,
      B: 3,
      'C+': 2.5,
      C: 2,
      'D+': 1.5,
      D: 1,
      F: 0,
    }[grade] ?? null;
  }

  function gradeBadge(letter) {
    const grade = String(letter || '-').trim().toUpperCase() || '-';
    const cls = grade.replace('+', 'plus').toLowerCase();
    const known = ['a', 'aplus', 'b', 'bplus', 'c', 'cplus', 'd', 'dplus', 'f', 'r'].includes(cls);
    return `<span class="grade-badge grade-${known ? cls : 'unknown'}">${escapeHTML(grade)}</span>`;
  }

  function summaryGrade(letter) {
    const grade = String(letter || '-').trim().toUpperCase() || '-';
    const cls = grade.replace('+', 'plus').toLowerCase();
    const known = ['a', 'aplus', 'b', 'bplus', 'c', 'cplus', 'd', 'dplus', 'f', 'r'].includes(cls);
    return `<span class="summary-grade grade-${known ? cls : 'unknown'}">${escapeHTML(grade)}</span>`;
  }

  function gradePointText(letter) {
    const point = gradePoint(letter);
    return point == null ? '-' : escapeHTML(point);
  }

  function markScoreText(value) {
    return value == null || Number.isNaN(value) ? '-' : escapeHTML(value);
  }

  function sortMarks(rows, direction) {
    const sign = direction === 'worst' ? 1 : -1;
    return rows.slice().sort((a, b) => {
      const rankDiff = gradeRank(a.letterGrade) - gradeRank(b.letterGrade);
      if (rankDiff) return rankDiff * sign;
      const examDiff = (a.examScore ?? -1) - (b.examScore ?? -1);
      if (examDiff) return examDiff * sign;
      const processDiff = (a.processScore ?? -1) - (b.processScore ?? -1);
      if (processDiff) return processDiff * sign;
      return a.name.localeCompare(b.name, 'vi');
    });
  }

  function arcPath(cx, cy, r, a0, a1) {
    const toRad = a => (a - 90) * Math.PI / 180;
    const x0 = cx + r * Math.cos(toRad(a0));
    const y0 = cy + r * Math.sin(toRad(a0));
    const x1 = cx + r * Math.cos(toRad(a1));
    const y1 = cy + r * Math.sin(toRad(a1));
    const large = (a1 - a0) > 180 ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  }

  function gaugeSVG(cpa) {
    const r = 50;
    const cx = 64;
    const cy = 64;
    const start = -220;
    const end = 40;
    const pct = Math.max(0, Math.min(1, cpa / 4));
    const fillEnd = start + (end - start) * pct;
    return `<svg width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="CPA ${fmt(cpa)} trên 4.0">
      <path d="${arcPath(cx, cy, r, start, end)}" fill="none" stroke="#EEE8E8" stroke-width="10" stroke-linecap="round"/>
      <path d="${arcPath(cx, cy, r, start, fillEnd)}" fill="none" stroke="#9C1010" stroke-width="10" stroke-linecap="round"/>
      <text x="64" y="61" text-anchor="middle" font-weight="800" font-size="28" fill="#101010">${fmt(cpa)}</text>
      <text x="64" y="84" text-anchor="middle" font-size="15" font-weight="800" fill="#666666">/ 4.0</text>
    </svg>`;
  }

  async function loadAssets() {
    if (!assetsPromise) {
      assetsPromise = Promise.all([
        fetch(chrome.runtime.getURL('styles.css')).then(r => r.text()),
        fetch(chrome.runtime.getURL('panel.html')).then(r => r.text()),
      ]).then(([css, html]) => ({ css, html }));
    }
    return assetsPromise;
  }

  async function getLastModule() {
    try {
      const r = await chrome.storage.local.get('cttbk_selected_module');
      return r.cttbk_selected_module == null ? null : Number(r.cttbk_selected_module);
    } catch (e) {
      return null;
    }
  }

  function setLastModule(num) {
    try {
      chrome.storage.local.set({ cttbk_selected_module: num });
    } catch (e) {}
  }

  function computeTotals(model) {
    const data = window.CTTBK_DATA;
    let all = [];
    Object.values(model.categories).forEach(arr => { all = all.concat(arr); });
    if (selectedModule != null && model.modules[selectedModule]) {
      all = all.concat(model.modules[selectedModule].courses);
    }

    const gradeable = all.filter(c => c.taken && c.credit > 0 && typeof c.score === 'number' && !isNaN(c.score));
    const totalW = gradeable.reduce((s, c) => s + c.credit * c.score, 0);
    const totalC = gradeable.reduce((s, c) => s + c.credit, 0);
    const cpa = totalC ? totalW / totalC : 0;
    const doneCredit = all.filter(c => c.taken).reduce((s, c) => s + (c.credit || 0), 0);
    let requiredCredit = 0;
    let missingCredit = 0;

    function requiredCreditsFor(meta, courses) {
      if (meta.rule === 'all') return courses.reduce((s, c) => s + (c.credit || 0), 0);
      return courses
        .map(c => c.credit || 0)
        .sort((a, b) => b - a)
        .slice(0, meta.rule)
        .reduce((s, credit) => s + credit, 0);
    }

    function missingCreditsFor(meta, courses) {
      const sum = summarize(courses);
      if (meta.rule === 'all') return Math.max(0, sum.totalCredit - sum.doneCredit);
      if (sum.done >= meta.rule) return 0;
      const passedCredits = sum.passed
        .map(c => c.credit || 0)
        .sort((a, b) => b - a)
        .slice(0, meta.rule)
        .reduce((s, credit) => s + credit, 0);
      return Math.max(0, requiredCreditsFor(meta, courses) - passedCredits);
    }

    Object.entries(model.categories).forEach(([key, courses]) => {
      const meta = data.catMeta[key];
      if (!meta || meta.optional) return;
      requiredCredit += requiredCreditsFor(meta, courses);
    });

    if (selectedModule != null && model.modules[selectedModule]) {
      requiredCredit += model.modules[selectedModule].courses.reduce((s, c) => s + (c.credit || 0), 0);
    }

    data.mandatoryKeys.forEach(k => {
      const meta = data.catMeta[k];
      if (meta) missingCredit += missingCreditsFor(meta, model.categories[k] || []);
    });

    return { cpa, doneCredit, requiredCredit, missingCredit };
  }

  function categoryCardHTML(key, model) {
    const meta = window.CTTBK_DATA.catMeta[key];
    const courses = model.categories[key];
    const sum = summarize(courses);
    const st = statusFor(meta.rule, sum);
    const requirementMet = st.cls === 'done';
    const pct = meta.rule === 'all'
      ? (sum.totalCredit ? sum.doneCredit / sum.totalCredit * 100 : (sum.total ? sum.done / sum.total * 100 : 100))
      : Math.min(100, sum.done / meta.rule * 100);
    const detailBlocks = [];

    if (sum.total === 0) {
      return `<article class="course-card">
        <div class="card-head"><h4>${escapeHTML(meta.name)}</h4></div>
        <div class="empty-note">Không tìm thấy môn nào thuộc khối này trong bảng hiện tại.</div>
      </article>`;
    }

    if (!requirementMet && sum.missing.length) {
      detailBlocks.push(`<details>
        <summary>${meta.rule === 'all' ? `Xem ${sum.missing.length} môn còn thiếu` : 'Xem các môn có thể chọn'}</summary>
        ${courseTable(sum.missing, sum.totalCredit > 0, true)}
      </details>`);
    }

    if (sum.passed.length) {
      detailBlocks.push(`<details>
        <summary>Xem điểm các môn đã qua</summary>
        ${courseTable(sum.passed, sum.totalCredit > 0, true)}
      </details>`);
    }

    return `<article class="course-card">
      <div class="card-head">
        <h4>${escapeHTML(meta.name)}</h4>
        <span class="rule-tag">${meta.rule === 'all' ? 'Bắt buộc' : `Cần qua ${meta.rule} môn`}</span>
      </div>
      <div class="progress-bar"><div class="progress-fill ${st.cls === 'todo' ? 'todo' : ''}" style="--pct:${Math.max(0, Math.min(100, pct))}%"></div></div>
      <div class="meta-line">
        <span>${sum.done}/${sum.total} môn đã qua${sum.totalCredit ? ` · ${sum.doneCredit}/${sum.totalCredit} TC` : ''}</span>
        <span class="badge-status ${st.cls}">${escapeHTML(st.label)}</span>
      </div>
      ${st.cls === 'done' && meta.rule !== 'all' ? `<div class="pass-row">${sum.passed.map(c => `<span class="pass-chip">${escapeHTML(c.code)}</span>`).join('')}</div>` : ''}
      ${detailBlocks.join('')}
    </article>`;
  }

  function moduleLabel(model, n) {
    const m = model.modules[n];
    return m.name ? `Mô đun ${n}: ${m.name}` : `Mô đun ${n}`;
  }

  function moduleBodyHTML(model) {
    if (selectedModule == null || !model.modules[selectedModule]) {
      return '<div class="empty-note">Không tìm thấy mô đun nào trong bảng hiện tại.</div>';
    }
    const courses = model.modules[selectedModule].courses;
    const sum = summarize(courses);
    const pct = sum.totalCredit ? sum.doneCredit / sum.totalCredit * 100 : 0;
    const done = sum.done === sum.total;
    return `
      <div class="progress-bar" style="margin-top:16px;"><div class="progress-fill ${done ? '' : 'todo'}" style="--pct:${Math.max(0, Math.min(100, pct))}%"></div></div>
      <div class="meta-line">
        <span>${sum.done}/${sum.total} môn đã qua · ${sum.doneCredit}/${sum.totalCredit} TC</span>
        <span class="badge-status ${done ? 'done' : 'todo'}">${done ? 'Hoàn thành' : `Thiếu ${sum.total - sum.done} môn · ${sum.totalCredit - sum.doneCredit} TC`}</span>
      </div>
      <details open>
        <summary>Xem danh sách môn và điểm</summary>
        ${courseTable(courses, true, true)}
      </details>
    `;
  }

  function fillDashboard(model) {
    const moduleNums = Object.keys(model.modules).map(Number).sort((a, b) => a - b);
    if (selectedModule == null || !moduleNums.includes(selectedModule)) selectedModule = moduleNums[0] || null;

    const totals = computeTotals(model);
    shadow.getElementById('gaugeSlot').innerHTML = gaugeSVG(totals.cpa);
    shadow.getElementById('doneCredit').textContent = totals.doneCredit;
    shadow.getElementById('doneCreditCaption').textContent = totals.doneCredit;
    shadow.getElementById('trackedCreditCaption').textContent = totals.requiredCredit;
    shadow.getElementById('missingCredit').textContent = totals.missingCredit;
    shadow.getElementById('courseCount').textContent = `${model.raw.length} môn`;
    shadow.getElementById('categoryGrid').innerHTML = Object.keys(window.CTTBK_DATA.catMeta)
      .map(key => categoryCardHTML(key, model))
      .join('');

    const select = shadow.getElementById('moduleSelect');
    select.innerHTML = moduleNums.map(n => `<option value="${n}" ${n === selectedModule ? 'selected' : ''}>${escapeHTML(moduleLabel(model, n))}</option>`).join('');
    select.disabled = moduleNums.length === 0;
    shadow.getElementById('moduleBody').innerHTML = moduleBodyHTML(model);

    const otherSection = shadow.getElementById('otherSection');
    if (model.others.length) {
      otherSection.classList.remove('is-hidden');
      shadow.getElementById('otherBody').innerHTML = `<article class="course-card">
        <div class="meta-line"><span>${model.others.length} môn không khớp từ khóa phân loại nào.</span></div>
        <details><summary>Xem danh sách môn và điểm</summary>${courseTable(model.others, true, true)}</details>
      </article>`;
    } else {
      otherSection.classList.add('is-hidden');
    }
  }

  function fillMarks(rows, direction) {
    const sorted = sortMarks(rows, direction);
    const best = sortMarks(rows, 'best')[0];
    const worst = sortMarks(rows, 'worst')[0];

    shadow.getElementById('marksCount').textContent = rows.length;
    shadow.getElementById('bestGrade').innerHTML = best ? summaryGrade(best.letterGrade) : '-';
    shadow.getElementById('bestCourse').textContent = best ? `${best.code} - ${best.name}` : 'Chưa có dữ liệu.';
    shadow.getElementById('worstGrade').innerHTML = worst ? summaryGrade(worst.letterGrade) : '-';
    shadow.getElementById('worstCourse').textContent = worst ? `${worst.code} - ${worst.name}` : 'Chưa có dữ liệu.';
    shadow.getElementById('marksSortLabel').textContent = direction === 'worst' ? 'Tệ nhất trước' : 'Tốt nhất trước';
    shadow.getElementById('marksBody').innerHTML = sorted.map(row => `
      <tr>
        <td class="grade-cell">${escapeHTML(row.term)}</td>
        <td class="code">${escapeHTML(row.code)}</td>
        <td>${escapeHTML(row.name)}</td>
        <td class="credit">${escapeHTML(row.credit || 0)}</td>
        <td class="grade-cell">${markScoreText(row.processScore)}</td>
        <td class="grade-cell">${markScoreText(row.examScore)}</td>
        <td class="grade-cell">${gradeBadge(row.letterGrade)}</td>
        <td class="grade-cell">${gradePointText(row.letterGrade)}</td>
      </tr>
    `).join('');
  }

  async function renderMarksPanel(rows) {
    let currentSort = 'best';
    await renderTemplate('marksTemplate');
    fillMarks(rows, currentSort);
    bindPanelShellEvents();
    shadow.getElementById('marksBestBtn').addEventListener('click', () => {
      currentSort = 'best';
      fillMarks(rows, currentSort);
    });
    shadow.getElementById('marksWorstBtn').addEventListener('click', () => {
      currentSort = 'worst';
      fillMarks(rows, currentSort);
    });
  }

  async function renderTemplate(templateId) {
    const { css, html } = await loadAssets();
    shadow.innerHTML = `<style>${css}</style>${html}`;
    const template = shadow.getElementById(templateId);
    shadow.innerHTML = `<style>${css}</style>`;
    shadow.appendChild(template.content.cloneNode(true));
  }

  function bindPanelShellEvents() {
    const closeBtn = shadow.getElementById('closeBtn');
    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    const backdrop = shadow.getElementById('backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', e => {
        if (e.target.id === 'backdrop') closePanel();
      });
    }
  }

  async function renderLoadingPanel() {
    await renderTemplate('loadingTemplate');
    bindPanelShellEvents();
  }

  async function renderPanel(model) {
    let currentModel = model;
    await renderTemplate('dashboardTemplate');

    fillDashboard(currentModel);

    bindPanelShellEvents();
    bindCopyHandler();
    shadow.getElementById('rescanBtn').addEventListener('click', () => {
      currentModel = window.CTTBK_DATA.buildModel();
      fillDashboard(currentModel);
    });
    shadow.getElementById('moduleSelect').addEventListener('change', e => {
      selectedModule = Number(e.target.value);
      setLastModule(selectedModule);
      fillDashboard(currentModel);
    });
  }

  function ensureHost() {
    if (hostEl) return;
    hostEl = document.createElement('div');
    hostEl.id = 'cttbk-ext-host';
    document.documentElement.appendChild(hostEl);
    shadow = hostEl.attachShadow({ mode: 'open' });
  }

  function bindCopyHandler() {
    if (copyHandlerBound) return;
    copyHandlerBound = true;
    shadow.addEventListener('click', e => {
      const btn = e.target.closest('.copy-code-btn');
      if (!btn) return;
      const code = btn.dataset.code;
      navigator.clipboard.writeText(code).then(() => {
        btn.classList.add('copied');
        window.setTimeout(() => { btn.classList.remove('copied'); }, 1200);
      }).catch(() => {
        btn.classList.add('failed');
        window.setTimeout(() => { btn.classList.remove('failed'); }, 1200);
      });
    });
  }

  function closePanel() {
    if (shadow) shadow.innerHTML = '';
    panelOpen = false;
    currentPanelMode = null;
  }

  function waitForGrid(timeoutMs) {
    const started = Date.now();
    return new Promise(resolve => {
      const poll = window.setInterval(() => {
        if (window.CTTBK_DATA.gridPresent()) {
          window.clearInterval(poll);
          resolve(true);
          return;
        }
        if (Date.now() - started >= timeoutMs) {
          window.clearInterval(poll);
          resolve(false);
        }
      }, 350);
    });
  }

  async function ensureProgramGrid() {
    if (window.CTTBK_DATA.gridPresent()) return true;
    if (!window.CTTBK_DATA.showProgramButtonPresent()) return false;
    sessionStorage.setItem('cttbk_auto_open', '1');
    window.CTTBK_DATA.clickShowProgramButton();
    const ready = await waitForGrid(10000);
    if (ready) sessionStorage.removeItem('cttbk_auto_open');
    return ready;
  }

  function openTarget(target) {
    const path = target === 'marks' ? MARKS_PATH : PROGRAM_PATH;
    if (location.pathname !== path) {
      sessionStorage.setItem('cttbk_open_target', target);
      location.href = `${location.origin}${path}`;
      return;
    }
    openPanel(target);
  }

  async function openPanel(target) {
    ensureHost();
    panelOpen = true;
    const mode = target || (window.CTTBK_DATA.marksPresent() ? 'marks' : 'courses');
    currentPanelMode = mode;
    if (mode === 'marks') {
      await renderMarksPanel(window.CTTBK_DATA.scrapeMarks());
      return;
    }
    await renderLoadingPanel();
    const ready = await ensureProgramGrid();
    if (!panelOpen) return;
    selectedModule = await getLastModule();
    await renderPanel(ready ? window.CTTBK_DATA.buildModel() : {
      raw: [],
      categories: Object.fromEntries(Object.keys(window.CTTBK_DATA.catMeta).map(key => [key, []])),
      modules: {},
      others: [],
    });
  }

  async function addFab() {
    if (document.getElementById('cttbk-fab-host')) return;
    const { css, html } = await loadAssets();
    const fabHost = document.createElement('div');
    fabHost.id = 'cttbk-fab-host';
    document.documentElement.appendChild(fabHost);
    const fabShadow = fabHost.attachShadow({ mode: 'open' });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    fabShadow.innerHTML = `<style>${css}</style>`;
    fabShadow.appendChild(doc.getElementById('fabStack'));
    fabShadow.getElementById('courseFabBtn').addEventListener('click', () => {
      if (panelOpen && currentPanelMode === 'courses') closePanel();
      else openTarget('courses');
    });
    fabShadow.getElementById('marksFabBtn').addEventListener('click', () => {
      if (panelOpen && currentPanelMode === 'marks') closePanel();
      else openTarget('marks');
    });
  }

  window.CTTBK_UI = { addFab, openPanel, openTarget };
})();
