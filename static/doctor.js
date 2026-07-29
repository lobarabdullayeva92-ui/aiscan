/* Vrach paneli — AI Mammografiya diagnostika (CSP: tashqi skript). */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const TOKEN_KEY = "mamograf_jwt";
  const getToken = () => localStorage.getItem(TOKEN_KEY);
  const setToken = (t) => t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

  let curRef = null;

  async function api(url, opts) {
    opts = opts || {};
    const headers = new Headers(opts.headers || {});
    const tok = getToken();
    if (tok && !headers.has("Authorization")) headers.set("Authorization", "Bearer " + tok);
    const res = await fetch(url, Object.assign({}, opts, { headers }));
    if (res.status === 401) { setToken(null); showLogin(); throw new Error("401"); }
    if (!res.ok) {
      let t = ""; try { t = await res.text(); } catch (e) {}
      throw new Error(res.status + " " + t);
    }
    return res;
  }
  const apiJson = async (u, o) => (await api(u, o)).json();

  // ---------------- auth ----------------
  function showLogin() { $("loginOverlay").classList.remove("hidden"); }
  function hideLogin() { $("loginOverlay").classList.add("hidden"); }

  async function resume() {
    if (!getToken()) { showLogin(); return; }
    try {
      const me = await apiJson("/api/auth/me");
      $("userChip").textContent = (me.username || me.sub || "") + (me.role ? " · " + me.role : "");
      hideLogin();
    } catch (e) { showLogin(); }
  }

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("loginBtn"); const err = $("loginErr"); err.textContent = "";
    const body = { username: $("lUser").value.trim(), password: $("lPass").value };
    const totp = $("lTotp").value.trim(); if (totp) body.totp_code = totp;
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) {
        let d = null; try { d = await res.json(); } catch (e) {}
        if (res.status === 401 && d && d.detail && d.detail.error === "totp_required") {
          $("lTotp").classList.remove("hidden"); err.textContent = "TOTP kod kiriting.";
        } else {
          err.textContent = (d && typeof d.detail === "string") ? d.detail : "Noto'g'ri login yoki parol.";
        }
        return;
      }
      const data = await res.json();
      setToken(data.token);
      $("userChip").textContent = (data.user.username || "") + (data.user.role ? " · " + data.user.role : "");
      hideLogin();
    } catch (e2) { err.textContent = "Xatolik: " + e2.message; }
    finally { btn.disabled = false; btn.textContent = "Kirish"; }
  });

  $("logoutBtn").addEventListener("click", () => {
    api("/api/auth/logout", { method: "POST" }).catch(() => {});
    setToken(null); location.reload();
  });

  // ---------------- upload + diagnose ----------------
  const drop = $("drop"), fileInput = $("file");
  drop.addEventListener("click", () => fileInput.click());
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault(); drop.classList.remove("over");
    if (e.dataTransfer.files && e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", () => { if (fileInput.files.length) handleFile(fileInput.files[0]); });

  function msg(text, kind) {
    const m = $("msg"); m.textContent = text; m.classList.remove("hidden");
    m.style.borderColor = kind === "bad" ? "var(--bad)" : "var(--accent)";
    m.style.color = kind === "bad" ? "#ffd7d7" : "#cfe0ff";
  }
  function hideMsg() { $("msg").classList.add("hidden"); }

  async function handleFile(f) {
    if (!getToken()) { showLogin(); return; }
    hideMsg();
    $("result").classList.add("hidden");
    $("loading").classList.remove("hidden");
    try {
      const fd = new FormData(); fd.append("files", f, f.name);
      const up = await apiJson("/api/upload", { method: "POST", body: fd });
      const info = (up.files || [])[0];
      if (!info || !info.id) throw new Error("Yuklashda xato");
      if (!info.has_pixels) throw new Error("Bu DICOM'da tasvir (piksel) ma'lumoti yo'q.");
      curRef = info.id;
      const diag = await apiJson("/api/doctor/diagnose", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ref: curRef }),
      });
      await render(diag, info);
    } catch (e) {
      msg("Xatolik: " + (e.message || e), "bad");
    } finally {
      $("loading").classList.add("hidden");
    }
  }

  // ---------------- render ----------------
  async function render(d, info) {
    // Asosiy rasm — Bearer bilan blob sifatida (cookie'ga bog'liq emas)
    const imgRes = await api("/api/files/" + curRef + "/image?max_dim=2048");
    const blob = await imgRes.blob();
    $("baseImg").src = URL.createObjectURL(blob);

    // Issiqlik xaritasi
    const heat = $("heatImg");
    if (d.heatmap_png) { heat.src = d.heatmap_png; heat.style.display = ""; }
    else { heat.removeAttribute("src"); heat.style.display = "none"; }

    // Shubhali sohalar (bbox overlay)
    const layer = $("layer");
    layer.querySelectorAll(".box").forEach((b) => b.remove());
    (d.detections || []).forEach((det) => {
      const bb = det.bbox || [0, 0, 0, 0];
      const box = document.createElement("div");
      box.className = "box";
      box.style.left = (bb[0] * 100) + "%";
      box.style.top = (bb[1] * 100) + "%";
      box.style.width = (bb[2] * 100) + "%";
      box.style.height = (bb[3] * 100) + "%";
      const lab = document.createElement("b");
      lab.textContent = (det.label || "?") + " " + Math.round((det.confidence || 0) * 100) + "%";
      box.appendChild(lab);
      layer.appendChild(box);
    });
    applyToggles();

    // Tashxis paneli
    renderDiagnosis(d);

    const sz = d.image_size || [0, 0];
    $("imgMeta").textContent =
      (info.original_name ? info.original_name + " · " : "") +
      sz[0] + "×" + sz[1] + " px · modellar: " + ((d.models_used || []).length || "—") +
      " · qurilma: " + (d.device || "cpu");

    $("result").classList.remove("hidden");
  }

  function renderDiagnosis(d) {
    const body = $("diagBody");
    const dg = d.diagnosis;
    let html = "";
    if (dg && dg.probs) {
      const label = (dg.top1_label || "").toLowerCase();
      const isMal = /mal|xavf|rak|malignant/.test(label);
      const cls = isMal ? "mal" : "ben";
      const uzLabel = isMal ? "Xavfli (malignant) ehtimoli yuqori"
                            : "Xavfsiz (benign) ehtimoli yuqori";
      html += '<div class="verdict ' + cls + '">' + uzLabel + "</div>";
      html += '<div class="muted" style="font-size:13px;margin-bottom:12px">Ishonch: '
            + Math.round((dg.top1_conf || 0) * 100) + "%</div>";
      const entries = Object.entries(dg.probs).sort((a, b) => b[1] - a[1]);
      entries.forEach(([k, v]) => {
        const isM = /mal|xavf|rak|malignant/.test(k.toLowerCase());
        html += '<div class="prob-row"><span>' + labelUz(k) + "</span><span>" + Math.round(v * 100) + "%</span></div>";
        html += '<div class="bar"><i style="width:' + Math.round(v * 100) + '%;background:'
              + (isM ? "var(--bad)" : "var(--good)") + '"></i></div>';
      });
    } else {
      html += '<div class="muted">Klassifikatsiya modeli mavjud emas — faqat lokalizatsiya ko\'rsatildi.</div>';
    }

    const dets = d.detections || [];
    html += '<h2 style="margin-top:16px">Shubhali sohalar (' + dets.length + ")</h2>";
    if (dets.length) {
      html += '<ul class="findings">';
      dets.slice(0, 12).forEach((det) => {
        html += "<li><span>" + labelUz(det.label || "?") + '</span><span class="cf">'
              + Math.round((det.confidence || 0) * 100) + "%</span></li>";
      });
      html += "</ul>";
    } else {
      html += '<div class="muted" style="margin-top:6px">Model shubhali soha topmadi.</div>';
    }
    body.innerHTML = html;
  }

  function labelUz(k) {
    const m = {
      benign: "Xavfsiz (benign)", malignant: "Xavfli (malignant)",
      mass: "Massa (o'sma)", calcification: "Kalsifikatsiya",
      asymmetry: "Assimetriya", architectural_distortion: "Arxitektura buzilishi",
      lymph_node: "Limfa tugun",
    };
    return m[String(k).toLowerCase()] || k;
  }

  // ---------------- toggles ----------------
  function applyToggles() {
    $("heatImg").style.visibility = $("tgHeat").checked ? "visible" : "hidden";
    document.querySelectorAll("#layer .box").forEach((b) => {
      b.style.display = $("tgBox").checked ? "" : "none";
    });
  }
  $("tgHeat").addEventListener("change", applyToggles);
  $("tgBox").addEventListener("change", applyToggles);
  $("newBtn").addEventListener("click", () => {
    $("result").classList.add("hidden"); hideMsg();
    fileInput.value = ""; curRef = null;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  resume();
})();
