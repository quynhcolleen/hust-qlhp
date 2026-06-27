/* CTT-SIS Tiến độ học tập - data scraper/content bootstrap. */
(function () {
  'use strict';

  const CODE_RE = /^[A-Z]{2,5}\d{3,5}$/;

  const CAT_META = {
    tn: { name: 'Đồ án tốt nghiệp cử nhân', rule: 'all' },
    triet: { name: 'Lý luận chính trị + Pháp luật đại cương', rule: 'all' },
    dc: { name: 'Đại cương - Toán & Khoa học cơ bản', rule: 'all' },
    cs: { name: 'Cơ sở & cốt lõi ngành', rule: 'all' },
    bt: { name: 'Khối kiến thức bổ trợ', rule: 3 },
    td: { name: 'Giáo dục thể chất', rule: 5 },
    qp: { name: 'Giáo dục Quốc phòng - An ninh', rule: 'all' },
    en: { name: 'Tiếng Anh', rule: 'all' },
    tt: { name: 'Thực tập kỹ thuật', rule: 'all' },
    nc: { name: 'Đồ án nghiên cứu Cử nhân', rule: 'all', optional: true },
  };
  const MANDATORY_KEYS = ['tn', 'triet', 'dc', 'cs', 'tt'];

  function deaccent(str) {
    return (str || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .toLowerCase();
  }

  function scrapeCourses() {
    const out = [];
    const seen = new Set();
    let currentTypeHeader = '';
    document.querySelectorAll('table').forEach(table => {
      table.querySelectorAll('tr').forEach(tr => {
        const cells = Array.from(tr.children)
          .filter(el => el.tagName === 'TD' || el.tagName === 'TH')
          .map(td => (td.innerText || '').trim());
        const rowText = cells.join(' | ');
        if (/Mã loại HP|Loại HP/i.test(rowText)) currentTypeHeader = rowText;
        if (cells.length < 8) return;
        const idx = cells.findIndex(c => CODE_RE.test(c));
        if (idx < 0) return;
        const slice = cells.slice(idx, idx + 11);
        if (slice.length < 11) return;

        const [code, name, term, , tcDT, , maHPHoc, ghiChu, diemChu, diemSo, vienKhoa] = slice;
        if (!name || name.length < 2) return;

        const key = `${code}|${term || ''}|${ghiChu}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({
          code,
          name,
          term: term ? (Number(term) || null) : null,
          credit: Number(tcDT) || 0,
          taken: !!maHPHoc && maHPHoc.trim().length > 0,
          grade: diemChu || null,
          score: diemSo && diemSo.trim() !== '' ? parseFloat(diemSo) : null,
          ghiChu: ghiChu || '',
          vienKhoa: vienKhoa || '',
          typeHeader: currentTypeHeader,
        });
      });
    });
    return out;
  }

  function gridPresent() {
    return document.body && document.body.innerText.includes('Mã HP học');
  }

  function parseModuleTags(text) {
    const m = text.match(/m[ôo]\s*[đd]un\s*([\d,\s]+)(.*)/i);
    if (!m) return null;
    const nums = m[1].split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
    if (!nums.length) return null;
    const desc = (m[2] || '').replace(/^[:\s]+/, '').replace(/^m[ôo]\s*[đd]un\s*:\s*/i, '').trim();
    return { nums, desc };
  }

  function classify(course) {
    const g = deaccent(course.ghiChu);
    const header = deaccent(course.typeHeader);
    const faculty = deaccent(course.vienKhoa);
    const code = course.code;
    if (/m[oô]\s*[dđ]un/.test(g)) return { type: 'module' };
    if (g.includes('toan va khoa hoc co ban') || g.includes('toan & khoa hoc co ban')) return { type: 'cat', key: 'dc' };
    if (g.includes('cot loi nganh') || g.includes('co so va cot loi')) return { type: 'cat', key: 'cs' };
    if (g.includes('ly luan chinh tri') || g.includes('phap luat')) return { type: 'cat', key: 'triet' };
    if (g.includes('giao duc the chat') || g.includes('tcii') || code.startsWith('PE')) return { type: 'cat', key: 'td' };
    if (g.includes('bo tro')) return { type: 'cat', key: 'bt' };
    if (
      g.includes('quoc phong') ||
      header.includes('quoc phong') ||
      faculty.includes('kgdqp') ||
      code.startsWith('MIL')
    ) return { type: 'cat', key: 'qp' };
    if (g.includes('tieng anh') || code.startsWith('FL')) return { type: 'cat', key: 'en' };
    if (g.includes('thuc tap')) return { type: 'cat', key: 'tt' };
    if (g.includes('do an tot nghiep')) return { type: 'cat', key: 'tn' };
    if (g.includes('do an nghien cuu')) return { type: 'cat', key: 'nc' };
    return { type: 'other' };
  }

  function buildModel() {
    const raw = scrapeCourses();
    const categories = {};
    Object.keys(CAT_META).forEach(k => { categories[k] = []; });
    const modules = {};
    const others = [];

    raw.forEach(course => {
      const cl = classify(course);
      if (cl.type === 'cat') {
        categories[cl.key].push(course);
        return;
      }
      if (cl.type === 'module') {
        const parsed = parseModuleTags(course.ghiChu);
        if (parsed) {
          parsed.nums.forEach(n => {
            if (!modules[n]) modules[n] = { name: null, courses: [] };
            if (!modules[n].courses.find(x => x.code === course.code)) modules[n].courses.push(course);
            if (parsed.desc && !modules[n].name) modules[n].name = parsed.desc;
          });
          return;
        }
      }
      others.push(course);
    });

    return { raw, categories, modules, others };
  }

  window.CTTBK_DATA = {
    catMeta: CAT_META,
    mandatoryKeys: MANDATORY_KEYS,
    buildModel,
  };

  let tries = 0;
  const poll = setInterval(() => {
    tries++;
    if (gridPresent()) {
      if (window.CTTBK_UI) window.CTTBK_UI.addFab();
      clearInterval(poll);
    } else if (tries > 40) {
      clearInterval(poll);
    }
  }, 800);
})();
