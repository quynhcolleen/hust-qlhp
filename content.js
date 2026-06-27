/* CTT-SIS Tiến độ học tập — content script
 * Scrapes the "Chương trình đào tạo" grid on ctt-sis.hust.edu.vn,
 * classifies courses into the official knowledge blocks, computes CPA
 * and missing courses/credits, and renders an overlay panel.
 *
 * The scraper matches by HEADER TEXT and CELL SHAPE rather than by the
 * page's auto-generated ASP.NET control IDs, since those IDs are not
 * stable. If HUST changes the grid layout this may need re-tuning, but
 * the heuristics below are deliberately loose to tolerate small changes.
 */

(function () {
  'use strict';

  const CODE_RE = /^[A-Z]{2,5}\d{3,5}$/;

  const CAT_META = {
    tn:    { name: 'Đồ án tốt nghiệp cử nhân', rule: 'all' },
    triet: { name: 'Lý luận chính trị + Pháp luật đại cương (gồm Triết học)', rule: 'all' },
    dc:    { name: 'Đại cương — Toán & Khoa học cơ bản', rule: 'all' },
    cs:    { name: 'Cơ sở & cốt lõi ngành', rule: 'all' },
    bt:    { name: 'Khối kiến thức bổ trợ', rule: 3 },
    td:    { name: 'Giáo dục thể chất (kể cả tự chọn II/C/D/E)', rule: 4 },
    qp:    { name: 'Giáo dục Quốc phòng - An ninh', rule: 'all' },
    en:    { name: 'Tiếng Anh', rule: 'all' },
    tt:    { name: 'Thực tập kỹ thuật', rule: 'all' },
    nc:    { name: 'Đồ án nghiên cứu Cử nhân (lựa chọn thay thế, không cộng vào tổng thiếu)', rule: 'all', optional: true },
  };
  const MANDATORY_KEYS = ['tn', 'triet', 'dc', 'cs', 'tt']; // used for the "còn thiếu để TN" headline

  /* ---------------- text helpers ---------------- */
  function deaccent(str) {
    return (str || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .toLowerCase();
  }

  /* ---------------- scraping ---------------- */
  function scrapeCourses() {
    const out = [];
    const seen = new Set();
    const tables = Array.from(document.querySelectorAll('table'));
    tables.forEach(table => {
      table.querySelectorAll('tr').forEach(tr => {
        const cells = Array.from(tr.children)
          .filter(el => el.tagName === 'TD' || el.tagName === 'TH')
          .map(td => (td.innerText || '').trim());
        if (cells.length < 8) return;
        const idx = cells.findIndex(c => CODE_RE.test(c));
        if (idx < 0) return;
        const slice = cells.slice(idx, idx + 11);
        if (slice.length < 11) return;
        const [code, name, term, , tcDT, , maHPHoc, ghiChu, diemChu, diemSo, vienKhoa] = slice;
        if (!name || name.length < 2) return;
        const key = code + '|' + (term || '') + '|' + ghiChu;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({
          code, name,
          term: term ? (Number(term) || null) : null,
          credit: Number(tcDT) || 0,
          taken: !!maHPHoc && maHPHoc.trim().length > 0,
          grade: diemChu || null,
          score: diemSo && diemSo.trim() !== '' ? parseFloat(diemSo) : null,
          ghiChu: ghiChu || '',
          vienKhoa: vienKhoa || '',
        });
      });
    });
    return out;
  }

  function gridPresent() {
    return document.body && document.body.innerText.includes('Mã HP học');
  }

  /* ---------------- classification ---------------- */
  function parseModuleTags(text) {
    const m = text.match(/m[ôo]\s*[đd]un\s*([\d,\s]+)(.*)/i);
    if (!m) return null;
    const nums = m[1].split(',').map(s => s.trim()).filter(Boolean).map(Number).filter(n => !isNaN(n));
    if (nums.length === 0) return null;
    let desc = (m[2] || '').replace(/^[:\s]+/, '').replace(/^m[ôo]\s*[đd]un\s*:\s*/i, '').trim();
    return { nums, desc };
  }

  function classify(course) {
    const g = deaccent(course.ghiChu);
    const code = course.code;
    if (/m[oô]\s*[dđ]un/.test(g)) return { type: 'module' };
    if (g.includes('toan va khoa hoc co ban') || g.includes('toan & khoa hoc co ban')) return { type: 'cat', key: 'dc' };
    if (g.includes('cot loi nganh') || g.includes('co so va cot loi')) return { type: 'cat', key: 'cs' };
    if (g.includes('ly luan chinh tri') || g.includes('phap luat')) return { type: 'cat', key: 'triet' };
    if (g.includes('giao duc the chat') || g.includes('tcii') || code.startsWith('PE')) return { type: 'cat', key: 'td' };
    if (g.includes('bo tro')) return { type: 'cat', key: 'bt' };
    if (g.includes('quoc phong')) return { type: 'cat', key: 'qp' };
    if (g.includes('tieng anh') || code.startsWith('FL')) return { type: 'cat', key: 'en' };
    if (g.includes('thuc tap')) return { type: 'cat', key: 'tt' };
    if (g.includes('do an tot nghiep')) return { type: 'cat', key: 'tn' };
    if (g.includes('do an nghien cuu')) return { type: 'cat', key: 'nc' };
    return { type: 'other' };
  }

  function buildModel() {
    const raw = scrapeCourses();
    const categories = {};
    Object.keys(CAT_META).forEach(k => (categories[k] = []));
    const modules = {};
    const others = [];

    raw.forEach(c => {
      const cl = classify(c);
      if (cl.type === 'cat') {
        categories[cl.key].push(c);
      } else if (cl.type === 'module') {
        const parsed = parseModuleTags(c.ghiChu);
        if (parsed) {
          parsed.nums.forEach(n => {
            if (!modules[n]) modules[n] = { name: null, courses: [] };
            if (!modules[n].courses.find(x => x.code === c.code)) modules[n].courses.push(c);
            if (parsed.desc && !modules[n].name) modules[n].name = parsed.desc;
          });
        } else {
          others.push(c);
        }
      } else {
        others.push(c);
      }
    });

    return { raw, categories, modules, others };
  }

  /* ---------------- aggregation ---------------- */
  function summarize(courses) {
    const total = courses.length;
    const done = courses.filter(c => c.taken).length;
    const totalCredit = courses.reduce((s, c) => s + (c.credit || 0), 0);
    const doneCredit = courses.filter(c => c.taken).reduce((s, c) => s + (c.credit || 0), 0);
    return {
      total, done, totalCredit, doneCredit,
      missing: courses.filter(c => !c.taken),
      passed: courses.filter(c => c.taken),
    };
  }

  function statusFor(rule, sum) {
    if (rule === 'all') {
      return sum.done === sum.total
        ? { label: 'Hoàn thành', cls: 'done' }
        : { label: `Còn thiếu ${sum.total - sum.done} môn · ${sum.totalCredit - sum.doneCredit} TC`, cls: 'todo' };
    }
    return sum.done >= rule
      ? { label: `Đã đủ (${sum.done}/${rule} môn)`, cls: 'done' }
      : { label: `Cần thêm ${rule - sum.done} môn (đã ${sum.done}/${rule})`, cls: 'todo' };
  }

  function fmt(n) { return (Math.round(n * 100) / 100).toString(); }

  /* ---------------- UI (shadow DOM) ---------------- */
  let hostEl, shadow, panelOpen = false;

  const STYLE = `
    :host { all: initial; }
    *{box-sizing:border-box; font-family:'Inter',system-ui,sans-serif;}
    .mono{font-family:'JetBrains Mono',monospace;}
    .backdrop{
      position:fixed; inset:0; background:rgba(10,10,12,.55);
      z-index:2147483646; display:flex; justify-content:center; align-items:flex-start;
      padding:40px 16px; overflow:auto;
    }
    .panel{
      width:100%; max-width:880px; background:#14151A; color:#EDEDF0;
      border:1px solid #2C2F3A; border-radius:16px; padding:24px 26px 30px;
      box-shadow:0 20px 60px rgba(0,0,0,.5);
    }
    .panel-head{display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; gap:10px;}
    .panel-head h2{font-family:'Space Grotesk',sans-serif; font-size:18px; margin:0;}
    .panel-head .sub{font-size:12px; color:#9296A3; margin-top:3px;}
    .icon-btn{
      background:#1E2028; border:1px solid #2C2F3A; color:#9296A3; border-radius:8px;
      padding:6px 10px; cursor:pointer; font-size:12px;
    }
    .icon-btn:hover{color:#EDEDF0; border-color:#5EE6D0;}
    .btn-row{display:flex; gap:8px;}

    .overview{display:grid; grid-template-columns:150px 1fr 1fr; gap:14px; margin-bottom:20px;}
    @media (max-width:680px){ .overview{grid-template-columns:1fr;} }
    .ov-panel{background:#1B1D25; border:1px solid #2C2F3A; border-radius:14px; padding:16px;}
    .gauge-panel{display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px;}
    .gauge-label{font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; color:#5A5E6B;}
    .stat-row{display:flex; flex-direction:column; justify-content:center; gap:8px;}
    .stat-row .big{font-family:'Space Grotesk',sans-serif; font-size:24px; font-weight:600;}
    .stat-row .lbl{font-size:11.5px; color:#9296A3;}
    .accent-text{color:#5EE6D0;} .warn-text{color:#F2A65A;}

    .card{background:#1B1D25; border:1px solid #2C2F3A; border-radius:14px; padding:16px 18px; margin-bottom:14px;}
    .card-head{display:flex; justify-content:space-between; align-items:baseline; gap:10px; margin-bottom:8px; flex-wrap:wrap;}
    .card-head h3{font-family:'Space Grotesk',sans-serif; font-size:14px; margin:0; font-weight:600;}
    .rule-tag{font-size:10px; font-family:'JetBrains Mono',monospace; color:#5A5E6B; background:#22242E; padding:2px 8px; border-radius:10px; white-space:nowrap;}
    .badge-status{font-size:11.5px; font-weight:600; padding:3px 10px; border-radius:20px; white-space:nowrap;}
    .badge-status.done{background:#2E4F4A; color:#5EE6D0;}
    .badge-status.todo{background:#4A3C26; color:#F2A65A;}
    .bar{height:6px; background:#22242E; border-radius:4px; overflow:hidden; margin:8px 0 6px;}
    .bar-fill{height:100%; background:#5EE6D0; border-radius:4px;}
    .bar-fill.warnfill{background:#F2A65A;}
    .meta-line{font-size:11.5px; color:#9296A3; display:flex; justify-content:space-between; flex-wrap:wrap; gap:6px;}
    details{margin-top:8px;}
    summary{cursor:pointer; font-size:12px; color:#8C97F8; list-style:none;}
    summary::-webkit-details-marker{display:none;}
    summary:before{content:"▸ ";}
    details[open] summary:before{content:"▾ ";}
    table.course-list{width:100%; border-collapse:collapse; margin-top:6px; font-size:12px;}
    table.course-list td{padding:4px 4px; border-bottom:1px solid #2C2F3A;}
    table.course-list .code{font-family:'JetBrains Mono',monospace; color:#9296A3; white-space:nowrap;}
    table.course-list .credit{text-align:right; color:#5A5E6B; white-space:nowrap;}
    table.course-list tr:last-child td{border-bottom:none;}
    .term-sm{color:#5A5E6B; font-size:10.5px;}
    .pass-row{display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;}
    .pass-chip{font-family:'JetBrains Mono',monospace; font-size:10.5px; background:#2E4F4A; color:#5EE6D0; padding:2px 8px; border-radius:8px;}

    .module-card select{
      background:#22242E; color:#EDEDF0; border:1px solid #2C2F3A; border-radius:8px;
      padding:7px 10px; font-family:'JetBrains Mono',monospace; font-size:12.5px; margin-top:4px;
    }
    .empty-note{font-size:12px; color:#5A5E6B; padding:8px 0;}
    footer.note{margin-top:18px; color:#5A5E6B; font-size:10.5px; line-height:1.6;}

    .fab{
      position:fixed; right:22px; bottom:22px; z-index:2147483647;
      background:#1B1D25; color:#EDEDF0; border:1px solid #2C2F3A; border-radius:30px;
      padding:11px 18px; font-family:'Space Grotesk',sans-serif; font-weight:600; font-size:13px;
      cursor:pointer; box-shadow:0 6px 20px rgba(0,0,0,.4); display:flex; align-items:center; gap:8px;
    }
    .fab:hover{border-color:#5EE6D0; color:#5EE6D0;}
  `;

  function courseTable(courses, showCredit) {
    if (!courses.length) return '<div class="empty-note">Không có môn nào.</div>';
    return '<table class="course-list"><tbody>' + courses.map(c => `
      <tr>
        <td class="code">${c.code}</td>
        <td>${c.name}${c.term ? ` <span class="term-sm">(kỳ ${c.term})</span>` : ''}</td>
        ${showCredit ? `<td class="credit">${c.credit || 0} TC</td>` : ''}
      </tr>`).join('') + '</tbody></table>';
  }

  function arcPath(cx, cy, r, a0, a1) {
    const toRad = a => (a - 90) * Math.PI / 180;
    const x0 = cx + r * Math.cos(toRad(a0)), y0 = cy + r * Math.sin(toRad(a0));
    const x1 = cx + r * Math.cos(toRad(a1)), y1 = cy + r * Math.sin(toRad(a1));
    const large = (a1 - a0) > 180 ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  }

  function gaugeSVG(cpa) {
    const r = 50, cx = 64, cy = 64, start = -220, end = 40, total = end - start;
    const pct = Math.max(0, Math.min(1, cpa / 4));
    const fillEnd = start + total * pct;
    return `<svg width="128" height="128" viewBox="0 0 128 128">
      <path d="${arcPath(cx, cy, r, start, end)}" fill="none" stroke="#2C2F3A" stroke-width="9" stroke-linecap="round"/>
      <path d="${arcPath(cx, cy, r, start, fillEnd)}" fill="none" stroke="#5EE6D0" stroke-width="9" stroke-linecap="round"/>
      <text x="64" y="60" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="26" fill="#EDEDF0">${fmt(cpa)}</text>
      <text x="64" y="78" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" fill="#9296A3">/ 4.0</text>
    </svg>`;
  }

  async function getLastModule() {
    try {
      const r = await chrome.storage.local.get('cttbk_selected_module');
      return r.cttbk_selected_module || null;
    } catch (e) { return null; }
  }
  function setLastModule(num) {
    try { chrome.storage.local.set({ cttbk_selected_module: num }); } catch (e) {}
  }

  async function renderPanel(model) {
    if (!shadow) return;
    const moduleNums = Object.keys(model.modules).map(Number).sort((a, b) => a - b);
    const lastModule = await getLastModule();
    let selectedModule = moduleNums.includes(lastModule) ? lastModule : (moduleNums[0] || null);

    function moduleLabel(n) {
      const m = model.modules[n];
      return m.name ? `Mô đun ${n}: ${m.name}` : `Mô đun ${n}`;
    }

    function computeAll() {
      let all = [];
      Object.values(model.categories).forEach(arr => all.push(...arr));
      if (selectedModule != null && model.modules[selectedModule]) all.push(...model.modules[selectedModule].courses);

      const gradeable = all.filter(c => c.taken && c.credit > 0 && typeof c.score === 'number' && !isNaN(c.score));
      const totalW = gradeable.reduce((s, c) => s + c.credit * c.score, 0);
      const totalC = gradeable.reduce((s, c) => s + c.credit, 0);
      const cpa = totalC ? totalW / totalC : 0;

      const doneCredit = all.filter(c => c.taken).reduce((s, c) => s + (c.credit || 0), 0);
      const doneCourses = all.filter(c => c.taken).length;

      let missingCredit = 0;
      MANDATORY_KEYS.forEach(k => {
        const s = summarize(model.categories[k]);
        missingCredit += (s.totalCredit - s.doneCredit);
      });

      return { cpa, doneCredit, doneCourses, total: all.length, missingCredit };
    }

    function categoryCardHTML(key) {
      const meta = CAT_META[key];
      const courses = model.categories[key];
      const sum = summarize(courses);
      const st = statusFor(meta.rule, sum);
      const pct = meta.rule === 'all'
        ? (sum.totalCredit ? sum.doneCredit / sum.totalCredit * 100 : (sum.total ? sum.done / sum.total * 100 : 100))
        : Math.min(100, sum.done / meta.rule * 100);
      if (sum.total === 0) {
        return `<div class="card"><div class="card-head"><h3>${meta.name}</h3></div>
          <div class="empty-note">Không tìm thấy môn nào thuộc khối này trong bảng hiện tại.</div></div>`;
      }
      return `<div class="card">
        <div class="card-head">
          <h3>${meta.name}</h3>
          <span class="rule-tag">${meta.rule === 'all' ? 'bắt buộc tất cả' : `cần qua ${meta.rule} môn`}</span>
        </div>
        <div class="bar"><div class="bar-fill ${st.cls === 'todo' ? 'warnfill' : ''}" style="width:${pct}%"></div></div>
        <div class="meta-line">
          <span>${sum.done}/${sum.total} môn đã qua${sum.totalCredit ? ` · ${sum.doneCredit}/${sum.totalCredit} TC` : ''}</span>
          <span class="badge-status ${st.cls}">${st.label}</span>
        </div>
        ${st.cls === 'done' && meta.rule !== 'all' ? `<div class="pass-row">${sum.passed.map(c => `<span class="pass-chip">${c.code}</span>`).join('')}</div>` : ''}
        ${sum.missing.length ? `<details><summary>Xem ${sum.missing.length} môn còn thiếu</summary>${courseTable(sum.missing, sum.totalCredit > 0)}</details>` : ''}
      </div>`;
    }

    function moduleBodyHTML() {
      if (selectedModule == null) return '<div class="empty-note">Không tìm thấy mô đun nào trong bảng hiện tại.</div>';
      const courses = model.modules[selectedModule].courses;
      const sum = summarize(courses);
      const pct = sum.totalCredit ? sum.doneCredit / sum.totalCredit * 100 : 0;
      return `
        <div class="bar" style="margin-top:12px;"><div class="bar-fill ${sum.done < sum.total ? 'warnfill' : ''}" style="width:${pct}%"></div></div>
        <div class="meta-line">
          <span>${sum.done}/${sum.total} môn đã qua · ${sum.doneCredit}/${sum.totalCredit} TC</span>
          <span class="badge-status ${sum.done === sum.total ? 'done' : 'todo'}">${sum.done === sum.total ? 'Hoàn thành' : `Còn thiếu ${sum.total - sum.done} môn · ${sum.totalCredit - sum.doneCredit} TC`}</span>
        </div>
        ${courseTable(courses, true)}
      `;
    }

    function fullRender() {
      const totals = computeAll();
      const catHTML = Object.keys(CAT_META).map(categoryCardHTML).join('');
      const moduleOptions = moduleNums.map(n => `<option value="${n}" ${n === selectedModule ? 'selected' : ''}>${moduleLabel(n)}</option>`).join('');
      const othersHTML = model.others.length ? `
        <div class="card">
          <div class="card-head"><h3>Môn chưa phân loại</h3><span class="rule-tag">không áp dụng quy tắc</span></div>
          <div class="meta-line"><span>${model.others.length} môn không khớp từ khóa phân loại nào — kiểm tra thủ công nếu cần.</span></div>
          <details><summary>Xem danh sách</summary>${courseTable(model.others, true)}</details>
        </div>` : '';

      shadow.innerHTML = `
        <style>${STYLE}</style>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
        <div class="backdrop" id="backdrop">
          <div class="panel">
            <div class="panel-head">
              <div>
                <h2>Tiến độ học tập</h2>
                <div class="sub">Quét tự động từ bảng Chương trình đào tạo trên trang này</div>
              </div>
              <div class="btn-row">
                <button class="icon-btn" id="rescanBtn">↻ Quét lại</button>
                <button class="icon-btn" id="closeBtn">✕ Đóng</button>
              </div>
            </div>

            <div class="overview">
              <div class="ov-panel gauge-panel">
                ${gaugeSVG(totals.cpa)}
                <div class="gauge-label">CPA tích lũy</div>
              </div>
              <div class="ov-panel stat-row">
                <div><span class="big accent-text">${totals.doneCredit}</span> <span class="lbl">tín chỉ tích lũy (đã tính CPA)</span></div>
                <div><span class="big">${totals.doneCourses}</span> <span class="lbl">môn đã qua / ${totals.total} môn đang theo dõi</span></div>
              </div>
              <div class="ov-panel stat-row">
                <div><span class="big warn-text">${totals.missingCredit}</span> <span class="lbl">TC bắt buộc còn thiếu (chưa gồm mô đun)</span></div>
                <div class="lbl">Chọn mô đun chuyên ngành bên dưới để cộng thêm phần thiếu của mô đun đó.</div>
              </div>
            </div>

            ${catHTML}
            ${othersHTML}

            <div class="card module-card">
              <div class="card-head">
                <h3>Mô đun chuyên ngành</h3>
                <span class="rule-tag">bắt buộc trong mô đun đã chọn</span>
              </div>
              <label class="meta-line" style="margin-bottom:4px;">Chọn mô đun
                <select id="moduleSelect">${moduleOptions}</select>
              </label>
              <div id="moduleBody">${moduleBodyHTML()}</div>
            </div>

            <footer class="note">
              Quy tắc: Đại cương, Cơ sở &amp; cốt lõi ngành, Lý luận chính trị + Pháp luật, GDQP-AN, Tiếng Anh, Thực tập, Đồ án tốt nghiệp và mô đun đã chọn — bắt buộc qua tất cả các môn.
              Giáo dục thể chất — cần qua 4 môn. Khối kiến thức bổ trợ — cần qua 3 môn.
              CPA tính theo trọng số TC × điểm số 4.0 trên các môn có tín chỉ &gt; 0 và đã có điểm.
              Phân loại tự động theo nội dung "Ghi chú loại HP" — bấm "Quét lại" sau khi đổi bộ lọc/chương trình trên trang.
            </footer>
          </div>
        </div>
      `;

      shadow.getElementById('closeBtn').addEventListener('click', closePanel);
      shadow.getElementById('backdrop').addEventListener('click', e => { if (e.target.id === 'backdrop') closePanel(); });
      shadow.getElementById('rescanBtn').addEventListener('click', () => {
        const fresh = buildModel();
        model = fresh;
        fullRender();
      });
      const sel = shadow.getElementById('moduleSelect');
      if (sel) {
        sel.addEventListener('change', () => {
          selectedModule = Number(sel.value);
          setLastModule(selectedModule);
          fullRender();
        });
      }
    }

    fullRender();
  }

  function ensureHost() {
    if (hostEl) return;
    hostEl = document.createElement('div');
    hostEl.id = 'cttbk-ext-host';
    document.documentElement.appendChild(hostEl);
    shadow = hostEl.attachShadow({ mode: 'open' });
  }

  function closePanel() {
    if (shadow) shadow.innerHTML = '';
    panelOpen = false;
  }

  async function openPanel() {
    ensureHost();
    panelOpen = true;
    const model = buildModel();
    await renderPanel(model);
  }

  function addFab() {
    if (document.getElementById('cttbk-fab-host')) return;
    const fabHost = document.createElement('div');
    fabHost.id = 'cttbk-fab-host';
    document.documentElement.appendChild(fabHost);
    const fabShadow = fabHost.attachShadow({ mode: 'open' });
    fabShadow.innerHTML = `<style>${STYLE}</style><button class="fab" id="fabBtn">📊 Tổng hợp CTĐT</button>`;
    fabShadow.getElementById('fabBtn').addEventListener('click', () => {
      if (panelOpen) { closePanel(); } else { openPanel(); }
    });
  }

  /* ---------------- bootstrap ---------------- */
  let tries = 0;
  const poll = setInterval(() => {
    tries++;
    if (gridPresent()) {
      addFab();
      clearInterval(poll);
    } else if (tries > 40) { // ~32s, give up quietly
      clearInterval(poll);
    }
  }, 800);
})();