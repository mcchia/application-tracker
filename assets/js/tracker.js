(function () {
  "use strict";

  var STORAGE_KEY = "applicationTracker.v1";

  var TRACKS = [
    "Strategy / Advisory",
    "Market Intelligence / Research",
    "Risk Intelligence / FinTech",
    "Technology Analyst",
    "Business Analyst",
    "Product Strategy / Product Ops",
    "Backup / Income Protection",
    "Other"
  ];

  var RESUME_VERSIONS = [
    "Market Intelligence Resume",
    "Strategy / Business Analyst Resume",
    "Risk Intelligence / Technology Resume",
    "Product / Delivery Resume",
    "Custom"
  ];

  var STATUSES = [
    "To Apply",
    "Applied",
    "Intro Call",
    "Recruiter Screen",
    "Interview",
    "Case / Assessment",
    "Final Round",
    "Offer",
    "Rejected",
    "Withdrawn",
    "On Hold"
  ];

  var ACTIVE_PIPELINE_STATUSES = [
    "Applied", "Intro Call", "Recruiter Screen", "Interview",
    "Case / Assessment", "Final Round", "On Hold"
  ];

  var INTERVIEW_STAGE_STATUSES = [
    "Intro Call", "Recruiter Screen", "Interview", "Case / Assessment", "Final Round"
  ];

  var CLOSED_STATUSES = ["Rejected", "Withdrawn", "Offer"];

  // ---------------------------------------------------------------
  // State
  // ---------------------------------------------------------------
  var applications = loadData();
  var filters = { search: "", status: "all", track: "all", resume: "all", priority: "all" };
  var sortState = { field: "appliedDate", dir: "desc" };
  var openDetailIds = {};

  // ---------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------
  function loadData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("Failed to load application data", e);
      return [];
    }
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(applications));
    } catch (e) {
      alert("Could not save data to local storage. Your browser storage may be full or disabled.");
    }
  }

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------
  function uid() {
    return "app_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(str) {
    if (str === undefined || str === null) return "";
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function safeUrl(u) {
    if (!u) return null;
    try {
      var parsed = new URL(u, window.location.href);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
    } catch (e) {}
    return null;
  }

  function getPriority(score) {
    var n = Number(score) || 0;
    if (n >= 8) return "High";
    if (n >= 6) return "Medium";
    return "Low";
  }

  function todayStr() {
    var d = new Date();
    var local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function addDaysStr(offsetDays) {
    var d = new Date();
    d.setDate(d.getDate() + offsetDays);
    var local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function fillSelect(el, options, placeholder) {
    el.innerHTML = "";
    if (placeholder) el.appendChild(new Option(placeholder.label, placeholder.value));
    options.forEach(function (o) { el.appendChild(new Option(o, o)); });
  }

  // ---------------------------------------------------------------
  // Populate static dropdowns
  // ---------------------------------------------------------------
  fillSelect(document.getElementById("f-track"), TRACKS);
  fillSelect(document.getElementById("f-resume"), RESUME_VERSIONS);
  fillSelect(document.getElementById("f-status"), STATUSES);
  fillSelect(document.getElementById("e-track"), TRACKS);
  fillSelect(document.getElementById("e-resume"), RESUME_VERSIONS);
  fillSelect(document.getElementById("e-status"), STATUSES);

  fillSelect(document.getElementById("filter-status"), STATUSES, { label: "All Statuses", value: "all" });
  fillSelect(document.getElementById("filter-track"), TRACKS, { label: "All Tracks", value: "all" });
  fillSelect(document.getElementById("filter-resume"), RESUME_VERSIONS, { label: "All Resume Versions", value: "all" });

  // ---------------------------------------------------------------
  // Rendering: dashboard
  // ---------------------------------------------------------------
  function renderMetrics() {
    var total = applications.length;
    var toApply = applications.filter(function (a) { return a.status === "To Apply"; }).length;
    var activePipeline = applications.filter(function (a) { return ACTIVE_PIPELINE_STATUSES.indexOf(a.status) !== -1; }).length;
    var interviews = applications.filter(function (a) { return INTERVIEW_STAGE_STATUSES.indexOf(a.status) !== -1; }).length;
    var offers = applications.filter(function (a) { return a.status === "Offer"; }).length;
    var rejections = applications.filter(function (a) { return a.status === "Rejected"; }).length;
    var avgFit = total ? (applications.reduce(function (s, a) { return s + (Number(a.fitScore) || 0); }, 0) / total).toFixed(1) : "–";

    var cards = [
      { label: "Total Applications", value: total, cls: "" },
      { label: "To Apply", value: toApply, cls: "" },
      { label: "Active Pipeline", value: activePipeline, cls: "accent" },
      { label: "Interviews", value: interviews, cls: "accent" },
      { label: "Offers", value: offers, cls: "success" },
      { label: "Rejections", value: rejections, cls: "danger" },
      { label: "Average Fit Score", value: avgFit, cls: "warn" }
    ];

    document.getElementById("metrics").innerHTML = cards.map(function (c) {
      return '<div class="metric-card ' + c.cls + '">' +
        '<div class="metric-value">' + escapeHtml(c.value) + '</div>' +
        '<div class="metric-label">' + escapeHtml(c.label) + '</div>' +
        '</div>';
    }).join("");
  }

  // ---------------------------------------------------------------
  // Rendering: follow-ups due
  // ---------------------------------------------------------------
  function renderFollowUps() {
    var today = todayStr();
    var due = applications.filter(function (a) {
      return a.followUpDate && a.followUpDate <= today && CLOSED_STATUSES.indexOf(a.status) === -1;
    }).sort(function (a, b) { return a.followUpDate < b.followUpDate ? -1 : 1; });

    var container = document.getElementById("followup-list");
    if (!due.length) {
      container.innerHTML = '<div class="empty-note">No follow-ups due right now.</div>';
      return;
    }

    container.innerHTML = due.map(function (a) {
      var isOverdue = a.followUpDate < today;
      var tag = isOverdue
        ? '<span class="followup-overdue">Overdue — ' + escapeHtml(a.followUpDate) + '</span>'
        : '<span class="followup-today">Due today</span>';
      return '<div class="followup-item">' +
        '<div class="fi-main">' +
          '<span class="fi-company">' + escapeHtml(a.company) + '</span>' +
          '<span class="fi-role">' + escapeHtml(a.role) + '</span>' +
          '<span class="badge badge-' + getPriority(a.fitScore).toLowerCase() + '"><span class="badge-dot"></span>' + getPriority(a.fitScore) + '</span>' +
        '</div>' +
        tag +
        '</div>';
    }).join("");
  }

  // ---------------------------------------------------------------
  // Filtering + sorting
  // ---------------------------------------------------------------
  function getFilteredSorted() {
    var list = applications.slice();
    var s = filters.search.trim().toLowerCase();

    if (s) {
      list = list.filter(function (a) {
        return (a.company || "").toLowerCase().indexOf(s) !== -1 ||
          (a.role || "").toLowerCase().indexOf(s) !== -1;
      });
    }
    if (filters.status !== "all") list = list.filter(function (a) { return a.status === filters.status; });
    if (filters.track !== "all") list = list.filter(function (a) { return a.track === filters.track; });
    if (filters.resume !== "all") list = list.filter(function (a) { return a.resumeVersion === filters.resume; });
    if (filters.priority !== "all") list = list.filter(function (a) { return getPriority(a.fitScore) === filters.priority; });

    var field = sortState.field;
    var dir = sortState.dir === "asc" ? 1 : -1;

    list.sort(function (a, b) {
      var va, vb;
      if (field === "fitScore") { va = Number(a.fitScore) || 0; vb = Number(b.fitScore) || 0; }
      else if (field === "priority") { va = getPriority(a.fitScore); vb = getPriority(b.fitScore); }
      else { va = (a[field] || "").toString().toLowerCase(); vb = (b[field] || "").toString().toLowerCase(); }

      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    return list;
  }

  // ---------------------------------------------------------------
  // Rendering: table
  // ---------------------------------------------------------------
  function renderTable() {
    var list = getFilteredSorted();
    var tbody = document.getElementById("apps-tbody");
    var emptyNote = document.getElementById("apps-empty");

    document.getElementById("filter-summary").textContent =
      list.length + " of " + applications.length + " application" + (applications.length === 1 ? "" : "s");

    if (!list.length) {
      tbody.innerHTML = "";
      emptyNote.classList.remove("hidden");
      return;
    }
    emptyNote.classList.add("hidden");

    tbody.innerHTML = list.map(function (a) {
      var priority = getPriority(a.fitScore);
      var statusOptions = STATUSES.map(function (s) {
        return '<option value="' + escapeHtml(s) + '"' + (s === a.status ? " selected" : "") + '>' + escapeHtml(s) + '</option>';
      }).join("");

      var url = safeUrl(a.jobLink);
      var jobLinkHtml = url
        ? '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">Open job posting ↗</a>'
        : (a.jobLink ? escapeHtml(a.jobLink) + ' (invalid link)' : "—");

      var isOpen = !!openDetailIds[a.id];

      return (
        '<tr data-row-for="' + a.id + '">' +
          '<td data-label="Company"><span class="company-cell">' + escapeHtml(a.company) + '</span></td>' +
          '<td data-label="Role" class="role-cell">' + escapeHtml(a.role) + '</td>' +
          '<td data-label="Track">' + escapeHtml(a.track || "—") + '</td>' +
          '<td data-label="Status"><select class="status-select" data-id="' + a.id + '">' + statusOptions + '</select></td>' +
          '<td data-label="Fit Score">' + escapeHtml(a.fitScore != null ? a.fitScore : "—") + '</td>' +
          '<td data-label="Priority"><span class="badge badge-' + priority.toLowerCase() + '"><span class="badge-dot"></span>' + priority + '</span></td>' +
          '<td data-label="Applied Date">' + escapeHtml(a.appliedDate || "—") + '</td>' +
          '<td data-label="Follow-up Date">' + escapeHtml(a.followUpDate || "—") + '</td>' +
          '<td data-label="Resume Used">' + escapeHtml(a.resumeVersion || "—") + '</td>' +
          '<td data-label="Actions">' +
            '<div class="row-actions">' +
              '<button class="btn btn-sm btn-ghost toggle-details" data-id="' + a.id + '">' + (isOpen ? "Hide" : "Details") + '</button>' +
              '<button class="btn btn-sm edit-btn" data-id="' + a.id + '">Edit</button>' +
              '<button class="btn btn-sm btn-danger delete-btn" data-id="' + a.id + '">Delete</button>' +
            '</div>' +
          '</td>' +
        '</tr>' +
        '<tr class="detail-row' + (isOpen ? "" : " hidden") + '" data-detail-for="' + a.id + '">' +
          '<td colspan="10">' +
            '<div class="detail-grid">' +
              '<div class="dg-item"><div class="dg-label">Salary Estimate</div><div class="dg-value">' + escapeHtml(a.salaryEstimate || "—") + '</div></div>' +
              '<div class="dg-item"><div class="dg-label">Contact Person</div><div class="dg-value">' + escapeHtml(a.contactPerson || "—") + '</div></div>' +
              '<div class="dg-item"><div class="dg-label">Job Link</div><div class="dg-value">' + jobLinkHtml + '</div></div>' +
              '<div class="dg-item" style="grid-column: 1 / -1;"><div class="dg-label">Notes</div><div class="dg-value notes">' + escapeHtml(a.notes || "—") + '</div></div>' +
            '</div>' +
          '</td>' +
        '</tr>'
      );
    }).join("");
  }

  function renderAll() {
    renderMetrics();
    renderFollowUps();
    renderTable();
  }

  // ---------------------------------------------------------------
  // Add form
  // ---------------------------------------------------------------
  var addForm = document.getElementById("add-form");
  addForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var company = document.getElementById("f-company").value.trim();
    var role = document.getElementById("f-role").value.trim();
    var fitScore = Number(document.getElementById("f-fitscore").value);

    if (!company || !role) {
      alert("Company and Role Title are required.");
      return;
    }
    if (!fitScore || fitScore < 1 || fitScore > 10) {
      alert("Fit Score must be between 1 and 10.");
      return;
    }

    var app = {
      id: uid(),
      company: company,
      role: role,
      jobLink: document.getElementById("f-joblink").value.trim(),
      track: document.getElementById("f-track").value,
      resumeVersion: document.getElementById("f-resume").value,
      fitScore: fitScore,
      salaryEstimate: document.getElementById("f-salary").value.trim(),
      status: document.getElementById("f-status").value,
      appliedDate: document.getElementById("f-applied").value,
      followUpDate: document.getElementById("f-followup").value,
      contactPerson: document.getElementById("f-contact").value.trim(),
      notes: document.getElementById("f-notes").value.trim(),
      createdAt: new Date().toISOString()
    };

    applications.push(app);
    saveData();
    addForm.reset();
    document.getElementById("f-fitscore").value = 7;
    renderAll();
  });

  document.getElementById("add-form-reset").addEventListener("click", function () {
    addForm.reset();
    document.getElementById("f-fitscore").value = 7;
  });

  // ---------------------------------------------------------------
  // Filters + sort listeners
  // ---------------------------------------------------------------
  document.getElementById("filter-search").addEventListener("input", function (e) {
    filters.search = e.target.value;
    renderTable();
  });
  document.getElementById("filter-status").addEventListener("change", function (e) {
    filters.status = e.target.value;
    renderTable();
  });
  document.getElementById("filter-track").addEventListener("change", function (e) {
    filters.track = e.target.value;
    renderTable();
  });
  document.getElementById("filter-resume").addEventListener("change", function (e) {
    filters.resume = e.target.value;
    renderTable();
  });
  document.getElementById("filter-priority").addEventListener("change", function (e) {
    filters.priority = e.target.value;
    renderTable();
  });
  document.getElementById("sort-field").addEventListener("change", function (e) {
    sortState.field = e.target.value;
    renderTable();
  });
  document.getElementById("sort-dir").addEventListener("change", function (e) {
    sortState.dir = e.target.value;
    renderTable();
  });

  // Sortable column headers
  document.querySelectorAll("th[data-sort]").forEach(function (th) {
    th.addEventListener("click", function () {
      var field = th.getAttribute("data-sort");
      if (sortState.field === field) {
        sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
      } else {
        sortState.field = field;
        sortState.dir = "asc";
      }
      document.getElementById("sort-field").value = sortState.field;
      document.getElementById("sort-dir").value = sortState.dir;
      document.querySelectorAll("th[data-sort]").forEach(function (h) { h.classList.remove("sorted"); });
      th.classList.add("sorted");
      renderTable();
    });
  });

  // ---------------------------------------------------------------
  // Table row actions (event delegation)
  // ---------------------------------------------------------------
  document.getElementById("apps-tbody").addEventListener("click", function (e) {
    var toggleBtn = e.target.closest(".toggle-details");
    var editBtn = e.target.closest(".edit-btn");
    var deleteBtn = e.target.closest(".delete-btn");

    if (toggleBtn) {
      var id = toggleBtn.getAttribute("data-id");
      openDetailIds[id] = !openDetailIds[id];
      renderTable();
    } else if (editBtn) {
      openEditModal(editBtn.getAttribute("data-id"));
    } else if (deleteBtn) {
      var delId = deleteBtn.getAttribute("data-id");
      var app = applications.find(function (a) { return a.id === delId; });
      if (app && confirm('Delete application for "' + app.company + ' — ' + app.role + '"? This cannot be undone.')) {
        applications = applications.filter(function (a) { return a.id !== delId; });
        saveData();
        renderAll();
      }
    }
  });

  document.getElementById("apps-tbody").addEventListener("change", function (e) {
    if (e.target.classList.contains("status-select")) {
      var id = e.target.getAttribute("data-id");
      var app = applications.find(function (a) { return a.id === id; });
      if (app) {
        app.status = e.target.value;
        saveData();
        renderAll();
      }
    }
  });

  // ---------------------------------------------------------------
  // Edit modal
  // ---------------------------------------------------------------
  var editOverlay = document.getElementById("edit-modal-overlay");
  var editForm = document.getElementById("edit-form");

  function openEditModal(id) {
    var app = applications.find(function (a) { return a.id === id; });
    if (!app) return;
    document.getElementById("e-id").value = app.id;
    document.getElementById("e-company").value = app.company || "";
    document.getElementById("e-role").value = app.role || "";
    document.getElementById("e-track").value = app.track || TRACKS[0];
    document.getElementById("e-resume").value = app.resumeVersion || RESUME_VERSIONS[0];
    document.getElementById("e-status").value = app.status || STATUSES[0];
    document.getElementById("e-fitscore").value = app.fitScore || 7;
    document.getElementById("e-applied").value = app.appliedDate || "";
    document.getElementById("e-followup").value = app.followUpDate || "";
    document.getElementById("e-joblink").value = app.jobLink || "";
    document.getElementById("e-salary").value = app.salaryEstimate || "";
    document.getElementById("e-contact").value = app.contactPerson || "";
    document.getElementById("e-notes").value = app.notes || "";
    editOverlay.classList.remove("hidden");
  }

  function closeEditModal() {
    editOverlay.classList.add("hidden");
  }

  document.getElementById("edit-modal-close").addEventListener("click", closeEditModal);
  document.getElementById("edit-form-cancel").addEventListener("click", closeEditModal);
  editOverlay.addEventListener("click", function (e) {
    if (e.target === editOverlay) closeEditModal();
  });

  editForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var id = document.getElementById("e-id").value;
    var app = applications.find(function (a) { return a.id === id; });
    if (!app) return;

    var company = document.getElementById("e-company").value.trim();
    var role = document.getElementById("e-role").value.trim();
    var fitScore = Number(document.getElementById("e-fitscore").value);

    if (!company || !role) {
      alert("Company and Role Title are required.");
      return;
    }
    if (!fitScore || fitScore < 1 || fitScore > 10) {
      alert("Fit Score must be between 1 and 10.");
      return;
    }

    app.company = company;
    app.role = role;
    app.track = document.getElementById("e-track").value;
    app.resumeVersion = document.getElementById("e-resume").value;
    app.status = document.getElementById("e-status").value;
    app.fitScore = fitScore;
    app.appliedDate = document.getElementById("e-applied").value;
    app.followUpDate = document.getElementById("e-followup").value;
    app.jobLink = document.getElementById("e-joblink").value.trim();
    app.salaryEstimate = document.getElementById("e-salary").value.trim();
    app.contactPerson = document.getElementById("e-contact").value.trim();
    app.notes = document.getElementById("e-notes").value.trim();
    app.updatedAt = new Date().toISOString();

    saveData();
    closeEditModal();
    renderAll();
  });

  // ---------------------------------------------------------------
  // CSV / JSON export
  // ---------------------------------------------------------------
  function escapeCsvValue(v) {
    var s = (v === undefined || v === null) ? "" : String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCSV(list) {
    var headers = [
      "Company", "Role Title", "Job Link", "Track", "Resume Version",
      "Fit Score", "Priority", "Salary Estimate", "Status",
      "Applied Date", "Follow-up Date", "Contact Person", "Notes"
    ];
    var rows = list.map(function (a) {
      return [
        a.company, a.role, a.jobLink, a.track, a.resumeVersion,
        a.fitScore, getPriority(a.fitScore), a.salaryEstimate, a.status,
        a.appliedDate, a.followUpDate, a.contactPerson, a.notes
      ];
    });
    return [headers].concat(rows).map(function (r) {
      return r.map(escapeCsvValue).join(",");
    }).join("\r\n");
  }

  function downloadFile(filename, content, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  document.getElementById("btn-export-csv").addEventListener("click", function () {
    if (!applications.length) { alert("No applications to export."); return; }
    downloadFile("applications.csv", toCSV(applications), "text/csv;charset=utf-8;");
  });

  document.getElementById("btn-export-json").addEventListener("click", function () {
    if (!applications.length) { alert("No applications to export."); return; }
    downloadFile("applications.json", JSON.stringify(applications, null, 2), "application/json;charset=utf-8;");
  });

  // ---------------------------------------------------------------
  // Import JSON
  // ---------------------------------------------------------------
  function sanitizeImportedApp(raw) {
    if (!raw || typeof raw !== "object") return null;
    var company = (raw.company || "").toString().trim();
    var role = (raw.role || "").toString().trim();
    if (!company || !role) return null;

    var fitScore = Number(raw.fitScore);
    if (!fitScore || fitScore < 1) fitScore = 1;
    if (fitScore > 10) fitScore = 10;
    fitScore = Math.round(fitScore);

    return {
      id: uid(),
      company: company,
      role: role,
      jobLink: (raw.jobLink || "").toString().trim(),
      track: TRACKS.indexOf(raw.track) !== -1 ? raw.track : "Other",
      resumeVersion: RESUME_VERSIONS.indexOf(raw.resumeVersion) !== -1 ? raw.resumeVersion : "Custom",
      fitScore: fitScore,
      salaryEstimate: (raw.salaryEstimate || "").toString().trim(),
      status: STATUSES.indexOf(raw.status) !== -1 ? raw.status : "To Apply",
      appliedDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.appliedDate) ? raw.appliedDate : "",
      followUpDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.followUpDate) ? raw.followUpDate : "",
      contactPerson: (raw.contactPerson || "").toString().trim(),
      notes: (raw.notes || "").toString().trim(),
      createdAt: new Date().toISOString()
    };
  }

  var importBtn = document.getElementById("btn-import-json");
  var importInput = document.getElementById("import-file-input");

  importBtn.addEventListener("click", function () { importInput.click(); });

  importInput.addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch (err) {
        alert("That file isn't valid JSON.");
        importInput.value = "";
        return;
      }
      if (!Array.isArray(parsed)) {
        alert("Expected a JSON array of applications.");
        importInput.value = "";
        return;
      }
      var cleaned = parsed.map(sanitizeImportedApp).filter(Boolean);
      if (!cleaned.length) {
        alert("No valid applications found in that file (each entry needs at least a company and role).");
        importInput.value = "";
        return;
      }
      var skipped = parsed.length - cleaned.length;
      var msg = "Import " + cleaned.length + " application" + (cleaned.length === 1 ? "" : "s") +
        (skipped ? " (" + skipped + " skipped as invalid)" : "") +
        " and add to your current list?";
      if (confirm(msg)) {
        applications = applications.concat(cleaned);
        saveData();
        renderAll();
      }
      importInput.value = "";
    };
    reader.readAsText(file);
  });

  // ---------------------------------------------------------------
  // Clear all / demo data
  // ---------------------------------------------------------------
  document.getElementById("btn-clear-all").addEventListener("click", function () {
    if (!applications.length) { alert("There's no data to clear."); return; }
    if (confirm("This will permanently delete all applications stored in this browser. This cannot be undone. Continue?")) {
      applications = [];
      saveData();
      renderAll();
    }
  });

  function buildDemoData() {
    var demo = [
      { company: "Northbridge Strategy Partners", role: "Strategy Analyst", track: "Strategy / Advisory", resumeVersion: "Strategy / Business Analyst Resume", fitScore: 9, status: "Applied", appliedOffset: -10, followUpOffset: -2, salaryEstimate: "$85k–$95k", contactPerson: "Jane Ho (Recruiter)", notes: "Referred by a former colleague.", jobLink: "https://example.com/jobs/strategy-analyst" },
      { company: "Vantage Market Intelligence", role: "Research Analyst", track: "Market Intelligence / Research", resumeVersion: "Market Intelligence Resume", fitScore: 8, status: "Interview", appliedOffset: -14, followUpOffset: 0, salaryEstimate: "$90k+", contactPerson: "", notes: "", jobLink: "" },
      { company: "Sable Risk Analytics", role: "Risk Intelligence Analyst", track: "Risk Intelligence / FinTech", resumeVersion: "Risk Intelligence / Technology Resume", fitScore: 8, status: "Recruiter Screen", appliedOffset: -6, followUpOffset: 3, salaryEstimate: "", contactPerson: "Marcus Lee", notes: "Screening call scheduled.", jobLink: "" },
      { company: "Ironclad Consulting", role: "Associate Consultant", track: "Strategy / Advisory", resumeVersion: "Strategy / Business Analyst Resume", fitScore: 7, status: "To Apply", appliedOffset: null, followUpOffset: null, salaryEstimate: "", contactPerson: "", notes: "Application closes soon.", jobLink: "" },
      { company: "Delta Cyber Holdings", role: "Technology Analyst", track: "Technology Analyst", resumeVersion: "Risk Intelligence / Technology Resume", fitScore: 6, status: "Applied", appliedOffset: -20, followUpOffset: -5, salaryEstimate: "$80k", contactPerson: "", notes: "", jobLink: "" },
      { company: "Horizon Business Advisory", role: "Business Advisory Associate", track: "Strategy / Advisory", resumeVersion: "Strategy / Business Analyst Resume", fitScore: 9, status: "Final Round", appliedOffset: -25, followUpOffset: 1, salaryEstimate: "$95k–$105k", contactPerson: "Priya Nair", notes: "Case study due before final round.", jobLink: "" },
      { company: "Bright Path Product Co", role: "Product Ops Associate", track: "Product Strategy / Product Ops", resumeVersion: "Product / Delivery Resume", fitScore: 4, status: "Rejected", appliedOffset: -40, followUpOffset: null, salaryEstimate: "", contactPerson: "", notes: "Backup option, not a strong fit.", jobLink: "" },
      { company: "Aurora Ventures", role: "Market Intelligence Analyst", track: "Market Intelligence / Research", resumeVersion: "Market Intelligence Resume", fitScore: 10, status: "Offer", appliedOffset: -30, followUpOffset: null, salaryEstimate: "$100k+", contactPerson: "Dana Reyes", notes: "Awaiting formal offer letter.", jobLink: "" }
    ];

    return demo.map(function (d) {
      return {
        id: uid(),
        company: d.company,
        role: d.role,
        jobLink: d.jobLink,
        track: d.track,
        resumeVersion: d.resumeVersion,
        fitScore: d.fitScore,
        salaryEstimate: d.salaryEstimate,
        status: d.status,
        appliedDate: d.appliedOffset === null ? "" : addDaysStr(d.appliedOffset),
        followUpDate: d.followUpOffset === null ? "" : addDaysStr(d.followUpOffset),
        contactPerson: d.contactPerson,
        notes: d.notes,
        createdAt: new Date().toISOString()
      };
    });
  }

  document.getElementById("btn-load-demo").addEventListener("click", function () {
    if (confirm("Add sample demo applications to explore the tracker? You can remove them anytime with Clear All Data.")) {
      applications = applications.concat(buildDemoData());
      saveData();
      renderAll();
    }
  });

  // ---------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------
  renderAll();
})();
