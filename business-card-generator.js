(function () {
  "use strict";

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }

  function clean(value) {
    return String(value == null ? "" : value)
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map(function (line) {
        return line.trim().replace(/[ \t]{2,}/g, " ");
      })
      .join("\n")
      .trim();
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function safeFile(value) {
    return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cartao";
  }

  var VALID_DDDS = {
    11:1,12:1,13:1,14:1,15:1,16:1,17:1,18:1,19:1,21:1,22:1,24:1,27:1,28:1,
    31:1,32:1,33:1,34:1,35:1,37:1,38:1,41:1,42:1,43:1,44:1,45:1,46:1,47:1,48:1,49:1,
    51:1,53:1,54:1,55:1,61:1,62:1,63:1,64:1,65:1,66:1,67:1,68:1,69:1,71:1,73:1,
    74:1,75:1,77:1,79:1,81:1,82:1,83:1,84:1,85:1,86:1,87:1,88:1,89:1,91:1,92:1,
    93:1,94:1,95:1,96:1,97:1,98:1,99:1
  };

  function phoneDigits(value, type) {
    var digits = String(value || "").replace(/\D/g, "");
    if ((digits.length === 12 || digits.length === 13) && digits.slice(0, 2) === "55") digits = digits.slice(2);
    return digits.slice(0, type === "landline" ? 10 : 11);
  }

  function formatPhone(value, type) {
    var digits = phoneDigits(value, type);
    if (!digits) return "";
    if (digits.length <= 2) return "(" + digits;
    var ddd = digits.slice(0, 2);
    var local = digits.slice(2);
    var firstLength = local.length > 8 ? 5 : Math.min(4, local.length);
    var first = local.slice(0, firstLength);
    var second = local.slice(firstLength);
    return "(" + ddd + ") " + first + (second ? "-" + second : "");
  }

  function validatePhone(value, type, required) {
    var digits = phoneDigits(value, type);
    var label = type === "landline" ? "Telefone fixo" : "Celular";
    var expected = type === "landline" ? 10 : 11;
    if (!digits) return { valid: !required, empty: true, message: required ? label + " não informado." : "DDD + 8 números" };
    if (digits.length !== expected) return { valid: false, empty: false, message: label + " deve ter DDD + " + (expected - 2) + " números." };
    if (!VALID_DDDS[digits.slice(0, 2)]) return { valid: false, empty: false, message: "DDD inválido. Confira os dois primeiros números." };
    if (type === "mobile" && digits.charAt(2) !== "9") return { valid: false, empty: false, message: "Celular deve começar com 9 após o DDD." };
    if (type === "landline" && !/[2-5]/.test(digits.charAt(2))) return { valid: false, empty: false, message: "Telefone fixo deve começar entre 2 e 5 após o DDD." };
    return { valid: true, empty: false, message: type === "landline" ? "Telefone fixo válido" : "Celular válido" };
  }

  function activeBrand() {
    var portal = window.PortalBrand || {};
    var list = portal.list || [];
    return list.find(function (item) { return item.id === portal.activeId; }) || list[0] || { id: "default", name: "VONDER", shortName: "VD", photo: "icons/icon_vonder.jpg" };
  }

  var brand = activeBrand();
  var embeddedAssets = window.BusinessCardAssets || { logos: {} };

  var BRAND_TEMPLATES = {
    "default": { label: "Institucional VONDER", source: "Identidade exclusiva VONDER", accent: "#F6BE00", ink: "#171717", style: "diagonal", qr: { x: 1460, y: 680, size: 300 } },
    "ferramentas-gerais": { label: "FG 96 × 56 mm", source: "Illustrator .ai preenchido", accent: "#005745", ink: "#706f6f", style: "fg", qr: { x: 1320, y: 580, size: 400 } },
    "osten-ferragens": { label: "Institucional OSTEN", source: "Identidade exclusiva OSTEN", accent: "#ED8B00", ink: "#252525", style: "sidebar", qr: { x: 1460, y: 680, size: 300 } },
    "dismatal": { label: "Institucional DISMATAL", source: "Identidade exclusiva DISMATAL", accent: "#FFED00", ink: "#181818", style: "stripe", qr: { x: 1460, y: 680, size: 300 } },
    "toolmix": { label: "Institucional TOOLMIX", source: "Identidade exclusiva TOOLMIX", accent: "#F26522", ink: "#272727", style: "corner", qr: { x: 1460, y: 680, size: 300 } },
    "dwt": { label: "Institucional DWT", source: "Identidade exclusiva DWT", accent: "#285C4D", secondary: "#AB2328", ink: "#262626", style: "split", qr: { x: 1460, y: 680, size: 300 } },
    "nove54": { label: "Institucional NOVE54", source: "Identidade exclusiva NOVE54", accent: "#BD1D1D", ink: "#191919", style: "rail", qr: { x: 1460, y: 680, size: 300 } },
    "grupo-ovd": { label: "Institucional GRUPO OVD", source: "Identidade exclusiva GRUPO OVD", accent: "#A6A6A6", secondary: "#F6BE00", ink: "#202020", style: "group", qr: { x: 1460, y: 680, size: 300 } }
  };

  var template = BRAND_TEMPLATES[brand.id] || { label: "Institucional " + brand.name, source: "Identidade exclusiva da marca", accent: "#4b5563", ink: "#202124", style: "corner" };
  var STORAGE_KEY = "business_card_generator_v1__" + brand.id;
  var state = { records: [], activeId: null, currentStep: "import" };
  var returnToImportTrigger = null;
  var canvas = $("cardCanvas");
  var ctx = canvas.getContext("2d");
  var W = canvas.width;
  var H = canvas.height;
  var renderToken = 0;
  var images = {};
  var fields = {
    logoVariant: $("fieldLogoVariant"),
    name: $("fieldName"),
    role: $("fieldRole"),
    address: $("fieldAddress"),
    landline: $("fieldLandline"),
    phone: $("fieldPhone"),
    email: $("fieldEmail"),
    website: $("fieldWebsite")
  };

  // Garante que a Swiss721 (fonte dos arquivos editáveis originais) esteja carregada antes de
  // qualquer desenho no canvas — sem isso, a 1ª renderização pode cair no fallback (Arial Narrow/Arial).
  var fontsReady = (function () {
    if (!window.FontFace || !document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([
      document.fonts.load("400 16px Swiss721"),
      document.fonts.load("700 16px Swiss721")
    ]).catch(function () {}).then(function () {
      return document.fonts.ready;
    }).catch(function () {});
  })();

  function uid() {
    return "bc_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function recordFrom(obj) {
    return {
      id: uid(),
      name: clean(obj.name),
      role: clean(obj.role),
      address: clean(obj.address),
      landline: formatPhone(obj.landline, "landline"),
      phone: formatPhone(obj.phone, "mobile"),
      email: clean(obj.email),
      website: clean(obj.website),
      logoVariant: obj.logoVariant === "fg-ico" ? "fg-ico" : "fg",
      selected: true,
      reviewed: false,
      approved: false,
      issues: []
    };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
    } catch (e) {}
  }

  function load() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(parsed)) state.records = parsed.map(function (r) {
        r.landline = formatPhone(r.landline, "landline");
        r.phone = formatPhone(r.phone, "mobile");
        return r;
      });
    } catch (e) {}
    if (state.records.length) {
      state.activeId = state.records[0].id;
    }
    showImport(false);
  }

  function current() {
    return state.records.find(function (item) { return item.id === state.activeId; }) || null;
  }

  function showWorkspace() {
    state.currentStep = "edit";
    $("importPanel").hidden = true;
    $("workspace").hidden = false;
    $("exportBar").hidden = false;
    renderAll();
  }

  function showImport(showExistingShortcut) {
    state.currentStep = "import";
    $("workspace").hidden = true;
    $("exportBar").hidden = true;
    $("importPanel").hidden = false;
    $("backToWorkspace").hidden = !showExistingShortcut || !state.records.length;
    updateFlow();
  }

  function toast(message) {
    var el = $("toast");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { el.hidden = true; }, 3200);
  }

  function updateFlow() {
    var any = state.records.length > 0;
    var reviewed = any && state.records.some(function (r) { return r.reviewed; });
    var approved = any && state.records.some(function (r) { return r.approved; });
    document.querySelectorAll(".bc-flow-step").forEach(function (el) {
      var step = el.getAttribute("data-step");
      var complete = (step === "import" && any) || (step === "edit" && reviewed) || (step === "review" && approved);
      var active = step === state.currentStep;
      el.classList.toggle("is-complete", complete);
      el.classList.toggle("is-active", active);
    });
  }

  function renderAll() {
    renderRecords();
    renderEditor();
    renderStats();
    updateFlow();
    renderCanvas(current());
  }

  function renderRecords() {
    var list = $("recordsList");
    $("recordsTitle").textContent = state.records.length + " " + (state.records.length === 1 ? "cartão" : "cartões");
    list.innerHTML = state.records.map(function (r, index) {
      var cls = "bc-record" + (r.id === state.activeId ? " is-active" : "") + (r.reviewed ? " is-reviewed" : "") + (r.approved ? " is-approved" : "");
      return '<div class="' + cls + '" data-record="' + r.id + '" role="button" tabindex="0">' +
        '<input type="checkbox" data-select="' + r.id + '" ' + (r.selected ? "checked" : "") + ' aria-label="Selecionar cartão ' + (index + 1) + '">' +
        '<span><strong>' + (esc(r.name) || "Cartão sem nome") + '</strong><small>' + esc(r.role || "Cargo não informado") + '</small></span>' +
        '<i class="bc-record-status" title="' + (r.approved ? "Aprovado" : r.reviewed ? "Revisado" : "Pendente") + '"></i>' +
        '<button type="button" class="bc-record-delete" data-delete="' + r.id + '" title="Excluir colaborador" aria-label="Excluir cartão de ' + esc(r.name || "colaborador") + '">✕</button>' +
        '</div>';
    }).join("");
    list.querySelectorAll("[data-record]").forEach(function (row) {
      row.addEventListener("click", function (ev) {
        if (ev.target.closest("[data-select],[data-delete]")) return;
        state.activeId = row.getAttribute("data-record");
        renderAll();
      });
      row.addEventListener("keydown", function (ev) {
        if ((ev.key === "Enter" || ev.key === " ") && !ev.target.closest("[data-select],[data-delete]")) {
          ev.preventDefault();
          state.activeId = row.getAttribute("data-record");
          renderAll();
        }
      });
    });
    list.querySelectorAll("[data-select]").forEach(function (check) {
      check.addEventListener("change", function () {
        var r = state.records.find(function (item) { return item.id === check.getAttribute("data-select"); });
        if (r) {
          r.selected = check.checked;
          save();
          renderRecords();
          renderStats();
        }
      });
    });
    list.querySelectorAll("[data-delete]").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        deleteRecord(btn.getAttribute("data-delete"));
      });
    });
  }

  function renderPhoneValidation(fieldName, type, showEmpty) {
    var input = fields[fieldName];
    var hint = $(fieldName === "landline" ? "landlineHint" : "phoneHint");
    if (!input || !hint) return;
    var result = validatePhone(input.value, type, fieldName === "phone");
    var invalid = !result.valid && (!result.empty || showEmpty);
    input.classList.toggle("is-invalid", invalid);
    input.setAttribute("aria-invalid", invalid ? "true" : "false");
    hint.classList.toggle("is-invalid", invalid);
    if (invalid || (!result.empty && result.valid)) hint.textContent = result.message;
    else hint.textContent = fieldName === "landline" ? "DDD + 8 números" : "DDD + 9 números";
  }

  function renderPhoneValidations(showEmpty) {
    renderPhoneValidation("landline", "landline", showEmpty);
    renderPhoneValidation("phone", "mobile", showEmpty);
  }

  function renderEditor() {
    var r = current();
    Object.keys(fields).forEach(function (key) {
      fields[key].disabled = !r;
      fields[key].value = r ? r[key] || "" : "";
    });
    $("editorTitle").textContent = r ? (r.name || "Cartão sem nome") : "Selecione um cartão";
    renderPhoneValidations(!!(r && r.reviewed));
    var approve = $("approveCurrent");
    approve.disabled = !r || !r.reviewed || hasBlocking(r);
    approve.checked = !!(r && r.approved);
    renderIssues(r);
  }

  function renderIssues(r) {
    var empty = $("reviewEmpty");
    var list = $("issuesList");
    if (!r || !r.reviewed) {
      empty.hidden = false;
      list.hidden = true;
      empty.querySelector("p").textContent = "Execute a revisão antes de aprovar o cartão para exportação.";
      return;
    }
    empty.hidden = true;
    list.hidden = false;
    if (!r.issues.length) {
      list.innerHTML = '<div class="bc-issue is-ok"><span>✓</span><span>Nenhum problema encontrado. Faça a leitura final da arte e aprove o cartão.</span></div>';
    } else {
      list.innerHTML = r.issues.map(function (i) {
        return '<div class="bc-issue ' + (i.level === "ok" ? "is-ok" : "") + '"><span>' + (i.blocking ? "!" : "•") + '</span><span>' + esc(i.message) + '</span></div>';
      }).join("");
    }
  }

  function renderStats() {
    var selected = state.records.filter(function (r) { return r.selected; }).length;
    var approved = state.records.filter(function (r) { return r.approved; }).length;
    $("selectionCount").textContent = selected + " selecionado" + (selected === 1 ? "" : "s");
    $("selectAll").checked = state.records.length > 0 && selected === state.records.length;
    $("selectAll").indeterminate = selected > 0 && selected < state.records.length;
    $("approvedCount").textContent = approved + " de " + state.records.length + " aprovados";
    $("exportCurrent").disabled = !current() || !current().approved;
    $("exportSelected").disabled = !selected;
    $("exportAll").disabled = !state.records.length;
    $("deleteSelected").disabled = !selected;
  }

  function backToImportIfEmpty() {
    if (state.records.length) return;
    showImport(false);
  }

  function deleteRecord(id) {
    var r = state.records.find(function (item) { return item.id === id; });
    if (!r) return;
    if (!confirm('Excluir o cartão de "' + (r.name || "colaborador sem nome") + '"? Esta ação não pode ser desfeita.')) return;
    state.records = state.records.filter(function (item) { return item.id !== id; });
    if (state.activeId === id) state.activeId = state.records.length ? state.records[0].id : null;
    save();
    backToImportIfEmpty();
    renderAll();
    toast("Cartão excluído.");
  }

  function deleteSelected() {
    var selected = state.records.filter(function (r) { return r.selected; });
    if (!selected.length) {
      toast("Nenhum cartão selecionado.");
      return;
    }
    if (!confirm("Excluir " + selected.length + " cartão" + (selected.length === 1 ? "" : "ões") + " selecionado" + (selected.length === 1 ? "" : "s") + "? Esta ação não pode ser desfeita.")) return;
    var ids = selected.map(function (r) { return r.id; });
    state.records = state.records.filter(function (r) { return ids.indexOf(r.id) < 0; });
    if (state.activeId && ids.indexOf(state.activeId) >= 0) state.activeId = state.records.length ? state.records[0].id : null;
    save();
    backToImportIfEmpty();
    renderAll();
    toast(selected.length + " cartão" + (selected.length === 1 ? "" : "ões") + " excluído" + (selected.length === 1 ? "" : "s") + ".");
  }

  function flashElement(el) {
    if (!el) return;
    el.classList.remove("bc-step-flash");
    void el.offsetWidth;
    el.classList.add("bc-step-flash");
    setTimeout(function () { el.classList.remove("bc-step-flash"); }, 1000);
  }

  function goToStep(step) {
    if (step === "import") {
      if (state.currentStep !== "import" && state.records.length) openReturnToImportModal();
      else {
        showImport(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }
    if (!state.records.length) {
      toast("Importe uma planilha ou adicione um cartão manualmente primeiro.");
      return;
    }
    $("importPanel").hidden = true;
    $("workspace").hidden = false;
    $("exportBar").hidden = false;
    state.currentStep = step;
    updateFlow();
    if (step === "edit") {
      var target = document.querySelector(".bc-editor-panel");
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        flashElement(target);
      }
    } else if (step === "review") {
      var review = document.querySelector(".bc-review-card");
      if (review) {
        review.scrollIntoView({ behavior: "smooth", block: "center" });
        flashElement(review);
      }
    } else if (step === "export") {
      var bar = $("exportBar");
      if (bar) {
        bar.scrollIntoView({ behavior: "smooth", block: "end" });
        flashElement(bar);
      }
    }
  }

  function openReturnToImportModal() {
    var modal = $("returnToImportModal");
    returnToImportTrigger = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    $("cancelReturnToImport").focus();
  }

  function closeReturnToImportModal() {
    $("returnToImportModal").hidden = true;
    document.body.style.overflow = "";
    if (returnToImportTrigger && returnToImportTrigger.focus) returnToImportTrigger.focus();
    returnToImportTrigger = null;
  }

  function confirmReturnToImport() {
    closeReturnToImportModal();
    state.records = [];
    state.activeId = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    showImport(false);
    renderCanvas(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function hasBlocking(r) {
    return !!(r && r.issues && r.issues.some(function (i) { return i.blocking; }));
  }

  function reviewRecord(r) {
    Object.keys(fields).forEach(function (key) { r[key] = clean(r[key]); });
    var issues = [];
    r.landline = formatPhone(r.landline, "landline");
    r.phone = formatPhone(r.phone, "mobile");
    if (!r.name) issues.push({ blocking: true, message: "Nome completo não informado." });
    if (!r.role) issues.push({ blocking: true, message: "Cargo não informado." });
    var landlineCheck = validatePhone(r.landline, "landline", false);
    var mobileCheck = validatePhone(r.phone, "mobile", true);
    if (!landlineCheck.valid) issues.push({ blocking: true, message: landlineCheck.message });
    if (!mobileCheck.valid) issues.push({ blocking: true, message: mobileCheck.message });
    if (!r.email) issues.push({ blocking: true, message: "E-mail não informado." });
    if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) issues.push({ blocking: true, message: "Confira o formato do e-mail." });
    if (r.website && !/[.]/.test(r.website)) issues.push({ blocking: false, message: "Confira o endereço do site: não foi encontrado um domínio completo." });
    var scan = (r.name + " " + r.role + " " + r.address).toLowerCase();
    var common = [
      [/\btecnico\b/, "“técnico”"],
      [/\bantonio\b/, "“Antônio”"],
      [/\bsao\b/, "“São”"],
      [/\bluis\b/, "“Luís”"],
      [/\bendereco\b/, "“endereço”"],
      [/\bgerencia\b/, "“gerência”"]
    ];
    common.forEach(function (rule) {
      if (rule[0].test(scan)) issues.push({ blocking: false, message: "Possível ajuste de acentuação: confira " + rule[1] + "." });
    });
    if (/[ ]{2,}/.test(r.name + " " + r.role + " " + r.landline + " " + r.phone)) issues.push({ blocking: false, message: "Há espaços duplicados; a limpeza automática foi aplicada." });
    r.reviewed = true;
    r.approved = false;
    r.issues = issues;
    state.currentStep = "review";
    save();
    renderAll();
    toast(issues.length ? issues.length + " ponto" + (issues.length === 1 ? "" : "s") + " para conferir." : "Revisão concluída sem alertas.");
  }

  function fieldChanged(ev) {
    var r = current();
    if (!r) return;
    if (ev.target.name === "landline" || ev.target.name === "phone") {
      ev.target.value = formatPhone(ev.target.value, ev.target.name === "landline" ? "landline" : "mobile");
    }
    r[ev.target.name] = ev.target.value;
    r.reviewed = false;
    r.approved = false;
    r.issues = [];
    save();
    $("saveState").textContent = "Alterações salvas localmente";
    renderRecords();
    renderStats();
    updateFlow();
    renderCanvas(r);
    renderIssues(r);
    renderPhoneValidations(false);
    $("approveCurrent").disabled = true;
    $("approveCurrent").checked = false;
  }

  function headerIndex(headers, aliases) {
    for (var i = 0; i < headers.length; i++) {
      var h = normalize(headers[i]);
      if (aliases.indexOf(h) >= 0) return i;
    }
    return -1;
  }

  function importRows(rows) {
    if (!rows || rows.length < 2) {
      toast("A planilha não contém linhas de dados.");
      return;
    }
    var headers = rows[0] || [];
    var map = {
      name: headerIndex(headers, ["nome", "nomecompleto", "name"]),
      role: headerIndex(headers, ["cargo", "funcao", "função", "role"]),
      address: headerIndex(headers, ["endereco", "address"]),
      landline: headerIndex(headers, ["telefonefixo", "fixo", "telefonecomercial", "landline"]),
      phone: headerIndex(headers, ["celular", "telefonecelular", "whatsapp", "mobile", "phone", "telefone", "fone"]),
      email: headerIndex(headers, ["email", "correioeletronico"]),
      website: headerIndex(headers, ["site", "website", "url"])
    };
    if (map.name < 0) {
      toast("Não encontrei a coluna NOME na planilha.");
      return;
    }
    var records = rows.slice(1).filter(function (row) {
      return row && row.some(function (v) { return clean(v) !== ""; });
    }).map(function (row) {
      var obj = {};
      Object.keys(map).forEach(function (key) { obj[key] = map[key] >= 0 ? row[map[key]] : ""; });
      return recordFrom(obj);
    });
    if (!records.length) {
      toast("Nenhum cartão válido foi encontrado.");
      return;
    }
    state.records = records;
    state.activeId = records[0].id;
    save();
    showWorkspace();
    toast(records.length + " cartões carregados da planilha.");
  }

  async function handleFile(file) {
    if (!file) return;
    if (!window.XLSX) {
      toast("Leitor de Excel indisponível.");
      return;
    }
    try {
      var data = await file.arrayBuffer();
      var workbook = XLSX.read(data, { type: "array", cellDates: false });
      var sheet = workbook.Sheets[workbook.SheetNames[0]];
      var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
      importRows(rows);
    } catch (e) {
      console.error(e);
      toast("Não foi possível ler a planilha. Confira o arquivo e tente novamente.");
    }
  }

  function loadImage(src) {
    if (images[src]) return images[src];
    images[src] = new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
    return images[src];
  }

  var fgColorizedTemplates = {};
  function colorizeFgTemplate(img) {
    if (fgColorizedTemplates[img.src]) return fgColorizedTemplates[img.src];
    var output = document.createElement("canvas");
    output.width = img.width;
    output.height = img.height;
    var outputCtx = output.getContext("2d", { willReadFrequently: true });
    outputCtx.drawImage(img, 0, 0);
    var pixels = outputCtx.getImageData(0, 0, output.width, output.height);
    var data = pixels.data;
    // O PNG-base foi renderizado com #145344. Recompomos apenas os pixels verdes e sua
    // suavização contra o branco para a cor digital aprovada #005745; o PDF usa CMYK 95/37/73/38, preservando logos e demais elementos.
    var oldColor = [20, 83, 68];
    var newColor = [0, 87, 69];
    var vector = [235, 172, 187];
    var norm = 235 * 235 + 172 * 172 + 187 * 187;
    for (var i = 0; i < data.length; i += 4) {
      var a = ((255 - data[i]) * vector[0] + (255 - data[i + 1]) * vector[1] + (255 - data[i + 2]) * vector[2]) / norm;
      if (a <= .015 || a > 1.03) continue;
      var pr = 255 - a * vector[0];
      var pg = 255 - a * vector[1];
      var pb = 255 - a * vector[2];
      var distance = Math.abs(data[i] - pr) + Math.abs(data[i + 1] - pg) + Math.abs(data[i + 2] - pb);
      if (distance < 18) {
        data[i] = Math.round(255 + a * (newColor[0] - 255));
        data[i + 1] = Math.round(255 + a * (newColor[1] - 255));
        data[i + 2] = Math.round(255 + a * (newColor[2] - 255));
      }
    }
    outputCtx.putImageData(pixels, 0, 0);
    fgColorizedTemplates[img.src] = output;
    return output;
  }

  function hexToRgb(hex) {
    var h = String(hex || "#000000").replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    var n = parseInt(h, 16) || 0;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function shade(hex, amount) {
    var c = hexToRgb(hex);
    function p(v) { return Math.max(0, Math.min(255, Math.round(v + (amount >= 0 ? (255 - v) * amount : v * amount)))); }
    return "rgb(" + p(c.r) + "," + p(c.g) + "," + p(c.b) + ")";
  }

  function fitText(text, maxWidth, startSize, fontWeight) {
    var size = startSize;
    ctx.font = (fontWeight || 700) + " " + size + "px Swiss721,Arial Narrow,Arial,sans-serif";
    while (size > 24 && ctx.measureText(text).width > maxWidth) {
      size -= 2;
      ctx.font = (fontWeight || 700) + " " + size + "px Swiss721,Arial Narrow,Arial,sans-serif";
    }
    return size;
  }

  function wrapText(text, maxWidth, maxLines) {
    var source = String(text || "").split(/\n/);
    var lines = [];
    source.forEach(function (paragraph) {
      var words = paragraph.split(/\s+/);
      var line = "";
      words.forEach(function (word) {
        var test = line ? line + " " + word : word;
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      });
      if (line) lines.push(line);
    });
    return lines.slice(0, maxLines);
  }

  function vCardEscape(value) {
    return clean(value).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  }

  function vCardPhone(value) {
    var digits = clean(value).replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
    return "+" + digits;
  }

  function vCardUrl(value) {
    var url = clean(value);
    return url && !/^https?:\/\//i.test(url) ? "https://" + url : url;
  }

  function vCardName(value) {
    var parts = clean(value).split(/\s+/).filter(Boolean);
    if (parts.length < 2) return ";" + vCardEscape(value) + ";;;";
    return vCardEscape(parts.pop()) + ";" + vCardEscape(parts.join(" ")) + ";;;";
  }

  function contactVCard(r) {
    var lines = ["BEGIN:VCARD", "VERSION:3.0", "N:" + vCardName(r.name), "FN:" + vCardEscape(r.name), "ORG:" + vCardEscape(brand.name), "TITLE:" + vCardEscape(r.role)];
    var landline = vCardPhone(r.landline);
    var phone = vCardPhone(r.phone);
    var url = vCardUrl(r.website);
    if (landline) lines.push("TEL;TYPE=WORK,VOICE:" + landline);
    if (phone) lines.push("TEL;TYPE=CELL:" + phone);
    if (r.email) lines.push("EMAIL;TYPE=INTERNET:" + vCardEscape(r.email));
    if (r.address) lines.push("ADR;TYPE=WORK:;;" + vCardEscape(r.address) + ";;;;");
    if (url) lines.push("URL:" + vCardEscape(url));
    lines.push("END:VCARD");
    return lines.join("\r\n");
  }

  function drawContactQr(r, layout) {
    if (!layout || !window.qrcode) return;
    // UTF-8 preserva corretamente os acentos de nomes, cargos e endereços.
    if (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs["UTF-8"]) qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
    var qr = qrcode(0, "M");
    qr.addData(contactVCard(r));
    qr.make();
    var modules = qr.getModuleCount();
    var quiet = 4;
    var total = modules + quiet * 2;
    var x = layout.x;
    var y = layout.y;
    var size = layout.size;
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = "#000";
    for (var row = 0; row < modules; row++) {
      for (var col = 0; col < modules; col++) {
        if (qr.isDark(row, col)) {
          var x0 = x + Math.floor((col + quiet) * size / total);
          var x1 = x + Math.ceil((col + quiet + 1) * size / total);
          var y0 = y + Math.floor((row + quiet) * size / total);
          var y1 = y + Math.ceil((row + quiet + 1) * size / total);
          ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        }
      }
    }
    ctx.restore();
  }

  function drawCropMarks() {
    var inset = 40;
    var gap = 11;
    var len = 29;
    ctx.save();
    ctx.strokeStyle = "#ff00ff";
    ctx.lineWidth = 2;
    [
      [0, inset, inset - gap, inset],
      [W - inset + gap, inset, W, inset],
      [0, H - inset, inset - gap, H - inset],
      [W - inset + gap, H - inset, W, H - inset],
      [inset, 0, inset, inset - gap],
      [W - inset, 0, W - inset, inset - gap],
      [inset, H - inset + gap, inset, H],
      [W - inset, H - inset + gap, W - inset, H]
    ].forEach(function (a) {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(a[2], a[3]);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawContact(r, x, y, width, color) {
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.font = "400 42px Swiss721,Arial Narrow,Arial,sans-serif";
    var address = wrapText(r.address, width, 2);
    address.forEach(function (line, i) { ctx.fillText(line, x, y + i * 38); });
    var phoneLine = [r.phone ? "Celular: " + r.phone : "", r.landline ? "Telefone: " + r.landline : ""].filter(Boolean).join("   |   ");
    fitText(phoneLine, width, 42, 700);
    ctx.fillText(phoneLine, x, y + 112);
    ctx.font = "400 38px Swiss721,Arial Narrow,Arial,sans-serif";
    var contact = [r.email, r.website].filter(Boolean).join("  |  ");
    fitText(contact, width, 38, 400);
    ctx.fillText(contact, x, y + 164);
  }

  // posição (px), tamanho de fonte (px) e cor abaixo replicam exatamente o arquivo de impressão
  // (business-card-assets/source/fg-business-card.ai / .pdf, card 94×54mm a 20px/mm): Nome 11.5pt,
  // Cargo 8.5pt e Endereço/Celular/E-mail·Site 7pt, todos na cor #4d4d4d (CMYK 0/0/0/70). Esses
  // valores são fixos — não usam fitText/auto-encolhe — porque esse é o padrão gráfico aprovado
  // para impressão e não pode variar conforme o texto digitado.
  var FG_GRAY = "#4d4d4d";
  var FG_RIGHT = 1720.19;
  var FG_LEFT = 116;
  var FG_LINE = 58.31;

  // Variação de logotipo por cartão: "fg" é o padrão institucional já usado; "fg-ico" acrescenta o
  // selo ICO ao lado do logotipo (business-card-assets/source, arquivo cedido por Lucas). A escolha
  // fica salva em cada registro (r.logoVariant), afetando somente o cartão selecionado. As duas
  // imagens vêm embutidas em base64 (business-card-assets.js) — carregar por caminho relativo
  // sob file:// "contamina" o canvas e impede a releitura de pixels (getImageData) na recolorização.
  var FG_LOGO_VARIANTS = {
    "fg": "business-card-assets/fg-template-600.png",
    "fg-ico": "business-card-assets/fg-ico-template-600.png"
  };

  async function drawFg(r, token) {
    var variant = r.logoVariant === "fg-ico" ? "fg-ico" : "fg";
    var embeddedSrc = variant === "fg" ? embeddedAssets.fgTemplate : embeddedAssets.fgTemplateIco;
    var templateSrc = embeddedSrc || FG_LOGO_VARIANTS[variant];
    var bg = await loadImage(templateSrc);
    if (token !== renderToken) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    if (bg) ctx.drawImage(colorizeFgTemplate(bg), 0, 0, W, H);
    ctx.fillStyle = "#fff";
    ctx.fillRect(W * .75, H * .30, W * .23, H * .27);
    ctx.fillRect(85, H * .64, template.qr.x - 160, H * .32);
    ctx.fillStyle = FG_GRAY;
    ctx.textAlign = "right";
    ctx.font = "700 81.14px Swiss721,Arial Narrow,Arial,sans-serif";
    ctx.fillText(r.name || "Nome", FG_RIGHT, 447.43);
    ctx.font = "400 59.97px Swiss721,Arial Narrow,Arial,sans-serif";
    ctx.fillText(r.role || "Cargo", FG_RIGHT, 517.95);
    ctx.textAlign = "left";
    ctx.font = "400 48.59px Swiss721,Arial Narrow,Arial,sans-serif";
    var addressLines = wrapText(r.address, template.qr.x - FG_LEFT - 55, 2);
    addressLines.forEach(function (line, i) { ctx.fillText(line, FG_LEFT, 805.18 + i * FG_LINE); });
    // Telefones e E-mail/Site têm âncoras fixas no original. Nunca descem quando o endereço quebra.
    var phoneLine = [r.phone ? "Celular: " + r.phone : "", r.landline ? "Telefone: " + r.landline : ""].filter(Boolean).join("   |   ");
    fitText(phoneLine, template.qr.x - FG_LEFT - 55, 48.59, 400);
    ctx.fillText(phoneLine, FG_LEFT, 921.81);
    ctx.font = "400 48.59px Swiss721,Arial Narrow,Arial,sans-serif";
    var contact = [r.email, r.website].filter(Boolean).join(" | ");
    ctx.fillText(contact, FG_LEFT, 980.12);
    drawContactQr(r, template.qr);
    drawCropMarks();
  }

  function drawDecor(style, accent, secondary) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    if (style === "diagonal") {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(W * .48, 0);
      ctx.lineTo(W * .31, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#171717";
      ctx.fillRect(0, H * .78, W, H * .22);
    } else if (style === "sidebar") {
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, W * .34, H);
      ctx.fillStyle = shade(accent, -.22);
      ctx.beginPath();
      ctx.moveTo(W * .34, 0);
      ctx.lineTo(W * .46, 0);
      ctx.lineTo(W * .35, H);
      ctx.lineTo(W * .24, H);
      ctx.closePath();
      ctx.fill();
    } else if (style === "stripe") {
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, W, H * .31);
      ctx.fillStyle = "#1c1c1c";
      ctx.fillRect(0, H * .31, W, H * .055);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(W * .70, H);
      ctx.lineTo(W, H * .62);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    } else if (style === "corner") {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(W * .62, 0);
      ctx.lineTo(W * .45, H * .36);
      ctx.lineTo(0, H * .36);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(accent, -.28);
      ctx.beginPath();
      ctx.moveTo(W * .75, H);
      ctx.lineTo(W, H * .70);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    } else if (style === "split") {
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, W, H * .29);
      ctx.fillStyle = secondary || "#AB2328";
      ctx.fillRect(0, H * .29, W, H * .035);
      ctx.fillRect(W * .94, 0, W * .06, H);
    } else if (style === "rail") {
      ctx.fillStyle = "#202124";
      ctx.fillRect(0, 0, W * .30, H);
      ctx.fillStyle = accent;
      ctx.fillRect(W * .30, 0, W * .045, H);
      ctx.beginPath();
      ctx.moveTo(W * .76, H);
      ctx.lineTo(W, H * .72);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, W, H * .25);
      ctx.fillStyle = secondary || "#e4e4e4";
      ctx.fillRect(0, H * .25, W, H * .035);
      ctx.fillStyle = "#f1f1f1";
      ctx.beginPath();
      ctx.arc(W * .87, H * .80, W * .30, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  async function drawGeneric(r, token) {
    drawDecor(template.style, template.accent, template.secondary);
    var logoSource = (embeddedAssets.logos && embeddedAssets.logos[brand.id]) || brand.photo;
    var img = logoSource ? await loadImage(logoSource) : null;
    if (token !== renderToken) return;
    var lightHeader = template.style === "stripe" || template.style === "group";
    var logoX = 90, logoY = 70, logoW = 320, logoH = 145;
    ctx.save();
    ctx.fillStyle = lightHeader ? "#fff" : "rgba(255,255,255,.95)";
    ctx.beginPath();
    ctx.roundRect(logoX, logoY, logoW, logoH, 18);
    ctx.fill();
    if (img) {
      var ratio = Math.min((logoW - 34) / img.width, (logoH - 26) / img.height);
      var iw = img.width * ratio;
      var ih = img.height * ratio;
      ctx.drawImage(img, logoX + (logoW - iw) / 2, logoY + (logoH - ih) / 2, iw, ih);
    } else {
      ctx.fillStyle = template.ink;
      ctx.textAlign = "center";
      ctx.font = "700 64px Arial";
      ctx.fillText(brand.shortName || brand.name, logoX + logoW / 2, logoY + 93);
    }
    ctx.restore();
    var left = (template.style === "sidebar" || template.style === "rail") ? W * .42 : W * .51;
    ctx.textAlign = "left";
    ctx.fillStyle = template.ink;
    var max = W - left - 100;
    var size = fitText(r.name || "Nome", max, 78, 700);
    ctx.font = "700 " + size + "px Swiss721,Arial Narrow,Arial,sans-serif";
    ctx.fillText(r.name || "Nome", left, H * .39);
    size = fitText(r.role || "Cargo", max, 44, 400);
    ctx.font = "400 " + size + "px Swiss721,Arial Narrow,Arial,sans-serif";
    ctx.fillStyle = shade(template.ink, .25);
    ctx.fillText(r.role || "Cargo", left, H * .47);
    var contactWidth = template.qr ? Math.max(320, template.qr.x - left - 45) : max;
    drawContact(r, left, H * .62, contactWidth, template.ink);
    drawContactQr(r, template.qr);
    drawCropMarks();
  }

  async function renderCanvas(r, targetCanvas, logicalSize) {
    await fontsReady;
    if (targetCanvas && targetCanvas !== canvas) {
      var oldCanvas = canvas, oldCtx = ctx;
      canvas = targetCanvas;
      ctx = canvas.getContext("2d");
      var physicalWidth = canvas.width, physicalHeight = canvas.height;
      W = logicalSize ? logicalSize.width : physicalWidth;
      H = logicalSize ? logicalSize.height : physicalHeight;
      ctx.setTransform(physicalWidth / W, 0, 0, physicalHeight / H, 0, 0);
      var localToken = ++renderToken;
      if (template.style === "fg") await drawFg(r || recordFrom({}), localToken);
      else await drawGeneric(r || recordFrom({}), localToken);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      canvas = oldCanvas;
      ctx = oldCtx;
      W = oldCanvas.width;
      H = oldCanvas.height;
      return;
    }
    var token = ++renderToken;
    r = r || recordFrom({ name: "Nome", role: "Cargo" });
    if (template.style === "fg") await drawFg(r, token);
    else await drawGeneric(r, token);
  }

  function validateExport(records) {
    if (!records.length) {
      toast("Nenhum cartão foi selecionado.");
      return false;
    }
    var pending = records.filter(function (r) { return !r.approved; });
    if (pending.length) {
      toast("Revise e aprove " + pending.length + " " + (pending.length === 1 ? "cartão" : "cartões") + " antes de exportar.");
      return false;
    }
    return true;
  }

  function concatBytes(parts) {
    var length = parts.reduce(function (total, part) { return total + part.length; }, 0);
    var result = new Uint8Array(length);
    var offset = 0;
    parts.forEach(function (part) {
      result.set(part, offset);
      offset += part.length;
    });
    return result;
  }

  function base64ToBytes(value) {
    var binary = atob(value), bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function asciiBytes(value) {
    return new TextEncoder().encode(value);
  }

  async function compressPdfStream(bytes) {
    if (!window.CompressionStream) return { bytes: bytes, filter: "" };
    try {
      var stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
      return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), filter: " /Filter /FlateDecode" };
    } catch (e) {
      return { bytes: bytes, filter: "" };
    }
  }

  function canvasToCmyk(canvasElement) {
    var rgba = canvasElement.getContext("2d").getImageData(0, 0, canvasElement.width, canvasElement.height).data;
    var output = new Uint8Array(canvasElement.width * canvasElement.height * 4);
    var brandRgb = [0, 87, 69];
    var brandCmyk = [.95, .37, .73, .38];
    var vector = [255 - brandRgb[0], 255 - brandRgb[1], 255 - brandRgb[2]];
    var norm = vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2];
    for (var source = 0, target = 0; source < rgba.length; source += 4, target += 4) {
      var r = rgba[source], g = rgba[source + 1], b = rgba[source + 2];
      // Preserva o verde institucional (inclusive pixels suavizados) com a receita CMYK exata.
      var coverage = ((255 - r) * vector[0] + (255 - g) * vector[1] + (255 - b) * vector[2]) / norm;
      var predictedR = 255 - coverage * vector[0];
      var predictedG = 255 - coverage * vector[1];
      var predictedB = 255 - coverage * vector[2];
      if (coverage > .015 && coverage <= 1.03 && Math.abs(r - predictedR) + Math.abs(g - predictedG) + Math.abs(b - predictedB) < 18) {
        output[target] = Math.round(255 * brandCmyk[0] * coverage);
        output[target + 1] = Math.round(255 * brandCmyk[1] * coverage);
        output[target + 2] = Math.round(255 * brandCmyk[2] * coverage);
        output[target + 3] = Math.round(255 * brandCmyk[3] * coverage);
        continue;
      }
      var red = r / 255, green = g / 255, blue = b / 255;
      var k = 1 - Math.max(red, green, blue);
      var denominator = 1 - k;
      output[target] = denominator ? Math.round(255 * (1 - red - k) / denominator) : 0;
      output[target + 1] = denominator ? Math.round(255 * (1 - green - k) / denominator) : 0;
      output[target + 2] = denominator ? Math.round(255 * (1 - blue - k) / denominator) : 0;
      output[target + 3] = Math.round(255 * k);
    }
    return output;
  }

  // Arte calibrada: cartão de 90 × 50 mm de corte + 2 mm de sangria original = 94 × 54 mm em
  // pontos PDF (1pt = 1/72in, 1in = 25.4mm). Este é o canvas 1880 × 1080 já aprovado — nunca
  // deve ser redimensionado nem ter suas posições internas recalculadas.
  var DESIGN_WIDTH_PT = 266.456693;
  var DESIGN_HEIGHT_PT = 153.070866;
  // No arquivo final, a sangria aumenta de 2 mm (já presente na arte) para 3 mm, e uma margem
  // branca adicional de 8 mm é acrescentada por fora da sangria — ambas aplicadas por
  // pós-processamento sobre a arte pronta, sem tocar nas posições internas do cartão.
  var BLEED_EXTRA_MM = 1;
  var WHITE_MARGIN_MM = 8;
  // Resolução de exportação e perfil de cor de destino exigidos pela gráfica.
  var EXPORT_DPI = 600;
  var OUTPUT_PROFILE_NAME = "Coated FOGRA39 \\(ISO 12647-2:2004\\)";

  // Estica a última linha/coluna de pixels da arte para fora, criando a sangria extra de forma
  // contínua (sem costura), sem alterar nenhum pixel do conteúdo original.
  function extendEdges(source, padPx) {
    if (!padPx) return source;
    var sw = source.width, sh = source.height;
    var out = document.createElement("canvas");
    out.width = sw + 2 * padPx;
    out.height = sh + 2 * padPx;
    var octx = out.getContext("2d");
    octx.drawImage(source, 0, 0, 1, 1, 0, 0, padPx, padPx);
    octx.drawImage(source, sw - 1, 0, 1, 1, padPx + sw, 0, padPx, padPx);
    octx.drawImage(source, 0, sh - 1, 1, 1, 0, padPx + sh, padPx, padPx);
    octx.drawImage(source, sw - 1, sh - 1, 1, 1, padPx + sw, padPx + sh, padPx, padPx);
    octx.drawImage(source, 0, 0, sw, 1, padPx, 0, sw, padPx);
    octx.drawImage(source, 0, sh - 1, sw, 1, padPx, padPx + sh, sw, padPx);
    octx.drawImage(source, 0, 0, 1, sh, 0, padPx, padPx, sh);
    octx.drawImage(source, sw - 1, 0, 1, sh, padPx + sw, padPx, padPx, sh);
    octx.drawImage(source, padPx, padPx);
    return out;
  }

  // Acrescenta a moldura branca por fora do arquivo (fora da sangria), sem tocar na arte.
  function addWhiteMargin(source, padPx) {
    if (!padPx) return source;
    var out = document.createElement("canvas");
    out.width = source.width + 2 * padPx;
    out.height = source.height + 2 * padPx;
    var octx = out.getContext("2d");
    octx.fillStyle = "#fff";
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(source, padPx, padPx);
    return out;
  }

  // Reamostra o canvas (renderizado em alta resolução para nitidez na tela) para os pixels
  // exatos que resultam em EXPORT_DPI no tamanho físico real do cartão.
  function dpiScaledCanvas(source, widthPt, heightPt, dpi) {
    var width = Math.ceil(widthPt / 72 * dpi);
    var height = Math.ceil(heightPt / 72 * dpi);
    if (source.width === width && source.height === height) return source;
    var target = document.createElement("canvas");
    target.width = width;
    target.height = height;
    var targetCtx = target.getContext("2d");
    targetCtx.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in targetCtx) targetCtx.imageSmoothingQuality = "high";
    targetCtx.drawImage(source, 0, 0, width, height);
    return target;
  }

  async function buildCmykPdf(canvasElement, widthPt, heightPt) {
    var exportCanvas = dpiScaledCanvas(canvasElement, widthPt, heightPt, EXPORT_DPI);
    var image = await compressPdfStream(canvasToCmyk(exportCanvas));
    var profileBytes = base64ToBytes(window.BusinessCardPrintProfile || "");
    if (!profileBytes.length) throw new Error("Perfil ICC CoatedFOGRA39 não carregado.");
    var profile = await compressPdfStream(profileBytes);
    var content = asciiBytes("q\n" + widthPt + " 0 0 " + heightPt + " 0 0 cm\n/Im0 Do\nQ\n");
    var objects = [
      asciiBytes("<< /Type /Catalog /Pages 2 0 R /OutputIntents [6 0 R] >>"),
      asciiBytes("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
      asciiBytes("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + widthPt + " " + heightPt + "] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>"),
      concatBytes([
        asciiBytes("<< /Type /XObject /Subtype /Image /Width " + exportCanvas.width + " /Height " + exportCanvas.height + " /ColorSpace /DeviceCMYK /BitsPerComponent 8" + image.filter + " /Length " + image.bytes.length + " >>\nstream\n"),
        image.bytes,
        asciiBytes("\nendstream")
      ]),
      concatBytes([
        asciiBytes("<< /Length " + content.length + " >>\nstream\n"),
        content,
        asciiBytes("endstream")
      ]),
      // Declara o perfil de saída Coated FOGRA39 e liga o OutputIntent ao binário ICC
      // incorporado no objeto seguinte, permitindo sua leitura efetiva pelo RIP da gráfica.
      asciiBytes("<< /Type /OutputIntent /S /GTS_PDFX /OutputConditionIdentifier (FOGRA39) /OutputCondition (" + OUTPUT_PROFILE_NAME + ") /RegistryName (http://www.color.org) /Info (" + OUTPUT_PROFILE_NAME + ") /DestOutputProfile 7 0 R >>"),
      concatBytes([
        asciiBytes("<< /N 4 /Alternate /DeviceCMYK" + profile.filter + " /Length " + profile.bytes.length + " >>\nstream\n"),
        profile.bytes,
        asciiBytes("\nendstream")
      ])
    ];
    var parts = [asciiBytes("%PDF-1.4\n% CMYK print file - " + EXPORT_DPI + " DPI\n")];
    var offsets = [0];
    var length = parts[0].length;
    objects.forEach(function (object, index) {
      offsets[index + 1] = length;
      var wrapped = concatBytes([asciiBytes((index + 1) + " 0 obj\n"), object, asciiBytes("\nendobj\n")]);
      parts.push(wrapped);
      length += wrapped.length;
    });
    var xrefOffset = length;
    var xref = "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
    for (var i = 1; i <= objects.length; i++) xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    xref += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF\n";
    var bytes = concatBytes(parts.concat([asciiBytes(xref)]));
    return {
      output: function (type) {
        if (type === "arraybuffer") return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        if (type === "blob") return new Blob([bytes], { type: "application/pdf" });
        return bytes;
      },
      save: function (name) {
        triggerBlob(new Blob([bytes], { type: "application/pdf" }), name);
      }
    };
  }

  async function cardPdfDoc(record) {
    var scratch = document.createElement("canvas");
    scratch.width = Math.ceil(DESIGN_WIDTH_PT / 72 * EXPORT_DPI);
    scratch.height = Math.ceil(DESIGN_HEIGHT_PT / 72 * EXPORT_DPI);
    // Renderiza diretamente nos pixels finais de impressão, mantendo o sistema lógico 1880 × 1080
    // para preservar todas as posições aprovadas sem uma etapa posterior de ampliação.
    await renderCanvas(record, scratch, { width: 1880, height: 1080 });
    // Pós-processamento: estica 1 mm extra de sangria (2 → 3 mm) e acrescenta 8 mm de margem
    // branca por fora do arquivo, sem alterar nenhum pixel do cartão de 90 × 50 mm já renderizado.
    var bleedPadPx = Math.round(BLEED_EXTRA_MM / 25.4 * EXPORT_DPI);
    var marginPadPx = Math.round(WHITE_MARGIN_MM / 25.4 * EXPORT_DPI);
    var withExtraBleed = extendEdges(scratch, bleedPadPx);
    var withMargin = addWhiteMargin(withExtraBleed, marginPadPx);
    var pageWidthPt = withMargin.width / EXPORT_DPI * 72;
    var pageHeightPt = withMargin.height / EXPORT_DPI * 72;
    return buildCmykPdf(withMargin, pageWidthPt, pageHeightPt);
  }

  function triggerBlob(blob, name) {
    var a = document.createElement("a");
    var u = URL.createObjectURL(blob);
    a.href = u;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 1200);
  }

  var ZIP_CRC_TABLE = (function () {
    var table = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function zipCrc(bytes) {
    var crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) crc = ZIP_CRC_TABLE[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function zipHeader(size) {
    var bytes = new Uint8Array(size);
    var view = new DataView(bytes.buffer);
    return {
      bytes: bytes,
      u16: function (offset, value) { view.setUint16(offset, value, true); },
      u32: function (offset, value) { view.setUint32(offset, value >>> 0, true); }
    };
  }

  function zipDate() {
    var d = new Date();
    var year = Math.max(1980, d.getFullYear());
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
  }

  function makeZip(files) {
    var encoder = new TextEncoder();
    var stamp = zipDate();
    var locals = [];
    var centrals = [];
    var offset = 0;
    files.forEach(function (file) {
      var name = encoder.encode(file.name);
      var data = file.data;
      var crc = zipCrc(data);
      var local = zipHeader(30);
      local.u32(0, 0x04034b50);
      local.u16(4, 20);
      local.u16(6, 0x800);
      local.u16(8, 0);
      local.u16(10, stamp.time);
      local.u16(12, stamp.date);
      local.u32(14, crc);
      local.u32(18, data.length);
      local.u32(22, data.length);
      local.u16(26, name.length);
      local.u16(28, 0);
      locals.push(local.bytes, name, data);
      var central = zipHeader(46);
      central.u32(0, 0x02014b50);
      central.u16(4, 20);
      central.u16(6, 20);
      central.u16(8, 0x800);
      central.u16(10, 0);
      central.u16(12, stamp.time);
      central.u16(14, stamp.date);
      central.u32(16, crc);
      central.u32(20, data.length);
      central.u32(24, data.length);
      central.u16(28, name.length);
      central.u16(30, 0);
      central.u16(32, 0);
      central.u16(34, 0);
      central.u16(36, 0);
      central.u32(38, 0);
      central.u32(42, offset);
      centrals.push(central.bytes, name);
      offset += 30 + name.length + data.length;
    });
    var centralSize = centrals.reduce(function (total, part) { return total + part.length; }, 0);
    var end = zipHeader(22);
    end.u32(0, 0x06054b50);
    end.u16(4, 0);
    end.u16(6, 0);
    end.u16(8, files.length);
    end.u16(10, files.length);
    end.u32(12, centralSize);
    end.u32(16, offset);
    end.u16(20, 0);
    return new Blob(locals.concat(centrals, [end.bytes]), { type: "application/zip" });
  }

  function uniqueFileName(base, used) {
    var name = base, n = 2;
    while (used[name]) {
      name = base + "-" + n;
      n++;
    }
    used[name] = true;
    return name;
  }

  async function exportPdf(records, label) {
    if (!validateExport(records)) return;
    if (records.length === 1) {
      toast("Preparando cartão…");
      var doc = await cardPdfDoc(records[0]);
      doc.save(safeFile(records[0].name) + ".pdf");
      toast("PDF gerado com sucesso.");
      return;
    }
    // cada cartão vira um PDF individual (nome = nome completo da pessoa), não mais páginas de
    // um único PDF — assim cada arquivo pode ir separado pra gráfica/participante; agrupamos
    // tudo num ZIP só pra facilitar o download em lote
    toast("Preparando " + records.length + " cartões em PDFs individuais…");
    var used = {};
    var files = [];
    for (var i = 0; i < records.length; i++) {
      var recordDoc = await cardPdfDoc(records[i]);
      var name = uniqueFileName(safeFile(records[i].name), used);
      files.push({ name: name + ".pdf", data: new Uint8Array(recordDoc.output("arraybuffer")) });
    }
    var zip = makeZip(files);
    var zipName = safeFile(brand.name) + "-" + label + "-" + records.length + "-cartoes";
    triggerBlob(zip, zipName + ".zip");
    toast("ZIP com " + records.length + " PDFs gerado com sucesso.");
  }

  function addManual() {
    var r = recordFrom({ name: "", role: "", address: "", landline: "", phone: "", email: "", website: "" });
    state.records.push(r);
    state.activeId = r.id;
    save();
    showWorkspace();
  }

  function loadDemo() {
    var demo = [
      { name: "Mariana Alves", role: "Supervisora de Vendas Externas", address: "Av. Antônio Gazzola, 1001 | Jardim Corazza\nItu | SP | CEP 13301-245", landline: "(11) 3333-4444", phone: "(11) 99999-0000", email: "mariana.alves@empresa.com.br", website: "www.empresa.com.br" },
      { name: "Lucas Ribeiro", role: "Especialista de Produtos", address: "Rua Voluntários da Pátria, 3223 | São Geraldo\nPorto Alegre | RS | CEP 90230-011", phone: "(51) 98888-0000", email: "lucas.ribeiro@empresa.com.br", website: "www.empresa.com.br" }
    ];
    state.records = demo.map(recordFrom);
    state.activeId = state.records[0].id;
    save();
    showWorkspace();
  }

  function init() {
    $("brandName").textContent = brand.name;
    $("brandDot").textContent = brand.shortName || brand.name.slice(0, 3).toUpperCase();
    $("miniBrand").textContent = brand.shortName || brand.name.slice(0, 3).toUpperCase();
    $("logoVariantField").hidden = template.style !== "fg";
    $("spreadsheetFile").addEventListener("change", function () { handleFile(this.files[0]); this.value = ""; });
    $("replaceFile").addEventListener("click", function () { $("spreadsheetFile").click(); });
    $("startManual").addEventListener("click", addManual);
    $("addRecord").addEventListener("click", addManual);
    $("deleteSelected").addEventListener("click", deleteSelected);
    $("backToWorkspace").addEventListener("click", function () { goToStep("edit"); });
    $("cancelReturnToImport").addEventListener("click", closeReturnToImportModal);
    $("cancelReturnToImportIcon").addEventListener("click", closeReturnToImportModal);
    $("confirmReturnToImport").addEventListener("click", confirmReturnToImport);
    $("returnToImportModal").addEventListener("click", function (ev) { if (ev.target === this) closeReturnToImportModal(); });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && !$("returnToImportModal").hidden) closeReturnToImportModal();
    });
    document.querySelectorAll(".bc-flow-step").forEach(function (el) {
      el.addEventListener("click", function () { goToStep(el.getAttribute("data-step")); });
      el.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          goToStep(el.getAttribute("data-step"));
        }
      });
    });
    Object.keys(fields).forEach(function (key) { fields[key].addEventListener("input", fieldChanged); });
    $("reviewCurrent").addEventListener("click", function () { var r = current(); if (r) reviewRecord(r); });
    $("approveCurrent").addEventListener("change", function () {
      var r = current();
      if (!r) return;
      if (this.checked && (!r.reviewed || hasBlocking(r))) {
        this.checked = false;
        return;
      }
      r.approved = this.checked;
      state.currentStep = this.checked ? "export" : "review";
      save();
      renderRecords();
      renderStats();
      updateFlow();
    });
    $("selectAll").addEventListener("change", function () {
      var value = this.checked;
      state.records.forEach(function (r) { r.selected = value; });
      save();
      renderRecords();
      renderStats();
    });
    $("exportCurrent").addEventListener("click", function () { var r = current(); exportPdf(r ? [r] : [], "individual"); });
    $("exportSelected").addEventListener("click", function () { exportPdf(state.records.filter(function (r) { return r.selected; }), "selecionados"); });
    $("exportAll").addEventListener("click", function () { exportPdf(state.records, "lote-completo"); });
    load();
    if (!state.records.length) renderCanvas(null);
    else renderAll();
  }

  window.BusinessCardGenerator = {
    loadDemo: loadDemo,
    importRows: importRows,
    exportPdf: exportPdf,
    createPdf: cardPdfDoc,
    buildVCard: contactVCard,
    formatPhone: formatPhone,
    validatePhone: validatePhone,
    deleteRecord: deleteRecord,
    deleteSelected: deleteSelected,
    goToStep: goToStep,
    getState: function () { return state; }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
