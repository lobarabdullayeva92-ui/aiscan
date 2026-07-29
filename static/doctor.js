/* Vrach ish stansiyasi — papkadan DICOM, PARALLEL tahlil, 2x2 ko'rinish + o'choq nishonlari,
   chap rail (ko'rinishlar), o'ng panel (ko'krak bo'yicha topilmalar + Ollama tavsiyalari),
   past filtrlar (o'choq turi/overlay), zoom, yorqinlik/kontrast, avtomatik hisobot. CSP-safe. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const TOKEN_KEY = "mamograf_jwt";
  const getToken = () => localStorage.getItem(TOKEN_KEY);
  const setToken = (t) => t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);
  const MAX_FILES = 4, CONCURRENCY = 2;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));

  async function api(url, opts) {
    opts = opts || {};
    const headers = new Headers(opts.headers || {});
    const tok = getToken();
    if (tok && !headers.has("Authorization")) headers.set("Authorization", "Bearer " + tok);
    const res = await fetch(url, Object.assign({}, opts, { headers }));
    if (res.status === 401) { setToken(null); showLogin(); throw new Error("401"); }
    if (!res.ok) { let t = ""; try { t = await res.text(); } catch (e) {} throw new Error(res.status + " " + t); }
    return res;
  }
  const apiJson = async (u, o) => (await api(u, o)).json();

  // ---------- auth ----------
  function showLogin() { $("loginOverlay").classList.remove("hidden"); }
  function hideLogin() { $("loginOverlay").classList.add("hidden"); }
  let CUR_USER = "";
  async function resume() {
    if (!getToken()) { showLogin(); return; }
    try { const me = await apiJson("/api/auth/me"); CUR_USER = me.username || "";
      $("userChip").textContent = CUR_USER + (me.role ? " · " + me.role : ""); hideLogin(); }
    catch (e) { showLogin(); }
  }
  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("loginBtn"), err = $("loginErr"); err.textContent = "";
    const body = { username: $("lUser").value.trim(), password: $("lPass").value };
    const totp = $("lTotp").value.trim(); if (totp) body.totp_code = totp;
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { let d = null; try { d = await res.json(); } catch (e) {}
        if (res.status === 401 && d && d.detail && d.detail.error === "totp_required") { $("lTotp").classList.remove("hidden"); err.textContent = "TOTP kod kiriting."; }
        else err.textContent = (d && typeof d.detail === "string") ? d.detail : "Noto'g'ri login yoki parol."; return; }
      const data = await res.json(); setToken(data.token); CUR_USER = data.user.username || "";
      $("userChip").textContent = CUR_USER + (data.user.role ? " · " + data.user.role : ""); hideLogin();
    } catch (e2) { err.textContent = "Xatolik: " + e2.message; }
    finally { btn.disabled = false; btn.textContent = "Kirish"; }
  });
  $("logoutBtn").addEventListener("click", () => { api("/api/auth/logout", { method: "POST" }).catch(() => {}); setToken(null); location.reload(); });

  // ---------- helpers ----------
  function msg(text, kind) { const m = $("msg"); m.textContent = text; m.classList.remove("hidden");
    m.style.borderColor = kind === "bad" ? "var(--bad)" : "var(--accent)"; m.style.color = kind === "bad" ? "#ffd7d7" : "#cfe0ff"; }
  const hideMsg = () => $("msg").classList.add("hidden");
  const setLoading = (on, txt) => { $("loading").classList.toggle("hidden", !on); if (txt) $("loadTxt").textContent = txt; };
  function progSegs(n) { $("prog").innerHTML = Array.from({ length: Math.max(1, n) }, () => '<div class="seg"><div class="seg-fill"></div></div>').join(""); }
  function progIndet() { $("prog").innerHTML = '<div class="seg indet"><div class="seg-fill"></div></div>'; }
  function segSet(k, frac) { const s = $("prog").children[k]; if (!s) return; s.classList.remove("active", "indet"); s.firstChild.style.width = Math.max(0, Math.min(100, Math.round(frac * 100))) + "%"; }
  function segActive(k) { const s = $("prog").children[k]; if (s) s.classList.add("active"); }
  function uploadOne(file, onProg) {
    return new Promise((res, rej) => {
      const xhr = new XMLHttpRequest(); xhr.open("POST", "/api/upload");
      const tok = getToken(); if (tok) xhr.setRequestHeader("Authorization", "Bearer " + tok);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProg) onProg(e.loaded / e.total); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) { try { res((JSON.parse(xhr.responseText).files || [])[0] || null); } catch (e) { rej(new Error("javob buzuq")); } }
        else if (xhr.status === 401) { setToken(null); showLogin(); rej(new Error("401")); }
        else rej(new Error(xhr.status + " " + (xhr.responseText || "")));
      };
      xhr.onerror = () => rej(new Error("tarmoq xatosi"));
      const fd = new FormData(); fd.append("files", file, file.name); xhr.send(fd);
    });
  }

  const SLOT_NAMES = ["RCC", "LCC", "RMLO", "LMLO"];   // 2x2 hanging protocol
  function viewTitle(info, i) {
    const lat = ((info && info.laterality) || "").toUpperCase();
    const vw = ((info && info.view) || "").toUpperCase();
    return [lat, vw].filter(Boolean).join("-") || SLOT_NAMES[i] || ((i + 1) + "-tasvir");
  }
  function slotOf(info) {
    const lat = ((info && info.laterality) || "").toUpperCase();
    const vw = ((info && info.view) || "").toUpperCase();
    const cc = vw.indexOf("CC") >= 0, mlo = vw.indexOf("MLO") >= 0;
    if (lat === "R" && cc) return 0; if (lat === "L" && cc) return 1;
    if (lat === "R" && mlo) return 2; if (lat === "L" && mlo) return 3;
    return -1;
  }
  function breastOf(info, i) {
    const l = ((info && info.laterality) || "").toUpperCase();
    if (l === "L" || l === "R") return l;
    const t = viewTitle(info, i).toUpperCase();
    if (t[0] === "R") return "R"; if (t[0] === "L") return "L"; return "?";
  }
  function grp(label) {
    const l = String(label || "").toLowerCase();
    if (l.indexOf("mass") >= 0) return "mass";
    if (l.indexOf("calc") >= 0) return "calcification";
    if (l.indexOf("arch") >= 0) return "architectural_distortion";
    if (l.indexOf("asym") >= 0) return "asymmetry";
    if (l.indexOf("lymph") >= 0) return "lymph_node";
    return "other";
  }
  function labelUz(k) {
    const m = { benign: "Xavfsiz", malignant: "Xavfli", mass: "Massa", calcification: "Kalsifikatsiya",
      asymmetry: "Assimetriya", architectural_distortion: "Arxitektura buzilishi", lymph_node: "Limfa tugun", other: "Boshqa" };
    return m[String(k || "?").toLowerCase()] || (k || "?");
  }
  function malProb(probs) { for (const k in probs) if (/mal|xavf|rak|malignant/.test(k.toLowerCase())) return probs[k]; return 0; }
  function primaryIndex(dets) { let bi = -1, bc = -1; (dets || []).forEach((d, k) => { const c = d.confidence || 0; if (c > bc) { bc = c; bi = k; } }); return bi; }
  function quadrantUz(bb) {
    const cx = bb[0] + bb[2] / 2, cy = bb[1] + bb[3] / 2;
    return (cy < 0.4 ? "yuqori" : cy > 0.6 ? "quyi" : "o'rta") + "-" + (cx < 0.4 ? "chap" : cx > 0.6 ? "o'ng" : "markaz") + " soha";
  }

  // ---------- papka -> DICOM ----------
  const drop = $("drop"), fileInput = $("file");
  drop.addEventListener("click", () => fileInput.click());
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });
  fileInput.addEventListener("change", () => { if (fileInput.files.length) handleFiles(fileInput.files); });
  async function isDicom(file) { try { const v = new Uint8Array(await file.slice(0, 132).arrayBuffer()); return v.length >= 132 && v[128] === 0x44 && v[129] === 0x49 && v[130] === 0x43 && v[131] === 0x4D; } catch (e) { return false; } }

  let cells = [], lastAdvice = "";

  async function handleFiles(fileList) {
    if (!getToken()) { showLogin(); return; }
    hideMsg(); setLoading(true, "Papka skanerlanmoqda…"); progIndet();
    // Yangi yuklash boshlanishi bilan ESKI ma'lumotlarni darrov tozalaymiz
    cells = []; lastAdvice = "";
    $("grid").innerHTML = ""; $("railViews").innerHTML = "";
    $("patInfo").textContent = "";
    $("rbN").textContent = "…"; $("lbN").textContent = "…";
    $("rbTags").innerHTML = ""; $("lbTags").innerHTML = "";
    document.querySelectorAll("#hang div").forEach((el) => el.classList.remove("on"));
    $("tabFindings").innerHTML = '<span class="muted">Yangi fayllar yuklanmoqda…</span>';
    $("tabAdvice").innerHTML = '<span class="muted">Yangi fayllar yuklanmoqda…</span>';
    const dcm = [];
    for (const f of Array.from(fileList)) { const nm = (f.name || "").toLowerCase();
      if (nm.endsWith(".dcm") || nm.endsWith(".dicom") || await isDicom(f)) dcm.push(f); }
    dcm.sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name));
    if (!dcm.length) { setLoading(false); msg("Papkada DICOM fayl topilmadi.", "bad"); return; }
    const chosen = dcm.slice(0, MAX_FILES);
    if (dcm.length > MAX_FILES) msg("Papkada " + dcm.length + " ta DICOM — dastlabki 4 tasi tahlil qilinadi.", "");

    cells = []; lastAdvice = "";
    $("dropwrap").classList.add("hidden"); $("ws").classList.remove("hidden");
    $("grid").innerHTML = ""; $("railViews").innerHTML = "";
    // ESKI ma'lumotlarni to'liq tozalash (yangisi tayyor bo'lguncha ko'rinmasin)
    $("patInfo").textContent = "";
    $("rbN").textContent = "…"; $("lbN").textContent = "…";
    $("rbTags").innerHTML = ""; $("lbTags").innerHTML = "";
    document.querySelectorAll("#hang div").forEach((el) => el.classList.remove("on"));
    $("tabFindings").innerHTML = '<span class="muted">Tahlil davom etmoqda…</span>';
    $("tabAdvice").innerHTML = '<span class="muted">Tahlil davom etmoqda…</span>';

    // 4 ta bo'sh chorak DARROV tuziladi (grid ko'rinadi, "yuklanmoqda…")
    for (let s = 0; s < 4; s++) { buildCell(s, null); buildRail(s, null); cellNoFile(s); }
    const used = [false, false, false, false];
    function assignSlot(info) {
      const s = slotOf(info); if (s >= 0 && !used[s]) return s;
      for (let j = 0; j < 4; j++) if (!used[j]) return j;
      return -1;
    }

    // fayl-bafayl yuklash — HAR BIRI yuklanishi tugashi bilanoq DARROV o'z chorogida ko'rsatiladi
    progSegs(chosen.length);
    for (let k = 0; k < chosen.length; k++) {
      setLoading(true, "Yuklanmoqda  " + (k + 1) + "/" + chosen.length + "  ·  0%");
      let info = null;
      try {
        info = await uploadOne(chosen[k], (p) => {
          setLoading(true, "Yuklanmoqda  " + (k + 1) + "/" + chosen.length + "  ·  " + Math.round(p * 100) + "%");
          segSet(k, p);
        });
        segSet(k, 1);
      } catch (e) { if (e.message === "401") { setLoading(false); return; } segSet(k, 1); msg("'" + chosen[k].name + "' yuklanmadi.", "bad"); continue; }
      if (!info) continue;
      const s = assignSlot(info); if (s < 0) continue; used[s] = true;
      // bemor ma'lumoti (birinchi topilganda)
      if (!$("patInfo").textContent) {
        // Doctor sahifasida bemor shaxsi ANONIM ko'rsatiladi (PHI faylda saqlanadi, UI'da emas)
        $("patInfo").innerHTML = "Bemor: <b>anonim</b>" +
          (info.study_date ? " <small>Sana: " + esc(info.study_date) + "</small>" : "");
      }
      setCellTitle(s, info); setRailName(s, info);
      if (!info.id || !info.has_pixels) { cellEmpty(s); continue; }
      try { const url = await showBase(s, info); cells[s] = { ref: info.id, info, diag: null, imgUrl: url }; }
      catch (e) { cellErr(s, e); }
      highlightHang();   // shu fayl darrov ko'rinadi
    }
    // to'ldirilmagan choraklar "yuklanmagan" bo'lib qoladi
    for (let s = 0; s < 4; s++) if (!used[s]) cellNoFile(s);

    // 2) PARALLEL tahlil (son + animatsion progress)
    const idxs = []; for (let i = 0; i < 4; i++) if (cells[i]) idxs.push(i);
    setLoading(true, "AI tahlil qilinmoqda…  0/" + idxs.length); progSegs(idxs.length);
    idxs.forEach((i) => setProc(i, true));
    let cur = 0, doneN = 0;
    async function worker() {
      while (cur < idxs.length) { const pos = cur; const i = idxs[cur++]; const c = cells[i];
        segActive(pos);
        try { const diag = await apiJson("/api/doctor/diagnose", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ref: c.ref }) });
          c.diag = diag; reveal(i, diag); }
        catch (e) { cellErr(i, e); cells[i] = null; }
        setProc(i, false); segSet(pos, 1); doneN++; setLoading(true, "AI tahlil qilinmoqda…  " + doneN + "/" + idxs.length); renderPanel(); updateRail();
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, idxs.length) }, worker));
    setLoading(false);
    applyOverlays(); applyImgFilter(); renderPanel(); updateRail();
    loadAdvice();
  }

  // ---------- katak ----------
  function buildCell(i, info) {
    const cell = document.createElement("div"); cell.className = "cell " + (i % 2 === 0 ? "lcol" : "rcol"); cell.id = "cell" + i;
    cell.innerHTML = '<span class="vlabel">FFDM ' + esc(viewTitle(info, i)) + '</span>'
      + '<span class="vchip"><span class="chip-diag na" id="chip' + i + '">…</span></span>'
      + '<div class="viewer" id="vw' + i + '"><div class="cell-empty"><span class="spin"></span> yuklanmoqda…</div></div>';
    $("grid").appendChild(cell);
  }
  function cellEmpty(i) { $("vw" + i).innerHTML = '<div class="cell-empty">⚠️ Tasvir (piksel) yo\'q<br>(SR/hisobot fayl)</div>'; setChip(i, null); }
  function cellNoFile(i) { const vw = $("vw" + i); if (vw) vw.innerHTML = '<div class="cell-empty">— yuklanmagan —</div>'; const c = $("chip" + i); if (c) { c.className = "chip-diag na"; c.textContent = ""; } }
  function setCellTitle(i, info) { const cell = $("cell" + i); if (!cell) return; const l = cell.querySelector(".vlabel"); if (l) l.textContent = "FFDM " + viewTitle(info, i); }
  function setRailName(i, info) { const rv = $("rv" + i); if (!rv) return; const ic = rv.querySelector(".rv-i"), nm = rv.querySelector(".rv-n"); if (ic) ic.textContent = viewTitle(info, i).slice(0, 4); if (nm) nm.textContent = viewTitle(info, i); }
  function cellErr(i, e) { $("vw" + i).innerHTML = '<div class="cell-empty">❌ ' + esc(e.message || e) + '</div>'; setChip(i, null); }
  async function showBase(i, info) {
    const url = URL.createObjectURL(await (await api("/api/files/" + info.id + "/image?max_dim=2048")).blob());
    $("vw" + i).innerHTML = '<img class="base" alt=""><div class="layer"></div>';
    $("vw" + i).querySelector("img.base").src = url;
    $("vw" + i).addEventListener("click", () => openZoom(i));
    return url;
  }
  function setProc(i, on) { const vw = $("vw" + i); if (!vw) return; let ov = vw.querySelector(".cell-proc");
    if (on) { if (!ov) { ov = document.createElement("div"); ov.className = "cell-proc"; ov.innerHTML = '<span class="spin"></span><span>AI tahlil…</span>'; vw.appendChild(ov); } } else if (ov) ov.remove(); }
  function setChip(i, probs) { const c = $("chip" + i); if (!c) return;
    if (probs) { const mal = malProb(probs), m = mal >= 0.5; c.className = "chip-diag " + (m ? "mal" : "ben"); c.textContent = (m ? "Xavfli " : "Xavfsiz ") + Math.round((m ? mal : 1 - mal) * 100) + "%"; }
    else { c.className = "chip-diag na"; c.textContent = "—"; } }

  // klass ranglari (klasslarga ajratib chizish uchun)
  const CLR = { mass: "#f5b301", calcification: "#39d3e6", architectural_distortion: "#a78bfa",
    asymmetry: "#34d399", lymph_node: "#f472b6", other: "#cbd5e1" };
  function boxesHtml(dets) {
    const pi = primaryIndex(dets);
    return (dets || []).map((det, k) => {
      const g = grp(det.label), col = CLR[g] || "#f5b301", bb = det.bbox || [0, 0, 0, 0];
      return '<div class="box' + (k === pi ? " primary" : "") + '" data-g="' + g + '"'
        + ' data-x="' + bb[0] + '" data-y="' + bb[1] + '" data-w="' + bb[2] + '" data-h="' + bb[3] + '" style="'
        + "left:" + (bb[0] * 100) + "%;top:" + (bb[1] * 100) + "%;width:" + (bb[2] * 100) + "%;height:" + (bb[3] * 100) + "%;border-color:" + col + '">'
        + '<b style="background:' + col + '">' + (k === pi ? "⭐ " : "") + esc(labelUz(g)) + " " + Math.round((det.confidence || 0) * 100) + '%</b></div>';
    }).join("");
  }
  // grid katakda box'larni rasmning HAQIQIY ko'ringan to'rtburchagiga moslaydi (letterbox + object-position hisobga olib)
  function positionCellBoxes(i) {
    const vw = $("vw" + i); if (!vw) return;
    const img = vw.querySelector("img.base"); if (!img) return;
    if (!img.naturalWidth) { img.addEventListener("load", () => positionCellBoxes(i), { once: true }); return; }
    const EW = vw.clientWidth, EH = vw.clientHeight; if (!EW || !EH) return;
    const scale = Math.min(EW / img.naturalWidth, EH / img.naturalHeight);
    const dW = img.naturalWidth * scale, dH = img.naturalHeight * scale;
    const cell = $("cell" + i);
    const lcol = cell && cell.classList.contains("lcol");
    const offX = lcol ? (EW - dW) : 0;      // lcol: o'ng chekka, rcol: chap chekka
    const offY = (EH - dH) / 2;
    vw.querySelectorAll(".box").forEach((b) => {
      const x = parseFloat(b.dataset.x), y = parseFloat(b.dataset.y), w = parseFloat(b.dataset.w), h = parseFloat(b.dataset.h);
      if (isNaN(x)) return;
      b.style.left = (offX + x * dW) + "px"; b.style.top = (offY + y * dH) + "px";
      b.style.width = (w * dW) + "px"; b.style.height = (h * dH) + "px";
    });
  }
  function reveal(i, d) {
    const vw = $("vw" + i); if (!vw) return; const layer = vw.querySelector(".layer"); if (!layer) return;
    let heatHtml = d.heatmap_png ? '<img class="heat" src="' + d.heatmap_png + '" alt="">' : "";
    layer.innerHTML = heatHtml + boxesHtml(d.detections || []);
    positionCellBoxes(i);   // box'larni rasmning aniq joyiga qo'yamiz
    setChip(i, d.diagnosis && d.diagnosis.probs);
    applyOverlays(); applyImgFilter();
  }
  window.addEventListener("resize", () => { for (let i = 0; i < 4; i++) if (cells[i] && cells[i].diag) positionCellBoxes(i); });

  // ---------- chap rail ----------
  function buildRail(i, info) {
    const d = document.createElement("div"); d.className = "railview"; d.id = "rv" + i;
    d.innerHTML = '<span class="rv-i">' + esc(viewTitle(info, i).slice(0, 4)) + '</span>'
      + '<span class="rv-n">' + esc(viewTitle(info, i)) + '</span><span class="rv-c" id="rvc' + i + '"></span>';
    d.addEventListener("click", () => { if (cells[i]) openZoom(i); });
    $("railViews").appendChild(d);
  }
  function updateRail() {
    cells.forEach((c, i) => { const dot = $("rvc" + i); if (!dot || !c || !c.diag) return;
      const probs = c.diag.diagnosis && c.diag.diagnosis.probs; const mal = probs ? malProb(probs) : 0;
      dot.className = "rv-c " + (probs ? (mal >= 0.5 ? "mal" : "ben") : ""); });
  }
  function highlightHang() {
    const have = new Set(); cells.forEach((c, i) => { if (c) have.add(viewTitle(c.info, i).toUpperCase().replace(/[^A-Z]/g, "")); });
    document.querySelectorAll("#hang div").forEach((el) => { el.classList.toggle("on", have.has(el.dataset.k)); });
  }

  // ---------- o'ng panel: ko'krak topilmalari + tabs ----------
  function renderPanel() {
    ["R", "L"].forEach((L) => {
      const done = cells.filter((c, i) => c && c.diag && breastOf(c.info, i) === L);
      let n = 0; const types = {};
      done.forEach((c) => (c.diag.detections || []).forEach((d) => { n++; const g = grp(d.label); types[g] = (types[g] || 0) + 1; }));
      const nEl = $(L === "R" ? "rbN" : "lbN"), tEl = $(L === "R" ? "rbTags" : "lbTags");
      nEl.textContent = n + " o'choq";
      tEl.innerHTML = Object.keys(types).length
        ? Object.entries(types).map(([g, c]) => '<span class="tag">' + esc(labelUz(g)) + " ×" + c + "</span>").join("")
        : '<span class="muted" style="font-size:12px">o\'choq aniqlanmadi</span>';
    });
    $("tabFindings").innerHTML = findingsHtml();
  }
  function findingsHtml() {
    const done = cells.filter((c) => c && c.diag);
    if (!done.length) return '<span class="muted">Tahlil kutilmoqda…</span>';
    let html = "";
    ["R", "L"].forEach((L) => {
      const name = L === "R" ? "O'ng ko'krak" : "Chap ko'krak";
      const list = cells.map((c, i) => (c && c.diag && breastOf(c.info, i) === L) ? { c, i } : null).filter(Boolean);
      let lesions = []; let maxMal = 0;
      list.forEach(({ c, i }) => {
        const probs = c.diag.diagnosis && c.diag.diagnosis.probs; const mal = probs ? malProb(probs) : 0; if (mal > maxMal) maxMal = mal;
        (c.diag.detections || []).forEach((d) => lesions.push({ view: viewTitle(c.info, i), t: labelUz(grp(d.label)), q: quadrantUz(d.bbox || [0, 0, 0, 0]), cf: Math.round((d.confidence || 0) * 100) }));
      });
      html += "<div style='margin-bottom:10px'><b>" + name + "</b> — " + lesions.length + " ta o'choq";
      html += maxMal >= 0.5 ? " <span style='color:var(--bad)'>(xavf belgilari)</span>" : (list.length ? " <span style='color:var(--good)'>(xavfsiz ehtimoli yuqori)</span>" : "");
      if (lesions.length) { html += "<ul style='margin:6px 0 0; padding-left:18px'>";
        lesions.forEach((x) => { html += "<li>" + esc(x.t) + " — " + esc(x.view) + " ko'rinishida, " + esc(x.q) + " (ishonch " + x.cf + "%)</li>"; });
        html += "</ul>"; }
      else if (list.length) html += "<div class='muted' style='font-size:12px;margin-top:4px'>Shubhali o'choq aniqlanmadi.</div>";
      html += "</div>";
    });
    return html;
  }

  // tabs
  $("tabFindBtn").addEventListener("click", () => switchTab("find"));
  $("tabAdvBtn").addEventListener("click", () => switchTab("adv"));
  function switchTab(t) {
    $("tabFindBtn").classList.toggle("on", t === "find");
    $("tabAdvBtn").classList.toggle("on", t === "adv");
    $("tabFindings").classList.toggle("hidden", t !== "find");
    $("tabAdvice").classList.toggle("hidden", t !== "adv");
  }
  $("copyBtn").addEventListener("click", () => {
    const el = $("tabFindBtn").classList.contains("on") ? $("tabFindings") : $("tabAdvice");
    const txt = el.innerText || el.textContent || "";
    navigator.clipboard && navigator.clipboard.writeText(txt).then(() => { const b = $("copyBtn"); const o = b.textContent; b.textContent = "✓ nusxa olindi"; setTimeout(() => b.textContent = o, 1200); }).catch(() => {});
  });

  // ---------- Ollama tavsiyalar (Boshqaruv tavsiyalari tab) ----------
  async function loadAdvice() {
    const done = cells.filter((c) => c && c.diag); if (!done.length) return;
    const body = $("tabAdvice"); body.innerHTML = '<span class="spin"></span> AI tavsiyalar tayyorlanmoqda…';
    let maxMal = 0, tot = 0;
    const views = done.map((c) => { const dets = c.diag.detections || []; tot += dets.length;
      const probs = c.diag.diagnosis && c.diag.diagnosis.probs; const mal = probs ? malProb(probs) : 0; if (mal > maxMal) maxMal = mal;
      return { title: viewTitle(c.info, cells.indexOf(c)), verdict: probs ? ((mal >= 0.5 ? "Xavfli " : "Xavfsiz ") + Math.round((mal >= 0.5 ? mal : 1 - mal) * 100) + "%") : "tashxis yo'q",
        malignant: mal, findings: dets.map((d) => ({ label: labelUz(grp(d.label)), conf: d.confidence || 0 })) }; });
    const overall = maxMal >= 0.5 ? "Xavf belgilari aniqlandi" : "Xavfsizlik ehtimoli yuqori";
    try {
      const r = await apiJson("/api/doctor/advice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ views, overall, max_malignant: maxMal, total_findings: tot }) });
      if (!r.available) { body.innerHTML = '<span class="muted">' + esc(r.note || "Ollama mavjud emas.") + '</span>'; lastAdvice = ""; return; }
      lastAdvice = r.advice || "";
      body.innerHTML = esc(lastAdvice).replace(/\n/g, "<br>") + '<div class="muted" style="font-size:11px;margin-top:8px">Model: ' + esc(r.model || "") + ' · AI tavsiya, yakuniy qaror vrachniki.</div>';
    } catch (e) { body.innerHTML = '<span class="muted">Tavsiya olib bo\'lmadi: ' + esc(e.message || e) + '</span>'; lastAdvice = ""; }
  }

  // ---------- pastki filtrlar ----------
  function enabledGroups() { const s = new Set(); document.querySelectorAll(".ff").forEach((c) => { if (c.checked) s.add(c.dataset.g); }); return s; }
  // Asl rasm yoqilsa — barcha overlaylar (heatmap + boxlar) yashiriladi
  function applyOverlays() {
    const orig = $("tgOrig").checked;
    const heatOn = !orig && $("tgHeat").checked;
    document.querySelectorAll("#grid .layer img.heat, #zoom .layer img.heat").forEach((h) => h.style.visibility = heatOn ? "visible" : "hidden");
    const s = enabledGroups();
    document.querySelectorAll("#grid .box, #zoom .box").forEach((b) => { b.style.display = (!orig && s.has(b.dataset.g)) ? "" : "none"; });
  }
  document.querySelectorAll(".ff").forEach((c) => c.addEventListener("change", () => {
    $("fAll").checked = Array.from(document.querySelectorAll(".ff")).every((x) => x.checked); applyOverlays();
  }));
  $("fAll").addEventListener("change", () => { const v = $("fAll").checked; document.querySelectorAll(".ff").forEach((c) => c.checked = v); applyOverlays(); });
  $("tgHeat").addEventListener("change", applyOverlays);
  $("tgOrig").addEventListener("change", applyOverlays);

  function applyImgFilter() { const f = "brightness(" + $("rngBright").value + ") contrast(" + $("rngContrast").value + ")"; document.querySelectorAll("#grid img.base, #zoom img.base").forEach((im) => im.style.filter = f); }
  $("rngBright").addEventListener("input", applyImgFilter);
  $("rngContrast").addEventListener("input", applyImgFilter);
  $("resetImg").addEventListener("click", () => { $("rngBright").value = 1; $("rngContrast").value = 1; applyImgFilter(); });

  // ---------- yangi ----------
  $("newBtn").addEventListener("click", () => {
    cells = []; lastAdvice = ""; $("grid").innerHTML = ""; $("railViews").innerHTML = ""; $("patInfo").textContent = "";
    $("ws").classList.add("hidden"); $("dropwrap").classList.remove("hidden"); hideMsg(); fileInput.value = "";
    document.querySelectorAll("#hang div").forEach((el) => el.classList.remove("on"));
  });

  // ---------- zoom ----------
  let zScale = 1, zTx = 0, zTy = 0, zDrag = null;
  function openZoom(i) {
    const c = cells[i]; if (!c) return;
    $("zTitle").textContent = "FFDM " + viewTitle(c.info, i);
    $("zImg").src = c.imgUrl;
    const layer = $("zLayer");
    const heat = (c.diag && c.diag.heatmap_png) ? '<img class="heat" id="zHeat" src="' + c.diag.heatmap_png + '">' : '<img class="heat" id="zHeat">';
    layer.innerHTML = heat + boxesHtml((c.diag && c.diag.detections) || []);
    zScale = 1; zTx = 0; zTy = 0; applyZoom(); applyOverlays(); applyImgFilter();
    $("zoom").classList.remove("orig"); $("zOrig").classList.add("sec");   // har ochilganda overlay ko'rinadi
    $("zoom").classList.remove("hidden");
  }
  $("zOrig").addEventListener("click", () => { const on = $("zoom").classList.toggle("orig"); $("zOrig").classList.toggle("sec", !on); });
  function applyZoom() { $("zStage").style.transform = "translate(" + zTx + "px," + zTy + "px) scale(" + zScale + ")"; }
  $("zIn").addEventListener("click", () => { zScale = Math.min(6, zScale + 0.25); applyZoom(); });
  $("zOut").addEventListener("click", () => { zScale = Math.max(1, zScale - 0.25); if (zScale === 1) { zTx = 0; zTy = 0; } applyZoom(); });
  $("zReset").addEventListener("click", () => { zScale = 1; zTx = 0; zTy = 0; applyZoom(); });
  $("zClose").addEventListener("click", () => $("zoom").classList.add("hidden"));
  $("zBody").addEventListener("wheel", (e) => { e.preventDefault(); zScale = Math.min(6, Math.max(1, zScale + (e.deltaY < 0 ? 0.2 : -0.2))); if (zScale === 1) { zTx = 0; zTy = 0; } applyZoom(); }, { passive: false });
  // surish (drag / pan) — sichqoncha va sensor
  (function () {
    const st = $("zStage");
    const start = (x, y) => { zDrag = { x, y, tx: zTx, ty: zTy }; st.classList.add("drag"); };
    const move = (x, y) => { if (!zDrag) return; zTx = zDrag.tx + (x - zDrag.x); zTy = zDrag.ty + (y - zDrag.y); applyZoom(); };
    const end = () => { if (zDrag) { zDrag = null; st.classList.remove("drag"); } };
    st.addEventListener("mousedown", (e) => { e.preventDefault(); start(e.clientX, e.clientY); });
    window.addEventListener("mousemove", (e) => { if (zDrag) move(e.clientX, e.clientY); });
    window.addEventListener("mouseup", end);
    st.addEventListener("touchstart", (e) => { const t = e.touches[0]; start(t.clientX, t.clientY); }, { passive: true });
    st.addEventListener("touchmove", (e) => { const t = e.touches[0]; move(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
    st.addEventListener("touchend", end);
  })();

  // ---------- hisobot ----------
  function loadImg(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; }); }
  async function composite(imgUrl, heatUrl, dets, showHeat, showBox) {
    const img = await loadImg(imgUrl);
    const cv = document.createElement("canvas"); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const ctx = cv.getContext("2d"); ctx.drawImage(img, 0, 0);
    if (showHeat && heatUrl) { try { const h = await loadImg(heatUrl); ctx.globalAlpha = 0.9; ctx.drawImage(h, 0, 0, cv.width, cv.height); ctx.globalAlpha = 1; } catch (e) {} }
    if (showBox) {
      const pi = primaryIndex(dets);
      (dets || []).forEach((d, k) => { const b = d.bbox || [0, 0, 0, 0]; const g = grp(d.label);
        ctx.strokeStyle = CLR[g] || "#f5b301"; ctx.lineWidth = Math.max(2, cv.width / 500) * (k === pi ? 1.8 : 1);
        ctx.strokeRect(b[0] * cv.width, b[1] * cv.height, b[2] * cv.width, b[3] * cv.height);
        ctx.fillStyle = ctx.strokeStyle; ctx.font = "bold " + Math.round(cv.width / 60) + "px sans-serif";
        ctx.fillText((k === pi ? "* " : "") + labelUz(g), b[0] * cv.width, Math.max(12, b[1] * cv.height - 4)); });
    }
    return cv.toDataURL("image/jpeg", 0.85);
  }
  $("reportBtn").addEventListener("click", async () => {
    const done = cells.filter((c) => c && c.diag);
    if (!done.length) { msg("Avval papkani yuklab tahlil qiling.", "bad"); return; }
    const btn = $("reportBtn"); btn.disabled = true; const o = btn.textContent; btn.innerHTML = '<span class="spin"></span>';
    try {
      const orig = $("tgOrig").checked; const showHeat = !orig && $("tgHeat").checked; const showBox = !orig;
      const now = new Date(); let maxMal = 0, findings = 0, secs = "";
      for (let i = 0; i < cells.length; i++) { const c = cells[i]; if (!c || !c.diag) continue;
        const comp = await composite(c.imgUrl, c.diag.heatmap_png, c.diag.detections || [], showHeat, showBox);
        const dets = c.diag.detections || []; findings += dets.length;
        const probs = c.diag.diagnosis && c.diag.diagnosis.probs; const mal = probs ? malProb(probs) : 0; if (mal > maxMal) maxMal = mal;
        const verdict = probs ? (mal >= 0.5 ? "Xavfli (malignant) — " + Math.round(mal * 100) + "%" : "Xavfsiz (benign) — " + Math.round((1 - mal) * 100) + "%") : "tashxis yo'q";
        const rows = dets.length ? dets.map((d, k) => "<tr><td>" + (k + 1) + "</td><td>" + esc(labelUz(grp(d.label))) + "</td><td>" + esc(quadrantUz(d.bbox || [0, 0, 0, 0])) + "</td><td>" + Math.round((d.confidence || 0) * 100) + "%</td></tr>").join("") : "<tr><td colspan='4'>o'choq topilmadi</td></tr>";
        secs += "<div class='rv'><h3>FFDM " + esc(viewTitle(c.info, i)) + "</h3><img src='" + comp + "'><p><b>Tashxis:</b> " + esc(verdict) + "</p><table><tr><th>#</th><th>O'choq</th><th>Joylashuv</th><th>Ishonch</th></tr>" + rows + "</table></div>";
      }
      const overall = maxMal >= 0.5 ? "⚠️ Xavf belgilari aniqlandi" : "✅ Xavfsizlik ehtimoli yuqori";
      const adv = lastAdvice ? "<div class='adv'><h2>🧠 Boshqaruv tavsiyalari (AI)</h2><p>" + esc(lastAdvice).replace(/\n/g, "<br>") + "</p></div>" : "";
      const html = "<!doctype html><html lang='uz'><head><meta charset='utf-8'><title>Mammografiya AI hisoboti</title><style>"
        + "body{font-family:system-ui,Arial,sans-serif;color:#111;margin:24px}h1{font-size:20px;margin:0 0 2px}.sub{color:#555;font-size:13px;margin-bottom:14px}"
        + ".ov{font-size:16px;font-weight:800;padding:10px 12px;border-radius:8px;background:#f4f6fb;margin:12px 0}.meta{font-size:13px;margin:8px 0}"
        + ".grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.rv{border:1px solid #ddd;border-radius:10px;padding:10px;break-inside:avoid}"
        + ".rv h3{margin:0 0 8px;font-size:15px}.rv img{width:100%;border-radius:6px;background:#000}table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}"
        + "td,th{border:1px solid #ddd;padding:3px 6px;text-align:left}.adv{margin-top:18px;padding:12px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc}"
        + ".adv h2{font-size:15px;margin:0 0 6px}.foot{margin-top:18px;font-size:11px;color:#777;border-top:1px solid #ddd;padding-top:8px}</style></head><body>"
        + "<h1>🩺 AI Scan — diagnostika hisoboti</h1><div class='sub'>Sana: " + esc(now.toLocaleString("uz")) + " · Vrach: " + esc(CUR_USER || "-") + "</div>"
        + "<div class='ov'>" + overall + "</div><div class='meta'>Ko'rinishlar: <b>" + done.length + "</b> · O'choqlar: <b>" + findings + "</b> · Eng yuqori xavf: <b>" + Math.round(maxMal * 100) + "%</b></div>"
        + "<div class='grid'>" + secs + "</div>" + adv
        + "<div class='foot'>Sun'iy intellekt tomonidan avtomatik shakllantirilgan (qaror qo'llab-quvvatlash). Yakuniy tashxis mutaxassis vrach zimmasida.</div></body></html>";
      const w = window.open("", "_blank"); if (!w) { msg("Pop-up bloklandi — ruxsat bering.", "bad"); return; }
      w.document.write(html); w.document.close(); w.focus(); setTimeout(() => { try { w.print(); } catch (e) {} }, 700);
    } catch (e) { msg("Hisobot xatosi: " + (e.message || e), "bad"); } finally { btn.disabled = false; btn.textContent = o; }
  });

  resume();
})();
