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
  let chartTooltipBound = false;
  const PROGRAM_PATH = '/Students/StudentProgram.aspx';
  const MARKS_PATH = '/Students/StudentCourseMarks.aspx';
  const GENERAL_PATH = MARKS_PATH;
  const SELECTED_MODULE_KEY = 'cttbk_selected_module';

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

  function extensionURL(path) {
    return globalThis.chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function'
      ? chrome.runtime.getURL(path)
      : null;
  }

  function setText(id, value) {
    const el = shadow && shadow.getElementById(id);
    if (el) el.textContent = value;
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

  function normalizeCourseCode(code) {
    return String(code || '').trim().toUpperCase();
  }

  function isPassingGrade(letter) {
    const point = gradePoint(letter);
    return point != null && point > 0;
  }

  function recalculateTermStats(generalRows, markRows) {
    const terms = Array.from(new Set(generalRows.map(row => row.term).filter(Boolean)))
      .sort((a, b) => String(a).localeCompare(String(b)));
    const marks = markRows
      .filter(row => /^\d{5}$/.test(String(row.term || '')) && row.credit > 0 && normalizeCourseCode(row.code))
      .map(row => ({
        ...row,
        code: normalizeCourseCode(row.code),
        point: gradePoint(row.letterGrade),
      }))
      .filter(row => row.point != null);

    const latestPassTermByCode = new Map();
    marks.forEach(row => {
      if (!isPassingGrade(row.letterGrade)) return;
      const current = latestPassTermByCode.get(row.code);
      if (!current || String(row.term).localeCompare(String(current)) > 0) {
        latestPassTermByCode.set(row.code, row.term);
      }
    });

    const stats = new Map();
    terms.forEach(term => {
      const bestPassingAttempt = new Map();
      marks.forEach(row => {
        if (String(row.term).localeCompare(String(term)) > 0 || !isPassingGrade(row.letterGrade)) return;
        const current = bestPassingAttempt.get(row.code);
        if (
          !current ||
          row.point > current.point ||
          (row.point === current.point && String(row.term).localeCompare(String(current.term)) > 0)
        ) {
          bestPassingAttempt.set(row.code, row);
        }
      });

      let accumulatedCredits = 0;
      let weightedPoints = 0;
      bestPassingAttempt.forEach(row => {
        accumulatedCredits += row.credit;
        weightedPoints += row.credit * row.point;
      });

      const clearedDebtCredits = new Map();
      marks.forEach(row => {
        if (String(row.term).localeCompare(String(term)) > 0) return;
        if (row.point !== 0) return;
        const passTerm = latestPassTermByCode.get(row.code);
        if (!passTerm || String(passTerm).localeCompare(String(term)) <= 0) return;
        clearedDebtCredits.set(row.code, Math.max(clearedDebtCredits.get(row.code) || 0, row.credit));
      });

      const clearedDebt = Array.from(clearedDebtCredits.values()).reduce((sum, credit) => sum + credit, 0);
      stats.set(term, {
        recalculatedCpa: accumulatedCredits ? weightedPoints / accumulatedCredits : null,
        recalculatedAccumulatedCredits: accumulatedCredits,
        clearedDebtCredits: clearedDebt,
      });
    });

    return stats;
  }

  function effectiveMarkRows(rows) {
    const byCode = new Map();
    rows.forEach(row => {
      const code = normalizeCourseCode(row.code);
      if (!code) return;
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code).push(row);
    });

    return Array.from(byCode.values()).map(attempts => {
      const sorted = attempts.slice().sort((a, b) => {
        const termDiff = String(a.term || '').localeCompare(String(b.term || ''));
        if (termDiff) return termDiff;
        return String(a.classCode || '').localeCompare(String(b.classCode || ''));
      });
      const latest = sorted.slice().sort((a, b) => {
        const pointDiff = (gradePoint(b.letterGrade) ?? -1) - (gradePoint(a.letterGrade) ?? -1);
        if (pointDiff) return pointDiff;
        return String(b.term || '').localeCompare(String(a.term || ''));
      })[0];
      const previousAttempt = sorted.length > 1 ? sorted[sorted.length - 2] : null;
      const oldGrades = previousAttempt && previousAttempt !== latest
        ? [String(previousAttempt.letterGrade || '').trim().toUpperCase()].filter(Boolean)
        : [];
      return {
        ...latest,
        oldLetterGrades: oldGrades,
      };
    });
  }

  function applyRecalculatedGeneralRows(generalRows, markRows) {
    if (!generalRows.length || !markRows.length) return generalRows;
    const stats = recalculateTermStats(generalRows, markRows);
    return generalRows.map(row => {
      const stat = stats.get(row.term);
      if (!stat) return row;
      return {
        ...row,
        rawCpa: row.cpa,
        rawAccumulatedCredits: row.accumulatedCredits,
        rawDebtCredits: row.debtCredits,
        cpa: stat.recalculatedCpa,
        accumulatedCredits: stat.recalculatedAccumulatedCredits,
        debtCredits: Math.max(0, (safeNumber(row.debtCredits) ?? 0) - stat.clearedDebtCredits),
        clearedDebtCredits: stat.clearedDebtCredits,
      };
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
      <text x="64" y="61" text-anchor="middle" font-weight="700" font-size="28" fill="#101010">${fmt(cpa)}</text>
      <text x="64" y="84" text-anchor="middle" font-size="15" font-weight="700" fill="#666666">/ 4.0</text>
    </svg>`;
  }

  function safeNumber(value) {
    return typeof value === 'number' && !Number.isNaN(value) ? value : null;
  }

  function valueText(value) {
    const n = safeNumber(value);
    return n == null ? '-' : escapeHTML(fmt(n));
  }

  function warningLevel(value) {
    const match = String(value || '').match(/\d+/);
    return match ? Number(match[0]) : null;
  }

  function warningClass(value) {
    const level = warningLevel(value);
    if (level === 0) return 'warning-good';
    if (level === 1 || level === 2) return 'warning-warn';
    if (level != null && level >= 3) return 'warning-danger';
    return 'warning-unknown';
  }

  function levelNumber(value) {
    const text = String(value || '').toLowerCase();
    if (/ba|3/.test(text)) return 3;
    if (/hai|2/.test(text)) return 2;
    if (/nhất|mot|một|1/.test(text)) return 1;
    return 0;
  }

  function tooltipText(lines) {
    return escapeHTML(lines.filter(line => line != null && line !== '').join('\n'));
  }

  function latestTermRows(rows) {
    return rows.slice().sort((a, b) => String(b.term).localeCompare(String(a.term)));
  }

  function chartPoints(rows, key, min, max, width, height, pad) {
    const denom = Math.max(1, max - min);
    const count = Math.max(1, rows.length - 1);
    return rows.map((row, index) => {
      const value = safeNumber(row[key]) ?? min;
      const x = pad + (width - pad * 2) * (index / count);
      const y = height - pad - ((value - min) / denom) * (height - pad * 2);
      return { x, y, value, term: row.term };
    });
  }

  function lineChartSVG(rows) {
    if (!rows.length) return '<div class="empty-note">Không có dữ liệu kết quả học tập.</div>';
    const ordered = rows.slice().sort((a, b) => String(a.term).localeCompare(String(b.term)));
    const width = 680;
    const height = 260;
    const pad = 34;
    const gpa = chartPoints(ordered, 'gpa', 0, 4, width, height, pad);
    const cpa = chartPoints(ordered, 'cpa', 0, 4, width, height, pad);
    const polyline = points => points.map(p => `${p.x},${p.y}`).join(' ');
    const labels = ordered.map((row, index) => {
      const x = pad + (width - pad * 2) * (index / Math.max(1, ordered.length - 1));
      return `<text x="${x}" y="${height - 8}" text-anchor="middle">${escapeHTML(row.term)}</text>`;
    }).join('');

    return `<svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ GPA và CPA theo học kỳ">
      <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" class="chart-axis"/>
      <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" class="chart-axis"/>
      <text x="8" y="${pad + 4}" class="chart-label">4.0</text>
      <text x="8" y="${height - pad}" class="chart-label">0</text>
      <polyline points="${polyline(gpa)}" class="chart-line chart-line-gpa"/>
      <polyline points="${polyline(cpa)}" class="chart-line chart-line-cpa"/>
      ${gpa.map((p, index) => `<circle cx="${p.x}" cy="${p.y}" r="4" class="chart-dot chart-dot-gpa" data-tooltip="${tooltipText([p.term, `GPA: ${valueText(p.value)}`, `CPA: ${valueText(ordered[index].cpa)}`])}"></circle>`).join('')}
      ${cpa.map((p, index) => `<circle cx="${p.x}" cy="${p.y}" r="4" class="chart-dot chart-dot-cpa" data-tooltip="${tooltipText([p.term, `CPA: ${valueText(p.value)}`, `GPA: ${valueText(ordered[index].gpa)}`])}"></circle>`).join('')}
      ${labels}
    </svg>
    <div class="chart-legend"><span class="legend-gpa">GPA</span><span class="legend-cpa">CPA</span></div>`;
  }

  function termCreditChartSVG(rows) {
    if (!rows.length) return '<div class="empty-note">Không có dữ liệu tín chỉ.</div>';
    const ordered = rows.slice().sort((a, b) => String(a.term).localeCompare(String(b.term)));
    const width = 680;
    const height = 260;
    const pad = 34;
    const maxValue = Math.max(1, ...ordered.map(row => Math.max(
      safeNumber(row.passedCredits) ?? 0,
      safeNumber(row.debtCredits) ?? 0
    )));
    const slot = (width - pad * 2) / Math.max(1, ordered.length);
    const barW = Math.min(20, Math.max(8, slot / 4));
    const bars = ordered.map((row, index) => {
      const x = pad + slot * index + slot / 2;
      const passed = safeNumber(row.passedCredits) ?? 0;
      const debt = safeNumber(row.debtCredits) ?? 0;
      const passedH = (passed / maxValue) * (height - pad * 2);
      const debtH = (debt / maxValue) * (height - pad * 2);
      return `
        <rect x="${x - barW - 2}" y="${height - pad - passedH}" width="${barW}" height="${passedH}" class="chart-bar chart-bar-passed chart-mark" data-tooltip="${tooltipText([row.term, `TC qua: ${valueText(passed)}`, `TC nợ ĐK: ${valueText(debt)}`])}"></rect>
        <rect x="${x + 2}" y="${height - pad - debtH}" width="${barW}" height="${debtH}" class="chart-bar chart-bar-debt chart-mark" data-tooltip="${tooltipText([row.term, `TC nợ ĐK: ${valueText(debt)}`, `TC qua: ${valueText(passed)}`])}"></rect>
        <text x="${x}" y="${height - 8}" text-anchor="middle">${escapeHTML(row.term)}</text>
      `;
    }).join('');

    return `<svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ tín chỉ học kỳ">
      <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" class="chart-axis"/>
      <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" class="chart-axis"/>
      <text x="8" y="${pad + 4}" class="chart-label">${escapeHTML(maxValue)}</text>
      <text x="8" y="${height - pad}" class="chart-label">0</text>
      ${bars}
    </svg>
    <div class="chart-legend"><span class="legend-passed">TC qua</span><span class="legend-debt">TC nợ ĐK</span></div>`;
  }

  function cumulativeCreditChartSVG(rows) {
    if (!rows.length) return '<div class="empty-note">Không có dữ liệu tín chỉ tích lũy.</div>';
    const ordered = rows.slice().sort((a, b) => String(a.term).localeCompare(String(b.term)));
    const width = 680;
    const height = 260;
    const pad = 34;
    const maxValue = Math.max(1, ...ordered.map(row => Math.max(
      safeNumber(row.accumulatedCredits) ?? 0,
      safeNumber(row.registeredCredits) ?? 0
    )));
    const accumulated = chartPoints(ordered, 'accumulatedCredits', 0, maxValue, width, height, pad);
    const registered = chartPoints(ordered, 'registeredCredits', 0, maxValue, width, height, pad);
    const polyline = points => points.map(p => `${p.x},${p.y}`).join(' ');
    const labels = ordered.map((row, index) => {
      const x = pad + (width - pad * 2) * (index / Math.max(1, ordered.length - 1));
      return `<text x="${x}" y="${height - 8}" text-anchor="middle">${escapeHTML(row.term)}</text>`;
    }).join('');

    return `<svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ tín chỉ tích lũy">
      <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" class="chart-axis"/>
      <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" class="chart-axis"/>
      <text x="8" y="${pad + 4}" class="chart-label">${escapeHTML(maxValue)}</text>
      <text x="8" y="${height - pad}" class="chart-label">0</text>
      <polyline points="${polyline(accumulated)}" class="chart-line chart-line-cpa"/>
      <polyline points="${polyline(registered)}" class="chart-line chart-line-registered"/>
      ${accumulated.map((p, index) => `<circle cx="${p.x}" cy="${p.y}" r="4" class="chart-dot chart-dot-cpa" data-tooltip="${tooltipText([p.term, `TC tích lũy: ${valueText(p.value)}`, `TC ĐK: ${valueText(ordered[index].registeredCredits)}`])}"></circle>`).join('')}
      ${registered.map((p, index) => `<circle cx="${p.x}" cy="${p.y}" r="4" class="chart-dot chart-dot-registered" data-tooltip="${tooltipText([p.term, `TC ĐK: ${valueText(p.value)}`, `TC tích lũy: ${valueText(ordered[index].accumulatedCredits)}`])}"></circle>`).join('')}
      ${labels}
    </svg>
    <div class="chart-legend"><span class="legend-cpa">TC tích lũy</span><span class="legend-registered">TC ĐK</span></div>`;
  }

  function statusTimelineSVG(rows) {
    if (!rows.length) return '<div class="empty-note">Không có dữ liệu trạng thái.</div>';
    const ordered = rows.slice().sort((a, b) => String(a.term).localeCompare(String(b.term)));
    const width = 680;
    const height = 260;
    const pad = 44;
    const count = Math.max(1, ordered.length - 1);
    const levelPoints = ordered.map((row, index) => {
      const level = levelNumber(row.level);
      const x = pad + (width - pad * 2) * (index / count);
      const y = height - pad - (Math.min(3, Math.max(0, level)) / 3) * (height - pad * 2);
      return { x, y, level, row };
    });
    const warningPoints = ordered.map((row, index) => {
      const level = warningLevel(row.warning) ?? 0;
      const x = pad + (width - pad * 2) * (index / count);
      const y = height - pad - (Math.min(3, Math.max(0, level)) / 3) * (height - pad * 2);
      return { x, y, level, row };
    });
    const levelLine = levelPoints.map(p => `${p.x},${p.y}`).join(' ');
    const warningLine = warningPoints.map(p => `${p.x},${p.y}`).join(' ');

    return `<svg class="trend-chart status-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ trình độ và cảnh báo theo học kỳ">
      <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" class="chart-axis"/>
      <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" class="chart-axis"/>
      ${[0, 1, 2, 3].map(level => {
        const y = height - pad - (level / 3) * (height - pad * 2);
        return `<line x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}" class="chart-grid-line"/><text x="10" y="${y + 4}" class="chart-label">${level}</text>`;
      }).join('')}
      <polyline points="${levelLine}" class="chart-line chart-line-level"/>
      <polyline points="${warningLine}" class="chart-line chart-line-warning"/>
      ${levelPoints.map(p => `<circle cx="${p.x}" cy="${p.y}" r="5" class="chart-dot chart-dot-level" data-tooltip="${tooltipText([p.row.term, `Trình độ: ${p.row.level || '-'}`, `Cảnh báo: ${p.row.warning || '-'}`])}"></circle>`).join('')}
      ${warningPoints.map(p => `<circle cx="${p.x}" cy="${p.y}" r="5" class="chart-dot ${warningClass(p.row.warning)}" data-tooltip="${tooltipText([p.row.term, `Cảnh báo: ${p.row.warning || '-'}`, `Trình độ: ${p.row.level || '-'}`])}"></circle>`).join('')}
      ${levelPoints.map(p => `<text x="${p.x}" y="${height - 8}" text-anchor="middle">${escapeHTML(p.row.term)}</text>`).join('')}
    </svg>
    <div class="chart-legend"><span class="legend-level">Trình độ</span><span class="legend-good">Mức 0</span><span class="legend-registered">Mức 1-2</span><span class="legend-gpa">Mức 3+</span></div>`;
  }

  async function loadAssets() {
    if (!assetsPromise) {
      const stylesURL = extensionURL('styles.css');
      const panelURL = extensionURL('panel.html');
      if (!stylesURL || !panelURL) {
        assetsPromise = Promise.reject(new Error('Extension runtime is unavailable. Reload the CTT-SIS tab after reloading the extension.'));
        return assetsPromise;
      }
      assetsPromise = Promise.all([
        fetch(stylesURL).then(r => r.text()),
        fetch(panelURL).then(r => r.text()),
      ]).then(([css, html]) => ({ css, html }));
    }
    return assetsPromise;
  }

  async function getLastModule() {
    try {
      const stored = window.localStorage.getItem(SELECTED_MODULE_KEY);
      if (stored != null && stored !== '') return Number(stored);
    } catch (e) {}

    try {
      if (!globalThis.chrome || !chrome.storage || !chrome.storage.local) return null;
      const r = await chrome.storage.local.get(SELECTED_MODULE_KEY);
      return r[SELECTED_MODULE_KEY] == null ? null : Number(r[SELECTED_MODULE_KEY]);
    } catch (e) {
      return null;
    }
  }

  function setLastModule(num) {
    try {
      window.localStorage.setItem(SELECTED_MODULE_KEY, String(num));
    } catch (e) {}

    try {
      if (globalThis.chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [SELECTED_MODULE_KEY]: num });
      }
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

  function marksGradeChartHTML(rows) {
    const grades = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F'];
    const counts = Object.fromEntries(grades.map(grade => [grade, 0]));
    rows.forEach(row => {
      const grade = String(row.letterGrade || '').trim().toUpperCase();
      if (counts[grade] == null) counts[grade] = 0;
      counts[grade]++;
    });
    const max = Math.max(1, ...Object.values(counts));

    return `<div class="grade-distribution">${grades.map(grade => {
      const count = counts[grade] || 0;
      return `<div class="grade-bar-row">
        <span class="grade-bar-label">${escapeHTML(grade)}</span>
        <div class="grade-bar-track"><div class="grade-bar-fill grade-${grade.replace('+', 'plus').toLowerCase()}" style="--pct:${count / max * 100}%"></div></div>
        <span class="grade-bar-count">${count}</span>
      </div>`;
    }).join('')}</div>`;
  }

  function fillMarks(rows, direction) {
    const sorted = sortMarks(rows, direction);

    shadow.getElementById('marksGradeChart').innerHTML = marksGradeChartHTML(rows);
    shadow.getElementById('marksSortLabel').textContent = direction === 'worst' ? 'Tệ nhất trước' : 'Tốt nhất trước';
    shadow.getElementById('marksBody').innerHTML = sorted.map(row => `
      <tr>
        <td class="term-cell">${escapeHTML(row.term)}</td>
        <td class="code">${escapeHTML(row.code)}</td>
        <td>${escapeHTML(row.name)}</td>
        <td class="credit">${escapeHTML(row.credit || 0)}</td>
        <td class="grade-cell">${markScoreText(row.processScore)}</td>
        <td class="grade-cell">${markScoreText(row.examScore)}</td>
        <td class="grade-cell">${gradeBadge(row.letterGrade)}</td>
        <td class="grade-cell old-grade-cell">${(row.oldLetterGrades || []).length ? row.oldLetterGrades.map(gradeBadge).join(' ') : '-'}</td>
        <td class="grade-cell">${gradePointText(row.letterGrade)}</td>
      </tr>
    `).join('');
  }

  async function renderMarksPanel(rows) {
    let currentSort = 'best';
    const displayRows = effectiveMarkRows(rows);
    await renderTemplate('marksTemplate');
    fillMarks(displayRows, currentSort);
    bindPanelShellEvents();
    shadow.getElementById('marksSortToggleBtn').addEventListener('click', () => {
      currentSort = currentSort === 'best' ? 'worst' : 'best';
      fillMarks(displayRows, currentSort);
    });
  }

  function fillGeneral(rows) {
    const latest = latestTermRows(rows)[0];
    setText('generalCount', `${rows.length} học kỳ`);
    setText('latestTerm', latest ? latest.term : '-');
    setText('latestCpa', latest ? valueText(latest.cpa) : '-');
    setText('latestAccumulatedCredits', latest ? valueText(latest.accumulatedCredits) : '-');
    setText('latestWarning', latest && latest.warning ? latest.warning : '-');
    const warningMetric = shadow.getElementById('latestWarningMetric');
    if (warningMetric) {
      warningMetric.className = `metric ${latest ? warningClass(latest.warning) : 'warning-unknown'}`;
    }
    shadow.getElementById('gpaCpaChart').innerHTML = lineChartSVG(rows);
    shadow.getElementById('termCreditChart').innerHTML = termCreditChartSVG(rows);
    shadow.getElementById('cumulativeCreditChart').innerHTML = cumulativeCreditChartSVG(rows);
    shadow.getElementById('statusTimeline').innerHTML = statusTimelineSVG(rows);
    shadow.getElementById('generalBody').innerHTML = latestTermRows(rows).map(row => `
      <tr>
        <td class="grade-cell">${escapeHTML(row.term)}</td>
        <td class="grade-cell">${valueText(row.gpa)}</td>
        <td class="grade-cell">${valueText(row.cpa)}</td>
        <td class="credit">${valueText(row.passedCredits)}</td>
        <td class="credit wide-credit">${valueText(row.accumulatedCredits)}</td>
        <td class="credit wide-credit">${valueText(row.debtCredits)}</td>
        <td class="credit">${valueText(row.registeredCredits)}</td>
        <td>${escapeHTML(row.level || '-')}</td>
        <td class="center-cell"><span class="warning-chip ${warningClass(row.warning)}">${escapeHTML(row.warning || '-')}</span></td>
      </tr>
    `).join('');
  }

  async function renderGeneralPanel(rows) {
    await renderTemplate('generalTemplate');
    fillGeneral(rows);
    bindPanelShellEvents();
    bindChartTooltips();
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

  function bindChartTooltips() {
    let tooltip = shadow.getElementById('chartTooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'chartTooltip';
      tooltip.className = 'chart-tooltip';
      (shadow.getElementById('backdrop') || shadow).appendChild(tooltip);
    }

    function moveTooltip(e) {
      const backdrop = shadow.getElementById('backdrop');
      const rect = backdrop ? backdrop.getBoundingClientRect() : { left: 0, top: 0 };
      const scrollLeft = backdrop ? backdrop.scrollLeft : 0;
      const scrollTop = backdrop ? backdrop.scrollTop : 0;
      tooltip.style.left = `${e.clientX - rect.left + scrollLeft + 12}px`;
      tooltip.style.top = `${e.clientY - rect.top + scrollTop + 12}px`;
    }

    if (chartTooltipBound) return;
    chartTooltipBound = true;

    shadow.addEventListener('pointerover', e => {
      const target = e.target.closest && e.target.closest('[data-tooltip]');
      if (!target) return;
      tooltip.textContent = target.dataset.tooltip || '';
      if (tooltip.textContent) {
        moveTooltip(e);
        tooltip.classList.add('is-visible');
      }
    });

    shadow.addEventListener('pointermove', e => {
      if (!tooltip.classList.contains('is-visible')) return;
      if (!(e.target.closest && e.target.closest('[data-tooltip]'))) return;
      moveTooltip(e);
    });

    shadow.addEventListener('pointerout', e => {
      const target = e.target.closest && e.target.closest('[data-tooltip]');
      if (!target) return;
      const next = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('[data-tooltip]');
      if (next === target) return;
      tooltip.classList.remove('is-visible');
    });
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
    chartTooltipBound = false;
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
    if (target === 'general' && window.CTTBK_DATA.generalResultsPresent()) {
      openPanel('general');
      return;
    }
    if (target === 'marks' && window.CTTBK_DATA.marksPresent()) {
      openPanel('marks');
      return;
    }
    if (target === 'courses' && (window.CTTBK_DATA.gridPresent() || window.CTTBK_DATA.showProgramButtonPresent())) {
      openPanel('courses');
      return;
    }

    const path = {
      courses: PROGRAM_PATH,
      marks: MARKS_PATH,
      general: GENERAL_PATH,
    }[target] || PROGRAM_PATH;
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
    const mode = target || (window.CTTBK_DATA.generalResultsPresent() ? 'general' : (window.CTTBK_DATA.marksPresent() ? 'marks' : 'courses'));
    currentPanelMode = mode;
    if (mode === 'marks') {
      await renderMarksPanel(window.CTTBK_DATA.scrapeMarks());
      return;
    }
    if (mode === 'general') {
      await renderGeneralPanel(applyRecalculatedGeneralRows(
        window.CTTBK_DATA.scrapeGeneralResults(),
        window.CTTBK_DATA.scrapeMarks()
      ));
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
    fabShadow.getElementById('generalFabBtn').addEventListener('click', () => {
      if (panelOpen && currentPanelMode === 'general') closePanel();
      else openTarget('general');
    });
  }

  window.CTTBK_UI = { addFab, openPanel, openTarget };
})();
