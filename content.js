/* CTT-SIS Tiến độ học tập - data scraper/content bootstrap. */
(function () {
  "use strict";

  const CODE_RE = /^[A-Z]{2,5}\d{3,5}$/;
  const SHOW_PROGRAM_BUTTON_ID =
    "ctl00_ctl00_contentPane_MainPanel_MainContent_btShowProgramCourse";
  const LOGIN_PATH = "/Account/Login.aspx";

  const CAT_META = {
    dc: { name: "Đại cương", rule: "all" },
    triet: { name: "Triết học", rule: "all" },
    td: { name: "Giáo dục thể chất", rule: 5 },
    qp: { name: "Giáo dục Quốc phòng - An ninh", rule: "all" },
    bt: { name: "Khối kiến thức bổ trợ", rule: 3 },
    en: { name: "Ngoại ngữ", rule: "all" },
    cs: { name: "Cơ sở & cốt lõi ngành", rule: "all" },
    tt: { name: "Thực tập kỹ thuật", rule: "all" },
    damh: { name: "Đồ án môn học", rule: "all" },
    da: { name: "Đồ án tốt nghiệp / nghiên cứu cử nhân", rule: 1 },
  };
  const MANDATORY_KEYS = ["da", "triet", "dc", "cs", "damh", "tt"];

  function deaccent(str) {
    return (str || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase();
  }

  function scrapeCourses() {
    const out = [];
    const seen = new Set();
    let currentTypeHeader = "";
    document.querySelectorAll("table").forEach((table) => {
      table.querySelectorAll("tr").forEach((tr) => {
        const cells = Array.from(tr.children)
          .filter((el) => el.tagName === "TD" || el.tagName === "TH")
          .map((td) => (td.innerText || "").trim());
        const rowText = cells.join(" | ");
        if (/Mã loại HP|Loại HP/i.test(rowText)) currentTypeHeader = rowText;
        if (cells.length < 8) return;
        const idx = cells.findIndex((c) => CODE_RE.test(c));
        if (idx < 0) return;
        const slice = cells.slice(idx, idx + 11);
        if (slice.length < 11) return;

        const [
          code,
          name,
          term,
          ,
          tcDT,
          ,
          maHPHoc,
          ghiChu,
          diemChu,
          diemSo,
          vienKhoa,
        ] = slice;
        if (!name || name.length < 2) return;

        const key = `${code}|${term || ""}|${ghiChu}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({
          code,
          name,
          term: term ? Number(term) || null : null,
          credit: Number(tcDT) || 0,
          taken: !!maHPHoc && maHPHoc.trim().length > 0,
          grade: diemChu || null,
          score: diemSo && diemSo.trim() !== "" ? parseFloat(diemSo) : null,
          ghiChu: ghiChu || "",
          vienKhoa: vienKhoa || "",
          typeHeader: currentTypeHeader,
        });
      });
    });
    return out;
  }

  function gridPresent() {
    return document.body && document.body.innerText.includes("Mã HP học");
  }

  function marksPresent() {
    return (
      location.pathname.includes("StudentCourseMarks.aspx") ||
      (document.body && document.body.innerText.includes("BẢNG ĐIỂM CÁ NHÂN"))
    );
  }

  function cleanCellText(value) {
    return (value || "").replace(/\u00a0/g, " ").trim().replace(/\s+/g, " ");
  }

  function numberOrNull(value) {
    const n = Number(String(value || "").replace(",", ".").trim());
    return Number.isNaN(n) ? null : n;
  }

  function generalResultsPresent() {
    return (
      !!document.querySelector('[id*="gvResults"]') ||
      (document.body && document.body.innerText.includes("Kết quả học tập sinh viên"))
    );
  }

  function scrapeGeneralResults() {
    const rows = [];
    const seen = new Set();

    function addResultRow(data) {
      const term = data["Học kỳ"] || "";
      if (!/^\d{5}$/.test(term) || seen.has(term)) return;
      seen.add(term);

      rows.push({
        term,
        gpa: numberOrNull(data.GPA),
        cpa: numberOrNull(data.CPA),
        passedCredits: numberOrNull(data["TC qua"]),
        accumulatedCredits: numberOrNull(data["TC tích lũy"]),
        debtCredits: numberOrNull(data["TC nợ ĐK"]),
        registeredCredits: numberOrNull(data["TC ĐK"]),
        level: data["Trình độ"] || "",
        warning: data["Cảnh báo"] || "",
        missingScore: data["Thiếu điểm"] || "",
        excluded: data["Không tính"] || "",
        program: data["CTĐT"] || "",
        expectedHandling: data["Dự kiến XLHT"] || "",
        officialHandling: data["Xử lý chính thức"] || "",
      });
    }

    document.querySelectorAll('[id*="gvResults"] .dxgvADT, .dxgvADT').forEach((table) => {
      const data = {};
      table.querySelectorAll("tr").forEach((tr) => {
        const cells = Array.from(tr.children).map((td) => cleanCellText(td.innerText));
        if (cells.length < 2) return;
        const key = cells[0].replace(/:$/, "");
        data[key] = cells[1];
      });

      addResultRow(data);
    });

    document.querySelectorAll('[id*="gvResults_DXMainTable"] tr, table[id*="gvResults"] tr').forEach((tr) => {
      const cells = Array.from(tr.children).map((td) => cleanCellText(td.innerText));
      if (cells.length < 9 || !/^\d{5}$/.test(cells[0])) return;
      addResultRow({
        "Học kỳ": cells[0],
        GPA: cells[1],
        CPA: cells[2],
        "TC qua": cells[3],
        "TC tích lũy": cells[4],
        "TC nợ ĐK": cells[5],
        "TC ĐK": cells[6],
        "Trình độ": cells[7],
        "Cảnh báo": cells[8],
        "Thiếu điểm": cells[9],
        "Không tính": cells[10],
        "CTĐT": cells[11],
        "Dự kiến XLHT": cells[12],
        "Xử lý chính thức": cells[13],
      });
    });

    return rows.sort((a, b) => String(b.term).localeCompare(String(a.term)));
  }

  function scrapeMarks() {
    const rows = [];
    const seen = new Set();

    document.querySelectorAll("tr").forEach((tr) => {
      const cells = Array.from(tr.children)
        .filter((el) => el.tagName === "TD" || el.tagName === "TH")
        .map((td) => (td.innerText || "").trim().replace(/\s+/g, " "));
      if (cells.length < 7) return;

      const codeIndex = cells.findIndex((c) => CODE_RE.test(c));
      if (codeIndex < 0) return;
      const after = cells.slice(codeIndex);
      const before = cells.slice(0, codeIndex).reverse();

      const term = before.find((c) => /^\d{5}$/.test(c)) || cells[0] || "";
      const code = after[0] || "";
      const name = after[1] || "";
      const credit = Number(after[2]) || 0;
      const classCode = after[3] || "";
      const processScore = after[4] === "" ? null : Number(after[4]);
      const examScore = after[5] === "" ? null : Number(after[5]);
      const letterGrade = after[6] || "";

      if (!code || !name || !CODE_RE.test(code)) return;
      const key = `${term}|${code}|${classCode}`;
      if (seen.has(key)) return;
      seen.add(key);

      rows.push({
        term,
        code,
        name,
        credit,
        classCode,
        processScore: Number.isNaN(processScore) ? null : processScore,
        examScore: Number.isNaN(examScore) ? null : examScore,
        letterGrade,
      });
    });

    return rows;
  }

  function showProgramButton() {
    return document.getElementById(SHOW_PROGRAM_BUTTON_ID);
  }

  function showProgramButtonPresent() {
    return !!showProgramButton();
  }

  function clickShowProgramButton() {
    const btn = showProgramButton();
    if (!btn) return false;
    btn.click();
    return true;
  }

  function isLoginPage() {
    return location.pathname.toLowerCase() === LOGIN_PATH.toLowerCase();
  }

  function parseModuleTags(text) {
    const m = text.match(/m[ôo]\s*[đd]un\s*([\d,\s]+)(.*)/i);
    if (!m) return null;
    const nums = m[1]
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => !isNaN(n));
    if (!nums.length) return null;
    const desc = (m[2] || "")
      .replace(/^[:\s]+/, "")
      .replace(/^m[ôo]\s*[đd]un\s*:\s*/i, "")
      .trim();
    return { nums, desc };
  }

  function classify(course) {
    const g = deaccent(course.ghiChu);
    const name = deaccent(course.name);
    const header = deaccent(course.typeHeader);
    const faculty = deaccent(course.vienKhoa);
    const code = course.code;
    if (/m[oô]\s*[dđ]un/.test(g)) return { type: "module" };
    if (
      g.includes("do an thiet ke") ||
      name.includes("do an thiet ke") ||
      header.includes("do an thiet ke")
    )
      return { type: "cat", key: "damh" };
    if (
      g.includes("toan va khoa hoc co ban") ||
      g.includes("toan & khoa hoc co ban")
    )
      return { type: "cat", key: "dc" };
    if (g.includes("cot loi nganh") || g.includes("co so va cot loi"))
      return { type: "cat", key: "cs" };
    if (g.includes("ly luan chinh tri") || g.includes("phap luat"))
      return { type: "cat", key: "triet" };
    if (
      g.includes("giao duc the chat") ||
      g.includes("tcii") ||
      code.startsWith("PE")
    )
      return { type: "cat", key: "td" };
    if (g.includes("bo tro")) return { type: "cat", key: "bt" };
    if (
      g.includes("quoc phong") ||
      header.includes("quoc phong") ||
      faculty.includes("kgdqp") ||
      code.startsWith("MIL")
    )
      return { type: "cat", key: "qp" };
    if (g.includes("tieng anh") || code.startsWith("FL"))
      return { type: "cat", key: "en" };
    if (g.includes("thuc tap")) return { type: "cat", key: "tt" };
    if (
      g.includes("do an tot nghiep") ||
      g.includes("do an nghien cuu") ||
      header.includes("do an tot nghiep") ||
      header.includes("do an nghien cuu")
    )
      return { type: "cat", key: "da" };
    return { type: "other" };
  }

  function buildModel() {
    const raw = scrapeCourses();
    const categories = {};
    Object.keys(CAT_META).forEach((k) => {
      categories[k] = [];
    });
    const modules = {};
    const others = [];

    raw.forEach((course) => {
      const cl = classify(course);
      if (cl.type === "cat") {
        categories[cl.key].push(course);
        return;
      }
      if (cl.type === "module") {
        const parsed = parseModuleTags(course.ghiChu);
        if (parsed) {
          parsed.nums.forEach((n) => {
            if (!modules[n]) modules[n] = { name: null, courses: [] };
            if (!modules[n].courses.find((x) => x.code === course.code))
              modules[n].courses.push(course);
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
    scrapeMarks,
    scrapeGeneralResults,
    gridPresent,
    marksPresent,
    generalResultsPresent,
    showProgramButtonPresent,
    clickShowProgramButton,
  };

  let tries = 0;
  const poll = setInterval(() => {
    tries++;
    if (document.body) {
      if (window.CTTBK_UI && !isLoginPage()) {
        window.CTTBK_UI.addFab();
        const target = sessionStorage.getItem("cttbk_open_target");
        if (
          target === "marks" &&
          marksPresent()
        ) {
          sessionStorage.removeItem("cttbk_open_target");
          window.CTTBK_UI.openPanel("marks");
        }
        if (
          target === "general" &&
          generalResultsPresent()
        ) {
          sessionStorage.removeItem("cttbk_open_target");
          window.CTTBK_UI.openPanel("general");
        }
        if (
          target === "courses" &&
          (gridPresent() || showProgramButtonPresent())
        ) {
          sessionStorage.removeItem("cttbk_open_target");
          window.CTTBK_UI.openPanel("courses");
        }
        if (
          gridPresent() &&
          sessionStorage.getItem("cttbk_auto_open") === "1"
        ) {
          sessionStorage.removeItem("cttbk_auto_open");
          window.CTTBK_UI.openPanel("courses");
        }
      }
      clearInterval(poll);
    } else if (tries > 40) {
      clearInterval(poll);
    }
  }, 800);
})();
