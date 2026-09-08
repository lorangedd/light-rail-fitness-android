/* 修改时间：2026-08-20 16:00:02 +08:00；目的：迁移完整离线交互，并为动态表单补齐可访问名称以改善 Android 辅助操作。 */
(function () {
  "use strict";
  const Store = window.FitnessStore;
  const Catalog = window.FitnessCatalog;
  const MediaVault = window.FitnessMediaVault;
  const app = document.getElementById("app");
  const title = document.getElementById("page-title");
  const toast = document.getElementById("toast");
  const dialog = document.getElementById("confirm-dialog");
  // 修改时间：2026-09-08 11:45:00 +08:00；目的：使页面显示版本与 Android 版本号和远程清单一致，避免应用把自身误判为可更新版本。
  // 修改时间：2026-09-08 18:45:00 +08:00；目的：修正知识搜索连续输入时的焦点保持，避免覆盖已安装包。
  // 修改时间：2026-09-08 19:20:00 +08:00；目的：标记本次页面布局、复盘字段和记录页交互更新版本。
  const APP_VERSION = "1.0.14";
  const APP_VERSION_CODE = 15;
  // 修改时间：2026-09-08 10:20:00 +08:00；目的：固定唯一版本清单地址，禁止由页面数据或用户输入改变更新检查目标。
  const UPDATE_MANIFEST_URL = "https://raw.githubusercontent.com/lorangedd/light-rail-fitness-android/main/version.json";
  const TRUSTED_RELEASE_PREFIX = "https://github.com/lorangedd/light-rail-fitness-android/releases/download/";
  const state = {
    route: "today",
    subroute: "menu",
    selectedDate: Store.dateString(),
    editingWorkout: "",
    editingOkr: "",
    editingReview: "",
    editingKnowledge: "",
    reviewCycle: "week",
    expandedRecordId: "",
    expandedReviewId: "",
    expandedKnowledgeId: "",
    knowledgeSearch: "",
    workoutMediaOwner: "",
    workoutMediaDraft: [],
    workoutNewMediaKeys: [],
    updateState: { status: "idle", manifest: null, message: "" }
  };
  const activeMediaUrls = new Set();
  // 修改时间：2026-09-08 16:40:00 +08:00；目的：记录月历滑动起点，支持记录页左滑上月、右滑下月。
  let recordTouchStart = null;
  // 修改时间：2026-09-08 18:20:00 +08:00；目的：支持主页面之间左右滑动切换，同时避开表单输入和月历手势。
  let pageTouchStart = null;
  // 修改时间：2026-09-08 09:35:00 +08:00；目的：拆分知识库与设置路由，使迁移、版本和安全功能不再出现在知识页。
  const routeTitles = { today: "目标", workout: "新增训练", records: "训练记录", review: "复盘", knowledge: "知识", settings: "设置" };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function num(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && value !== "" ? parsed : null;
  }

  function parseDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function rangeOf(type, source = new Date()) {
    if (type === "week") {
      const day = source.getDay() || 7;
      const start = new Date(source.getFullYear(), source.getMonth(), source.getDate() - day + 1);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      return { start: Store.dateString(start), end: Store.dateString(end) };
    }
    if (type === "month") {
      return { start: Store.dateString(new Date(source.getFullYear(), source.getMonth(), 1)), end: Store.dateString(new Date(source.getFullYear(), source.getMonth() + 1, 0)) };
    }
    return { start: `${source.getFullYear()}-01-01`, end: `${source.getFullYear()}-12-31` };
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1900);
  }

  // 修改时间：2026-09-08 10:20:00 +08:00；目的：校验远程版本清单的最小字段、包名与可信下载地址，避免更新入口被重定向到其他应用或站点。
  function validateUpdateManifest(value) {
    if (!value || value.schema !== 1 || value.packageName !== "cn.lightrail.fitnessokr") throw new Error("版本清单不属于轻铁训练");
    if (!Number.isSafeInteger(value.versionCode) || value.versionCode < 1 || typeof value.versionName !== "string" || value.versionName.length > 32) throw new Error("版本号格式无效");
    if (typeof value.sha256 !== "string" || !/^[a-fA-F0-9]{64}$/.test(value.sha256)) throw new Error("APK 校验值无效");
    const apkUrl = new URL(value.apkUrl);
    if (apkUrl.href !== value.apkUrl || !apkUrl.href.startsWith(TRUSTED_RELEASE_PREFIX) || apkUrl.protocol !== "https:" || apkUrl.username || apkUrl.password || apkUrl.port || apkUrl.search || apkUrl.hash || !apkUrl.pathname.endsWith(".apk")) throw new Error("下载链接不在可信发布页");
    return { ...value, sha256: value.sha256.toUpperCase(), notes: String(value.notes || "暂无更新说明").slice(0, 600) };
  }

  // 修改时间：2026-09-08 10:20:00 +08:00；目的：仅在用户点击后读取固定 HTTPS 清单，设置短超时并拒绝重定向和异常响应。
  async function checkForUpdate() {
    if (state.updateState.status === "checking") return;
    state.updateState = { status: "checking", manifest: null, message: "正在核对官方版本…" };
    render();
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(UPDATE_MANIFEST_URL, { method: "GET", cache: "no-store", redirect: "error", signal: controller.signal });
      if (!response.ok) throw new Error("版本服务暂不可用");
      const manifest = validateUpdateManifest(await response.json());
      state.updateState = manifest.versionCode > APP_VERSION_CODE
        ? { status: "available", manifest, message: "发现可用更新" }
        : { status: "current", manifest, message: "已是最新版本" };
    } catch (error) {
      state.updateState = { status: "error", manifest: null, message: error.name === "AbortError" ? "检查超时，请稍后重试" : "无法验证更新信息" };
    } finally {
      window.clearTimeout(timer);
      render();
    }
  }

  // 修改时间：2026-09-08 10:20:00 +08:00；目的：由原生受限插件把已校验的 Release APK 交给系统浏览器，不在应用内下载或静默安装。
  async function openVerifiedUpdateDownload() {
    const manifest = state.updateState.manifest;
    if (!manifest || state.updateState.status !== "available") return;
    try {
      const launcher = window.Capacitor?.Plugins?.UpdateLauncher;
      if (!launcher?.openRelease) throw new Error("当前环境不支持系统下载页");
      await launcher.openRelease({ url: manifest.apkUrl });
      showToast("已打开官方发布页，请在系统下载完成后确认安装");
    } catch (_) {
      showToast("无法打开官方发布页，请稍后重试");
    }
  }

  function confirmAction(options) {
    document.getElementById("confirm-title").textContent = options.title;
    document.getElementById("confirm-message").textContent = options.message;
    dialog.returnValue = "";
    dialog.showModal();
    dialog.addEventListener("close", () => {
      if (dialog.returnValue === "confirm") options.onConfirm();
    }, { once: true });
  }

  function navigate(route, subroute = "menu") {
    state.route = route;
    state.subroute = subroute;
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.route === route));
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function render() {
    activeMediaUrls.forEach((url) => URL.revokeObjectURL(url));
    activeMediaUrls.clear();
    // 修改时间：2026-09-08 09:35:00 +08:00；目的：为设置内的目标管理和数据与安全子页显示准确标题，知识页始终保持知识库语义。
    title.textContent = state.route === "settings" && state.subroute !== "menu" ? ({ okr: "目标管理", "okr-history": "历史目标", backup: "数据与安全" }[state.subroute]) : routeTitles[state.route];
    if (state.route === "today") app.innerHTML = renderToday();
    if (state.route === "workout") app.innerHTML = renderWorkout();
    if (state.route === "records") app.innerHTML = renderRecords();
    if (state.route === "review") app.innerHTML = renderReview();
    if (state.route === "knowledge") app.innerHTML = renderKnowledge();
    if (state.route === "settings") app.innerHTML = renderSettings();
    window.requestAnimationFrame(hydrateMediaElements);
  }

  // 修改时间：2026-09-07 19:35:00 +08:00；目的：从 IndexedDB 按需读取 Blob 并生成页面级临时地址，避免把大照片或视频编码进页面数据和 JSON。
  async function hydrateMediaElements() {
    const elements = Array.from(app.querySelectorAll("[data-media-key]"));
    await Promise.all(elements.map(async (container) => {
      const key = container.dataset.mediaKey;
      if (!key) return;
      try {
        const entry = await MediaVault.getFile(key);
        if (!entry || !entry.blob) throw new Error("媒体文件不存在");
        const url = URL.createObjectURL(entry.blob);
        activeMediaUrls.add(url);
        const node = document.createElement(container.dataset.mediaType === "video" ? "video" : "img");
        node.src = url;
        node.className = "media-preview";
        if (node.tagName === "VIDEO") { node.controls = true; node.preload = "metadata"; }
        node.alt = entry.name || "训练附件";
        container.querySelector(".media-loading")?.replaceWith(node);
      } catch (_) {
        const loading = container.querySelector(".media-loading");
        if (loading) loading.className = "media-missing";
        if (loading) loading.textContent = "本地附件不可用，请重新选择原文件";
      }
    }));
  }

  // 修改时间：2026-09-07 18:05:00 +08:00；目的：将 Android 首页改为与小程序一致的周、月、年度目标分区及统计卡片。
  function renderToday() {
    const store = Store.get();
    const today = Store.dateString();
    const week = rangeOf("week");
    const month = rangeOf("month");
    const year = rangeOf("year");
    const weekMetrics = Store.metrics(week.start, week.end);
    const monthMetrics = Store.metrics(month.start, month.end);
    const active = (cycle, range) => store.okrs.filter((item) => item.status === "active" && item.cycle_type === cycle && item.start_date <= range.end && item.end_date >= range.start);
    // 修改时间：2026-09-08 09:35:00 +08:00；目的：将目标管理入口纳入设置页，避免使用已拆分的旧知识聚合页。
    // 修改时间：2026-09-08 19:10:00 +08:00；目的：移除首页“管理目标”按钮，改为点击目标标题或统计卡片进入目标管理。
    const goalBlock = (label, cycle, metrics, goals, accent) => `<section class="card goal-section ${accent}"><button class="goal-heading goal-heading-link" data-nav="settings" data-subroute="okr"><p class="eyebrow">${label}</p><span class="goal-entry" aria-hidden="true">›</span></button>${metrics ? `<div class="metric-grid ${metrics.length === 2 ? "two" : ""} tappable" data-nav="settings" data-subroute="okr">${metrics.map(([value, caption]) => `<div class="metric"><strong>${value}</strong><span>${caption}</span></div>`).join("")}</div>` : ""}${goals.length ? goals.map(renderGoalCard).join("") : `<div class="empty">还没有${label}</div>`}</section>`;
    return `<div class="stack">
      ${goalBlock("周目标", "week", [[weekMetrics.sessions, "本周训练"], [weekMetrics.totalSets, "总组数"]], active("week", week), "blue")}
      ${goalBlock("月度目标", "month", [[monthMetrics.sessions, "本月训练"], [monthMetrics.totalSets, "本月总组数"], [monthMetrics.averageLactate, "平均乳酸"]], active("month", month), "yellow")}
      ${goalBlock("年度目标", "year", null, active("year", year), "plain")}
      <div class="cheer">今天也加油 · 每一次记录都算数</div>
      <!-- 修改时间：2026-09-07 19:05:00 +08:00；目的：复用小程序首页的原始小女孩与小猫素材，放置在年度目标后的鼓励区域。 -->
      <section class="mascot-cheer" aria-label="今天也加油，小女孩和小猫为你鼓劲"><div class="mascot-bubble">今天也加油</div><img src="assets/personal-cheer-mascot.png" alt="举手加油的小女孩和小猫" /></section>
    </div>`;
  }

  function renderGoalCard(okr) {
    const lines = String(okr.objective || "").split(/[\n\r]+/).map((item) => item.trim()).filter(Boolean);
    return `<button class="goal-card" data-action="edit-okr" data-id="${escapeHtml(okr.id)}">${(lines.length ? lines : [okr.objective]).map((line, index) => `<span><b>${index + 1}.</b>${escapeHtml(line)}</span>`).join("")}<small>${escapeHtml(okr.start_date)} 至 ${escapeHtml(okr.end_date)}</small></button>`;
  }

  function renderOkrCompact(okr) {
    const results = (okr.key_results || []).slice(0, 2).map((kr) => {
      const current = Number(kr.current_value || 0);
      const target = Number(kr.target_value || 0);
      const progress = target ? Math.min(100, Math.round(current / target * 100)) : 0;
      return `<p>${escapeHtml(kr.title)} · ${current}/${target} ${escapeHtml(kr.unit || "")}<progress class="progress" max="100" value="${progress}">${progress}%</progress></p>`;
    }).join("");
    return `<div class="okr"><span class="tag">${okr.cycle_type === "week" ? "周" : okr.cycle_type === "month" ? "月度" : "年度"}</span><h3>${escapeHtml(okr.objective)}</h3>${results}</div>`;
  }

  function optionList(values, selected) {
    return values.map((value) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`).join("");
  }

  function renderWorkout() {
    const session = state.editingWorkout ? Store.get().sessions.find((item) => item.id === state.editingWorkout) : null;
    // 修改时间：2026-09-07 19:35:00 +08:00；目的：为新增和编辑训练分别维护媒体草稿，选择文件后先保存到本地媒体库而非等待表单提交。
    const mediaOwner = session?.id || "new-workout";
    if (state.workoutMediaOwner !== mediaOwner) {
      state.workoutMediaOwner = mediaOwner;
      state.workoutMediaDraft = (session?.media_items || []).slice(0, MediaVault.MAX_MEDIA_PER_RECORD);
      state.workoutNewMediaKeys = [];
    }
    const body = session?.body_part || "核心";
    const projects = Catalog.projectOptions[body] || ["未细分"];
    const project = session?.project_type || projects[0];
    const movements = Catalog.movementOptions[project] || [];
    const score = (name, value) => `<div class="score-row" data-score-name="${name}">${[1, 2, 3, 4, 5].map((item) => `<button type="button" class="score-btn${Number(value || 3) === item ? " selected" : ""}" data-score="${item}">${item}</button>`).join("")}</div><input type="hidden" name="${name}" value="${Number(value || 3)}">`;
    return `<form id="workout-form" class="stack">
      <section class="card">
        <div class="card-head"><div><p class="eyebrow">Training log</p><h2>${session ? "编辑训练记录" : "记录一次训练"}</h2></div>${session ? `<button type="button" class="btn ghost" data-action="cancel-workout">取消</button>` : ""}</div>
        <div class="form-grid">
          <div class="field"><label for="workout-date">训练日期</label><input id="workout-date" class="control" type="date" name="date" value="${escapeHtml(session?.date || Store.dateString())}" required></div>
          <div class="field"><label for="training-type">训练类型</label><select id="training-type" class="control" name="trainingType">${optionList(["无氧", "有氧", "拉伸", "筋膜"], session?.training_type || "无氧")}</select></div>
          <div class="field"><label for="body-part">训练部位</label><select id="body-part" class="control" name="bodyPart">${optionList(Catalog.bodyParts, body)}</select></div>
          <div class="field"><label for="project">项目</label><select id="project" class="control" name="projectType">${optionList(projects.concat("自定义"), projects.includes(project) ? project : "自定义")}</select></div>
          <div class="field full" id="custom-project-field"${projects.includes(project) ? " hidden" : ""}><label for="custom-project">自定义项目</label><input id="custom-project" class="control" name="customProject" maxlength="40" value="${projects.includes(project) ? "" : escapeHtml(project)}"></div>
          <div class="field full"><label for="movement">动作</label><select id="movement" class="control" name="movement">${optionList(movements.concat("自定义"), movements.includes(session?.movement) ? session.movement : "自定义")}</select></div>
          <div class="field full" id="custom-movement-field"${session?.movement && movements.includes(session.movement) ? " hidden" : ""}><label for="custom-movement">动作名称</label><input id="custom-movement" class="control" name="customMovement" maxlength="60" value="${session?.movement && !movements.includes(session.movement) ? escapeHtml(session.movement) : ""}" placeholder="例如：高脚杯深蹲"></div>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><div><p class="eyebrow">Load</p><h2>训练负荷</h2></div></div>
        <div class="form-grid">
          <div class="field"><label>重量（kg）</label><input aria-label="重量（kg）" class="control" type="number" min="0" max="1000" step="0.1" name="weight" value="${escapeHtml(session?.weight ?? "")}"></div>
          <div class="field"><label>组数</label><input aria-label="组数" class="control" type="number" min="0" max="999" name="groups" value="${escapeHtml(session?.groups ?? "")}"></div>
          <div class="field"><label>每组次数</label><input aria-label="每组次数" class="control" type="number" min="0" max="9999" name="reps" value="${escapeHtml(session?.reps ?? "")}"></div>
          <div class="field"><label>组间休息</label><select aria-label="组间休息" class="control" name="restSec">${Catalog.rests.map((value) => `<option value="${value}"${Number(session?.rest_sec || 60) === value ? " selected" : ""}>${value} 秒</option>`).join("")}</select></div>
        </div>
      </section>
      <section class="card">
        <div class="stack">
          <div class="field"><label>精力 · 1 低，5 高</label>${score("energy", session?.energy)}</div>
          <div class="field"><label>乳酸感 · 1 轻，5 强</label>${score("lactate", session?.lactate)}</div>
          <div class="field"><label>酸痛感 · 1 轻，5 强</label>${score("soreness", session?.soreness)}</div>
          <div class="field"><label>训练感受</label><textarea aria-label="训练感受" class="control" name="feelingNotes" maxlength="1000" placeholder="动作感知、代偿和完成质量">${escapeHtml(session?.feeling_notes || "")}</textarea></div>
          <div class="field"><label>恢复记录</label><textarea aria-label="恢复记录" class="control" name="recoveryNotes" maxlength="1000" placeholder="睡眠、拉伸和恢复安排">${escapeHtml(session?.recovery_notes || "")}</textarea></div>
        </div>
      </section>
      <section class="card media-section"><div class="card-head"><div><p class="eyebrow">照片 / 视频</p><h2>动作附件</h2><p>最多 3 个；文件只保存在本机。</p></div><button type="button" class="btn secondary" data-action="choose-workout-media">选择</button></div><input id="workout-media-input" class="visually-hidden" type="file" accept="image/*,video/*" multiple>${renderWorkoutMedia(state.workoutMediaDraft)}</section>
      <button class="btn full" type="submit">${session ? "更新训练" : "保存训练"}</button>
    </form>`;
  }

  // 修改时间：2026-09-07 19:35:00 +08:00；目的：渲染训练媒体的本地缩略卡，已迁移但缺少文件的旧微信路径会明确提示重新选择附件。
  function renderWorkoutMedia(items) {
    if (!items.length) return `<div class="empty media-empty">还没有选择照片或视频</div>`;
    return `<div class="media-grid">${items.map((item) => `<article class="media-item" data-media-key="${escapeHtml(item.storage_key || "")}" data-media-type="${escapeHtml(item.type || "image")}">${item.storage_key ? `<div class="media-loading">正在读取本地附件</div>` : `<div class="media-missing">${escapeHtml(item.migration_notice || "附件文件未随旧备份导出")}</div>`}<button type="button" class="media-remove" data-action="remove-workout-media" data-id="${escapeHtml(item.id || item.storage_key || "")}" aria-label="删除附件">×</button></article>`).join("")}</div>`;
  }

  function weekOfMonth(date) {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    return Math.ceil((date.getDate() + mondayOffset) / 7);
  }

  // 修改时间：2026-09-07 18:05:00 +08:00；目的：使用整月月历和训练部位标记复现小程序记录页，保留按选中日期所在行计算的月内周次。
  function renderRecords() {
    const store = Store.get();
    const selected = parseDate(state.selectedDate);
    const selectedSessions = store.sessions.filter((item) => item.date === state.selectedDate);
    const first = new Date(selected.getFullYear(), selected.getMonth(), 1);
    const lastDay = new Date(selected.getFullYear(), selected.getMonth() + 1, 0).getDate();
    const leading = (first.getDay() + 6) % 7;
    const periodDates = Array.isArray(store.period_dates) ? store.period_dates : [];
    const cells = Array.from({ length: leading + lastDay }, (_, index) => {
      if (index < leading) return `<div class="month-day blank"></div>`;
      const day = index - leading + 1;
      const date = Store.dateString(new Date(selected.getFullYear(), selected.getMonth(), day));
      const items = store.sessions.filter((item) => item.date === date);
      const tags = [...new Set(items.map((item) => item.body_part).filter(Boolean))].slice(0, 2);
      return `<button type="button" class="month-day${date === state.selectedDate ? " selected" : ""}${periodDates.includes(date) ? " period" : ""}" data-date="${date}"><b>${day}</b>${periodDates.includes(date) ? `<i class="period-dot" aria-label="生理期"></i>` : ""}${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</button>`;
    }).join("");
    return `<div class="stack">
      <section class="card calendar-card" data-record-calendar>
        <div class="calendar-head"><div><h2 class="section-title">${selected.getFullYear()}年${selected.getMonth() + 1}月 <small>第 ${weekOfMonth(selected)} 周</small></h2></div></div>
        <div class="month-grid">${["一", "二", "三", "四", "五", "六", "日"].map((item) => `<div class="weekday">${item}</div>`).join("")}${cells}</div>
      </section>
      <section class="card">
        <div class="card-head"><div><p class="eyebrow">${escapeHtml(state.selectedDate)}</p><h2>当日训练</h2></div><div class="record-head-actions"><button class="period-toggle ${periodDates.includes(state.selectedDate) ? "active" : ""}" type="button" data-action="toggle-period">${periodDates.includes(state.selectedDate) ? "已设生理期" : "设置生理期"}</button><button class="btn ghost" data-nav="workout">新增</button></div></div>
        ${selectedSessions.length ? selectedSessions.map(renderRecord).join("") : `<div class="empty">这一天还没有训练记录</div>`}
      </section>
    </div>`;
  }

  function renderRecord(item) {
    const details = [item.weight != null ? `${item.weight}kg` : "", item.groups != null ? `${item.groups}组` : "", item.reps != null ? `${item.reps}次` : ""].filter(Boolean).join(" · ");
    const expanded = state.expandedRecordId === item.id;
    return `<article class="record tappable${expanded ? " expanded" : ""}" data-action="toggle-record" data-id="${escapeHtml(item.id)}"><div class="record-top"><div><h3>${escapeHtml(item.title || `${item.body_part} - ${item.project_type}`)}</h3><p>精力 ${item.energy ?? "-"} · 乳酸 ${item.lactate ?? "-"} · 酸痛 ${item.soreness ?? "-"}</p></div><span class="tag">${escapeHtml(item.body_part)}</span></div>${expanded ? `<div class="record-detail"><p>${escapeHtml(item.date)}${details ? ` · ${escapeHtml(details)}` : ""}</p>${item.feeling_notes ? `<p>感受：${escapeHtml(item.feeling_notes)}</p>` : ""}${item.recovery_notes ? `<p>恢复：${escapeHtml(item.recovery_notes)}</p>` : ""}${renderReadonlyMedia(item.media_items || [])}<div class="record-actions"><button class="text-btn" data-action="edit-workout" data-id="${escapeHtml(item.id)}">编辑</button><button class="text-btn delete" data-action="delete" data-collection="sessions" data-id="${escapeHtml(item.id)}">删除</button></div></div>` : ""}</article>`;
  }

  // 修改时间：2026-09-07 19:35:00 +08:00；目的：在训练记录展开详情中展示 Android 本地媒体，且不信任旧备份中的微信临时路径。
  function renderReadonlyMedia(items) {
    if (!items.length) return "";
    return `<div class="record-media"><p>照片 / 视频</p><div class="media-grid">${items.map((item) => `<div class="media-item" data-media-key="${escapeHtml(item.storage_key || "")}" data-media-type="${escapeHtml(item.type || "image")}">${item.storage_key ? `<div class="media-loading">正在读取本地附件</div>` : `<div class="media-missing">${escapeHtml(item.migration_notice || "附件未随旧备份导出")}</div>`}</div>`).join("")}</div></div>`;
  }

  // 修改时间：2026-09-08 19:12:00 +08:00；目的：复盘页按当前周/月筛选历史内容，仅保留三项精简反馈字段。
  function renderReview() {
    const store = Store.get();
    const editing = state.editingReview ? store.reviews.find((item) => item.id === state.editingReview) : null;
    const cycle = editing?.cycle_type || state.reviewCycle;
    const range = editing ? { start: editing.start_date, end: editing.end_date } : rangeOf(cycle);
    const reviews = store.reviews.filter((item) => item.cycle_type === cycle);
    return `<div class="stack review-page">
      <section class="segment"><button data-action="review-cycle" data-cycle="week" class="${cycle === "week" ? "active" : ""}">周复盘</button><button data-action="review-cycle" data-cycle="month" class="${cycle === "month" ? "active" : ""}">月复盘</button></section>
      <form id="review-form" class="card stack">
        <div class="card-head"><div><h2>${editing ? "编辑复盘" : "复盘记录"}</h2></div>${editing ? `<button type="button" class="btn ghost" data-action="cancel-review">取消</button>` : ""}</div>
        <input type="hidden" name="cycleType" value="${cycle}">
        <input type="hidden" name="planAdjustments" value="${escapeHtml(editing?.plan_adjustments || "")}" aria-hidden="true">
        <input type="hidden" name="nextFocus" value="${escapeHtml(editing?.next_focus || "")}" aria-hidden="true">
        <div class="form-grid"><div class="field"><label>开始日期</label><input class="control" type="date" name="startDate" value="${range.start}"></div><div class="field"><label>结束日期</label><input class="control" type="date" name="endDate" value="${range.end}"></div></div>
        ${[["wins", "做得好的地方"], ["problems", "遇到的问题"], ["insights", "心得"]].map(([name, label]) => `<div class="field"><label>${label}</label><textarea class="control" name="${name}" maxlength="1500">${escapeHtml(editing?.[name] || "")}</textarea></div>`).join("")}
        <button class="btn full" type="submit">${editing ? "更新复盘" : "保存复盘"}</button>
      </form>
      <section class="card"><div class="card-head"><div><p class="eyebrow">历史复盘</p><h2>${cycle === "week" ? "周复盘" : "月复盘"}</h2></div></div>${reviews.length ? reviews.map(renderReviewRecord).join("") : `<div class="empty">还没有${cycle === "week" ? "周" : "月"}复盘记录</div>`}</section>
    </div>`;
  }

  function renderReviewRecord(item) {
    const expanded = state.expandedReviewId === item.id;
    return `<article class="record tappable${expanded ? " expanded" : ""}" data-action="toggle-review" data-id="${escapeHtml(item.id)}"><div class="record-top"><div><h3>${item.cycle_type === "week" ? "周复盘" : "月复盘"} · ${escapeHtml(item.start_date)} ~ ${escapeHtml(item.end_date)}</h3><p>训练 ${item.metrics_json?.sessions ?? 0} 次</p></div></div>${expanded ? `<div class="record-detail">${item.wins ? `<p>收获：${escapeHtml(item.wins)}</p>` : ""}${item.problems ? `<p>问题：${escapeHtml(item.problems)}</p>` : ""}${item.insights ? `<p>心得：${escapeHtml(item.insights)}</p>` : ""}<div class="record-actions"><button class="text-btn" data-action="edit-review" data-id="${escapeHtml(item.id)}">编辑</button><button class="text-btn delete" data-action="delete" data-collection="reviews" data-id="${escapeHtml(item.id)}">删除</button></div></div>` : ""}</article>`;
  }

  // 修改时间：2026-09-08 09:35:00 +08:00；目的：集中承载应用设置，把数据迁移、版本检查、目标管理和离线安全说明与知识库分离。
  function renderSettings() {
    if (state.subroute === "okr") return renderOkrManager();
    if (state.subroute === "backup") return renderBackup();
    if (state.subroute === "okr-history") return renderOkrHistory();
    const store = Store.get();
    return `<div class="stack">
      <section class="card settings-intro"><p class="eyebrow">Settings</p><h2>你的数据，你做主</h2><p>管理本地备份、迁移与应用信息；这些操作不会自动联网。</p></section>
      <section class="card settings-list" aria-label="设置选项">
        <button class="settings-row" data-nav="settings" data-subroute="backup"><span class="settings-glyph">⇄</span><span><b>数据与安全</b><small>备份、导入、重置与本地存储说明</small></span><i>›</i></button>
        <button class="settings-row" data-nav="settings" data-subroute="okr"><span class="settings-glyph">◎</span><span><b>目标 OKR</b><small>${store.okrs.length} 个周、月、年度计划</small></span><i>›</i></button>
        <button class="settings-row" data-nav="settings" data-subroute="okr-history"><span class="settings-glyph">↺</span><span><b>历史目标</b><small>查看已结束或已归档的目标</small></span><i>›</i></button>
      </section>
      <section class="card version-card"><p class="eyebrow">版本更新</p><h2>当前版本 ${APP_VERSION}</h2><p>仅在你点击时读取官方版本清单；不会上传训练数据。更新包会交给系统浏览器下载和确认安装。</p><button class="btn secondary" data-action="check-update" ${state.updateState.status === "checking" ? "disabled" : ""}>${state.updateState.status === "checking" ? "正在检查…" : "检查版本更新"}</button>${renderUpdateState()}</section>
      <!-- 修改时间：2026-09-08 11:20:00 +08:00；目的：如实说明仅用户主动版本检查会联网，避免将训练数据本地存储误表述为完全无网络能力。 -->
      <section class="card safe-note"><div class="shield">✓</div><p><b>本地优先</b><br>训练数据仅保存在 Android 应用沙箱；除你主动检查版本外，不连接网络，也不请求定位、通讯录、短信或麦克风权限。</p></section>
    </div>`;
  }

  // 修改时间：2026-09-08 10:20:00 +08:00；目的：用明确状态告知用户更新检查结果，并仅为已验证的新版本展示系统下载入口。
  function renderUpdateState() {
    const update = state.updateState;
    if (update.status === "idle") return `<p class="update-hint">版本信息来自 GitHub 发布页，下载前会显示 SHA-256 校验值。</p>`;
    if (update.status === "checking") return `<div class="update-result checking" role="status">${escapeHtml(update.message)}</div>`;
    if (update.status === "error") return `<div class="update-result error" role="status">${escapeHtml(update.message)}；当前数据不受影响。</div>`;
    if (update.status === "current") return `<div class="update-result current" role="status">已是最新版本（远程版本 ${escapeHtml(update.manifest.versionName)}）。</div>`;
    const manifest = update.manifest;
    return `<div class="update-result available" role="status"><b>发现 ${escapeHtml(manifest.versionName)}</b><p>${escapeHtml(manifest.notes)}</p><small>SHA-256：${escapeHtml(manifest.sha256)}</small><button class="btn full" data-action="open-update-download">前往官方发布页下载</button></div>`;
  }

  function renderOkrManager() {
    const store = Store.get();
    const item = state.editingOkr ? store.okrs.find((okr) => okr.id === state.editingOkr) : null;
    const cycle = item?.cycle_type || "week";
    const range = item ? { start: item.start_date, end: item.end_date } : rangeOf(cycle);
    const krs = item?.key_results || [];
    return `<div class="stack"><button class="btn ghost" data-nav="settings">← 返回设置</button>
      <form id="okr-form" class="card stack">
        <div class="card-head"><div><p class="eyebrow">Objectives</p><h2>${item ? "编辑目标" : "新增目标"}</h2></div>${item ? `<button type="button" class="btn ghost" data-action="cancel-okr">取消</button>` : ""}</div>
        <div class="field"><label>周期</label><select class="control" name="cycleType">${optionList(["week", "month", "year"], cycle)}</select></div>
        <div class="form-grid"><div class="field"><label>开始日期</label><input class="control" name="startDate" type="date" value="${range.start}"></div><div class="field"><label>结束日期</label><input class="control" name="endDate" type="date" value="${range.end}"></div></div>
        <div class="field"><label>目标</label><textarea class="control" name="objective" maxlength="1000" required>${escapeHtml(item?.objective || "")}</textarea></div>
        ${[0, 1, 2].map((index) => `<div class="field"><label>关键结果 ${index + 1}</label><input class="control" name="krTitle${index}" maxlength="120" value="${escapeHtml(krs[index]?.title || "")}" placeholder="例如：完成 4 次训练"><div class="form-grid"><input class="control" name="krCurrent${index}" type="number" step="0.1" value="${escapeHtml(krs[index]?.current_value ?? "")}" placeholder="当前"><input class="control" name="krTarget${index}" type="number" step="0.1" value="${escapeHtml(krs[index]?.target_value ?? "")}" placeholder="目标"></div><input class="control" name="krUnit${index}" maxlength="20" value="${escapeHtml(krs[index]?.unit || "")}" placeholder="单位"></div>`).join("")}
        <button class="btn full" type="submit">${item ? "更新目标" : "保存目标"}</button>
      </form>
      <section class="card"><div class="card-head"><div><p class="eyebrow">All cycles</p><h2>全部目标</h2></div></div>${store.okrs.length ? store.okrs.map((okr) => `<article class="record"><div class="record-top"><div><h3>${escapeHtml(okr.objective)}</h3><p>${escapeHtml(okr.start_date)} — ${escapeHtml(okr.end_date)}</p></div><span class="tag">${okr.cycle_type}</span></div><div class="record-actions"><button class="text-btn" data-action="edit-okr" data-id="${escapeHtml(okr.id)}">编辑</button><button class="text-btn delete" data-action="delete" data-collection="okrs" data-id="${escapeHtml(okr.id)}">删除</button></div></article>`).join("") : `<div class="empty">还没有目标</div>`}</section>
    </div>`;
  }

  // 修改时间：2026-09-08 16:40:00 +08:00；目的：提供独立历史目标入口，避免历史计划和新增目标混在同一操作区。
  function renderOkrHistory() {
    const today = Store.dateString();
    const history = Store.get().okrs.filter((okr) => okr.status !== "active" || okr.end_date < today);
    return `<div class="stack"><button class="btn ghost" data-nav="settings">← 返回设置</button><section class="card"><div class="card-head"><div><p class="eyebrow">Archived objectives</p><h2>历史目标</h2></div><button class="btn outline" data-nav="settings" data-subroute="okr">目标管理</button></div>${history.length ? history.map((okr) => `<article class="record"><div class="record-top"><div><h3>${escapeHtml(okr.objective)}</h3><p>${escapeHtml(okr.start_date)} — ${escapeHtml(okr.end_date)}</p></div><span class="tag">${escapeHtml(okr.cycle_type)}</span></div><div class="record-actions"><button class="text-btn" data-action="edit-okr" data-id="${escapeHtml(okr.id)}">编辑</button></div></article>`).join("") : `<div class="empty">还没有历史目标</div>`}</section></div>`;
  }

  function renderKnowledge() {
    const store = Store.get();
    const item = state.editingKnowledge ? store.knowledge_points.find((point) => point.id === state.editingKnowledge) : null;
    const keyword = state.knowledgeSearch.trim().toLowerCase();
    const points = store.knowledge_points.filter((point) => !keyword || [point.title, point.category, point.mistake, point.correction, point.notes].some((value) => String(value || "").toLowerCase().includes(keyword)));
    // 修改时间：2026-09-08 09:40:00 +08:00；目的：知识页已是独立顶级页，移除无效的“返回知识”按钮，编辑取消继续由表单内按钮处理。
    return `<div class="stack">
      <form id="knowledge-form" class="card stack"><div class="card-head"><div><p class="eyebrow">Movement notes</p><h2>${item ? "编辑知识点" : "记录动作纠错"}</h2></div>${item ? `<button type="button" class="btn ghost" data-action="cancel-knowledge">取消</button>` : ""}</div>
        <div class="form-grid"><div class="field"><label>标题</label><input class="control" name="title" maxlength="100" value="${escapeHtml(item?.title || "")}"></div><div class="field"><label>分类</label><input class="control" name="category" maxlength="40" value="${escapeHtml(item?.category || "")}"></div></div>
        <div class="field"><label>常见错误</label><textarea class="control" name="mistake" maxlength="1200">${escapeHtml(item?.mistake || "")}</textarea></div><div class="field"><label>纠正方法</label><textarea class="control" name="correction" maxlength="1200">${escapeHtml(item?.correction || "")}</textarea></div><div class="field"><label>补充笔记</label><textarea class="control" name="notes" maxlength="1200">${escapeHtml(item?.notes || "")}</textarea></div>
        <button class="btn full" type="submit">${item ? "更新知识点" : "保存知识点"}</button>
      </form>
      <section class="card knowledge-library"><div class="card-head"><div><p class="eyebrow">Library</p><h2>知识点</h2></div><span class="knowledge-count">${points.length}/${store.knowledge_points.length}</span></div><input class="control knowledge-search" id="knowledge-search" type="search" value="${escapeHtml(state.knowledgeSearch)}" placeholder="搜索标题、分类或关键词" aria-label="搜索知识点">${points.length ? points.map((point) => { const expanded = state.expandedKnowledgeId === point.id; return `<article class="record knowledge-record${expanded ? " expanded" : ""}"><button class="knowledge-title" type="button" data-action="toggle-knowledge" data-id="${escapeHtml(point.id)}"><span>${escapeHtml(point.title || point.mistake)}</span><small>${escapeHtml(point.category || "未分类")} · ${expanded ? "收起" : "点击查看"}</small></button>${expanded ? `<div class="knowledge-detail">${point.mistake ? `<p><b>易错点：</b>${escapeHtml(point.mistake)}</p>` : ""}${point.correction ? `<p><b>正确做法：</b>${escapeHtml(point.correction)}</p>` : ""}${point.notes ? `<p><b>备注：</b>${escapeHtml(point.notes)}</p>` : ""}</div><div class="record-actions"><button class="text-btn" data-action="edit-knowledge" data-id="${escapeHtml(point.id)}">编辑</button><button class="text-btn delete" data-action="delete" data-collection="knowledge_points" data-id="${escapeHtml(point.id)}">删除</button></div>` : ""}</article>`; }).join("") : `<div class="empty">${keyword ? "没有匹配的知识点" : "还没有知识点"}</div>`}</section>
    </div>`;
  }

  function renderBackup() {
    return `<div class="stack"><button class="btn ghost" data-nav="settings">← 返回设置</button>
      <section class="card stack"><div class="card-head"><div><p class="eyebrow">Local only</p><h2>数据备份</h2></div></div><div class="notice">数据仅保存在当前设备的应用沙箱。备份框默认留空；点击“复制备份”时才生成当前数据文本。</div><textarea id="backup-text" class="control backup-box" spellcheck="false" placeholder="粘贴小程序或其他设备导出的 JSON 备份"></textarea><div class="actions"><button class="btn" data-action="copy-backup">复制备份</button><button class="btn secondary" data-action="import-backup">从文本导入</button></div></section>
      <section class="card stack"><div class="safe-note"><div class="shield">✓</div><p><b>安全边界</b><br>没有云同步、远程脚本、广告或分析 SDK；备份内容也不会自动上传。</p></div><button class="btn danger full" data-action="reset">直接清空全部本地数据</button></section>
    </div>`;
  }

  function updateProjectFields() {
    const body = document.getElementById("body-part")?.value;
    const projectSelect = document.getElementById("project");
    if (!body || !projectSelect) return;
    const projects = Catalog.projectOptions[body] || ["未细分"];
    projectSelect.innerHTML = optionList(projects.concat("自定义"), projects[0]);
    document.getElementById("custom-project-field").hidden = true;
    updateMovementFields();
  }

  function updateMovementFields() {
    const project = document.getElementById("project")?.value;
    const custom = project === "自定义";
    document.getElementById("custom-project-field").hidden = !custom;
    const movements = Catalog.movementOptions[project] || [];
    const movementSelect = document.getElementById("movement");
    if (movementSelect) movementSelect.innerHTML = optionList(movements.concat("自定义"), "自定义");
    document.getElementById("custom-movement-field").hidden = false;
  }

  document.querySelector(".bottom-nav").addEventListener("click", (event) => {
    const button = event.target.closest("[data-route]");
    if (button) navigate(button.dataset.route);
  });

  // 修改时间：2026-09-08 09:35:00 +08:00；目的：让顶部设置按钮与底部导航共用路由逻辑，并保持设置可从任意页面直达。
  document.querySelector(".header-settings").addEventListener("click", () => navigate("settings"));

  app.addEventListener("change", (event) => {
    if (event.target.id === "workout-media-input") { addWorkoutMedia(event.target.files); return; }
    if (event.target.id === "body-part") updateProjectFields();
    if (event.target.id === "project") updateMovementFields();
    if (event.target.id === "movement") document.getElementById("custom-movement-field").hidden = event.target.value !== "自定义";
    // 修改时间：2026-09-07 18:05:00 +08:00；目的：月历月份选择器变更时固定选中该月第一天，保证日历和月内周次正常刷新。
    if (event.target.id === "record-date") { state.selectedDate = `${event.target.value}-01`; render(); }
  });

  // 修改时间：2026-09-08 18:20:00 +08:00；目的：知识页搜索框输入时即时按标题、分类和正文关键词筛选。
  app.addEventListener("input", (event) => {
    if (event.target.id === "knowledge-search") {
      // 修改时间：2026-09-08 18:45:00 +08:00；目的：搜索重绘后恢复焦点和光标位置，避免连续输入时输入框失焦。
      const cursor = event.target.selectionStart;
      state.knowledgeSearch = event.target.value;
      render();
      const next = document.getElementById("knowledge-search");
      next?.focus();
      if (next && cursor !== null) next.setSelectionRange(cursor, cursor);
    }
  });

  // 修改时间：2026-09-08 16:40:00 +08:00；目的：将记录页月历手势映射为左滑上月、右滑下月，并忽略垂直滚动。
  app.addEventListener("touchstart", (event) => {
    if (event.target.closest("[data-record-calendar]")) recordTouchStart = { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
  }, { passive: true });
  app.addEventListener("touchend", (event) => {
    if (!recordTouchStart || !event.target.closest("[data-record-calendar]")) return;
    const deltaX = event.changedTouches[0].clientX - recordTouchStart.x;
    const deltaY = event.changedTouches[0].clientY - recordTouchStart.y;
    recordTouchStart = null;
    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    const current = parseDate(state.selectedDate);
    const target = new Date(current.getFullYear(), current.getMonth() + (deltaX < 0 ? -1 : 1), 1);
    state.selectedDate = Store.dateString(target);
    render();
  }, { passive: true });

  // 修改时间：2026-09-08 18:20:00 +08:00；目的：让目标、训练、记录、复盘和知识五个主页面支持左右滑动切换。
  app.addEventListener("touchstart", (event) => {
    if (event.target.closest("[data-record-calendar], input, textarea, select, button, .media-grid")) { pageTouchStart = null; return; }
    pageTouchStart = { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
  }, { passive: true });
  app.addEventListener("touchend", (event) => {
    if (!pageTouchStart) return;
    const deltaX = event.changedTouches[0].clientX - pageTouchStart.x;
    const deltaY = event.changedTouches[0].clientY - pageTouchStart.y;
    pageTouchStart = null;
    if (Math.abs(deltaX) < 70 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    const routes = ["today", "workout", "records", "review", "knowledge"];
    const index = routes.indexOf(state.route);
    if (index < 0) return;
    const nextIndex = Math.max(0, Math.min(routes.length - 1, index + (deltaX < 0 ? 1 : -1)));
    if (nextIndex !== index) navigate(routes[nextIndex]);
  }, { passive: true });

  app.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-nav]");
    if (nav) { navigate(nav.dataset.nav, nav.dataset.subroute || "menu"); return; }
    if (event.target.closest(".media-preview")) return;
    const day = event.target.closest("[data-date]");
    if (day) { state.selectedDate = day.dataset.date; render(); return; }
    const scoreButton = event.target.closest("[data-score]");
    if (scoreButton) {
      const row = scoreButton.closest("[data-score-name]");
      row.querySelectorAll(".score-btn").forEach((button) => button.classList.toggle("selected", button === scoreButton));
      row.nextElementSibling.value = scoreButton.dataset.score;
      return;
    }
    const action = event.target.closest("[data-action]");
    if (!action) return;
    handleAction(action);
  });

  function handleAction(action) {
    const name = action.dataset.action;
    if (name === "toggle-record") { state.expandedRecordId = state.expandedRecordId === action.dataset.id ? "" : action.dataset.id; render(); }
    if (name === "toggle-review") { state.expandedReviewId = state.expandedReviewId === action.dataset.id ? "" : action.dataset.id; render(); }
    if (name === "toggle-knowledge") { state.expandedKnowledgeId = state.expandedKnowledgeId === action.dataset.id ? "" : action.dataset.id; render(); }
    if (name === "edit-workout") { state.editingWorkout = action.dataset.id; state.workoutMediaOwner = ""; navigate("workout"); }
    if (name === "cancel-workout") { discardWorkoutDraftMedia().finally(() => { state.editingWorkout = ""; state.workoutMediaOwner = ""; state.workoutMediaDraft = []; render(); }); }
    if (name === "review-cycle") { state.reviewCycle = action.dataset.cycle; state.editingReview = ""; render(); }
    if (name === "edit-review") { state.editingReview = action.dataset.id; render(); }
    if (name === "cancel-review") { state.editingReview = ""; render(); }
    if (name === "edit-okr") { state.editingOkr = action.dataset.id; state.subroute = "okr"; render(); }
    if (name === "cancel-okr") { state.editingOkr = ""; render(); }
    if (name === "edit-knowledge") { state.editingKnowledge = action.dataset.id; render(); }
    if (name === "cancel-knowledge") { state.editingKnowledge = ""; render(); }
    if (name === "delete") {
      confirmAction({ title: "删除这条记录？", message: "删除后只能通过之前复制的备份恢复。", onConfirm: async () => {
        const item = (Store.get()[action.dataset.collection] || []).find((entry) => entry.id === action.dataset.id);
        if (action.dataset.collection === "sessions") await Promise.all((item?.media_items || []).map((media) => MediaVault.removeFile(media.storage_key).catch(() => null)));
        Store.remove(action.dataset.collection, action.dataset.id); render(); showToast("已删除");
      } });
    }
    if (name === "choose-workout-media") document.getElementById("workout-media-input")?.click();
    if (name === "remove-workout-media") removeWorkoutMedia(action.dataset.id);
    if (name === "copy-backup") copyBackup();
    if (name === "import-backup") importBackup();
    // 修改时间：2026-09-08 10:20:00 +08:00；目的：仅在用户主动操作时检查固定 GitHub 版本清单，下载入口只接受已校验的新版本。
    if (name === "check-update") { checkForUpdate(); return; }
    if (name === "open-update-download") { openVerifiedUpdateDownload(); return; }
    if (name === "toggle-period") {
      const store = Store.get();
      const dates = Array.isArray(store.period_dates) ? store.period_dates.slice() : [];
      const index = dates.indexOf(state.selectedDate);
      if (index >= 0) dates.splice(index, 1); else dates.push(state.selectedDate);
      Store.set({ ...store, period_dates: dates.sort() });
      render();
      showToast(index >= 0 ? "已取消生理期" : "已设置生理期");
      return;
    }
    if (name === "reset") confirmAction({ title: "直接清空所有本地数据？", message: "训练、目标、复盘、知识点和生理期标记都会被删除，清空后不会保留初始示例目标。请先复制备份。", onConfirm: async () => { const sessions = Store.get().sessions || []; await Promise.all(sessions.flatMap((session) => (session.media_items || []).map((media) => MediaVault.removeFile(media.storage_key).catch(() => null)))); Store.reset(); render(); showToast("本地数据已清空"); } });
  }

  // 修改时间：2026-09-07 19:35:00 +08:00；目的：将用户在 Android 选择的照片或视频写入本地媒体库，并限制每条训练最多三个附件。
  async function addWorkoutMedia(fileList) {
    const files = Array.from(fileList || []);
    const freeSlots = MediaVault.MAX_MEDIA_PER_RECORD - state.workoutMediaDraft.length;
    if (!files.length || freeSlots <= 0) { showToast("每条训练最多保存 3 个附件"); return; }
    try {
      const saved = await Promise.all(files.slice(0, freeSlots).map((file) => MediaVault.putFile(file)));
      state.workoutMediaDraft = state.workoutMediaDraft.concat(saved);
      state.workoutNewMediaKeys = state.workoutNewMediaKeys.concat(saved.map((item) => item.storage_key));
      render();
      showToast(`已保存 ${saved.length} 个本地附件`);
    } catch (error) { showToast(error.message || "保存附件失败"); }
  }

  async function removeWorkoutMedia(id) {
    const target = state.workoutMediaDraft.find((item) => (item.id || item.storage_key) === id);
    try { await MediaVault.removeFile(target?.storage_key); } catch (_) { /* 本地文件不存在时仍允许移除元数据。 */ }
    state.workoutMediaDraft = state.workoutMediaDraft.filter((item) => (item.id || item.storage_key) !== id);
    state.workoutNewMediaKeys = state.workoutNewMediaKeys.filter((key) => key !== target?.storage_key);
    render();
  }

  // 修改时间：2026-09-07 19:35:00 +08:00；目的：用户取消未保存训练时清理本次新选附件，避免在应用沙箱留下不可见的孤立媒体 Blob。
  async function discardWorkoutDraftMedia() {
    await Promise.all(state.workoutNewMediaKeys.map((key) => MediaVault.removeFile(key).catch(() => null)));
    state.workoutNewMediaKeys = [];
  }

  async function copyBackup() {
    const field = document.getElementById("backup-text");
    // 修改时间：2026-09-08 18:20:00 +08:00；目的：备份框保持空白，只有用户主动复制时才生成当前本地数据。
    const text = JSON.stringify(Store.get(), null, 2);
    field.value = text;
    try {
      await navigator.clipboard.writeText(text);
      showToast("备份已复制");
    } catch (_) {
      field.focus(); field.select();
      document.execCommand("copy");
      showToast("备份已复制");
    }
  }

  function importBackup() {
    const field = document.getElementById("backup-text");
    confirmAction({ title: "导入当前文本？", message: "导入会覆盖当前全部数据，请确认已经保留需要的备份。", onConfirm: async () => {
      try {
        const result = await importBackupWithMedia(field.value);
        render();
        showToast(result.embedded ? `导入成功，已恢复 ${result.embedded} 个附件` : result.unavailable ? `导入成功，${result.unavailable} 个附件需重新选择` : "导入成功");
      } catch (error) { showToast(error.message || "导入失败"); }
    } });
  }

  // 修改时间：2026-09-07 19:35:00 +08:00；目的：导入兼容迁移包中的 dataUrl 媒体到 Android 本地媒体库；旧微信临时路径仅保留提示，不尝试越过应用隔离读取文件。
  async function importBackupWithMedia(text) {
    if (String(text || "").length > 80 * 1024 * 1024) throw new Error("含媒体的迁移包不能超过 80MB");
    const parsed = JSON.parse(text);
    let embedded = 0;
    let unavailable = 0;
    for (const session of parsed.sessions || []) {
      const items = Array.isArray(session.media_items) ? session.media_items.slice(0, MediaVault.MAX_MEDIA_PER_RECORD) : [];
      const hydrated = [];
      for (const item of items) {
        const media = await MediaVault.hydrateEmbeddedMedia(item);
        if (media.storage_key) embedded += 1;
        else if (media.path) unavailable += 1;
        hydrated.push(media);
      }
      session.media_items = hydrated;
    }
    Store.importText(JSON.stringify(parsed));
    return { embedded, unavailable };
  }

  app.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    if (form.id === "workout-form") submitWorkout(form);
    if (form.id === "review-form") submitReview(form);
    if (form.id === "okr-form") submitOkr(form);
    if (form.id === "knowledge-form") submitKnowledge(form);
  });

  function submitWorkout(form) {
    const data = new FormData(form);
    const existing = state.editingWorkout ? Store.get().sessions.find((item) => item.id === state.editingWorkout) : null;
    const project = data.get("projectType") === "自定义" ? String(data.get("customProject") || "").trim() : data.get("projectType");
    const movement = data.get("movement") === "自定义" ? String(data.get("customMovement") || "").trim() : data.get("movement");
    const body = String(data.get("bodyPart"));
    if (!project) { showToast("请填写训练项目"); return; }
    const item = {
      id: existing?.id || Store.id("session"), date: String(data.get("date")), training_type: String(data.get("trainingType")), body_part: body,
      project_type: String(project), movement: String(movement || ""), title: [body, project, movement].filter(Boolean).join(" - "),
      weight: num(data.get("weight")), groups: num(data.get("groups")), reps: num(data.get("reps")), rest_sec: num(data.get("restSec")),
      energy: num(data.get("energy")), lactate: num(data.get("lactate")), soreness: num(data.get("soreness")),
      feeling_notes: String(data.get("feelingNotes") || "").trim(), recovery_notes: String(data.get("recoveryNotes") || "").trim(),
      // 修改时间：2026-09-07 19:35:00 +08:00；目的：将 IndexedDB 媒体索引随训练记录保存，实际 Blob 始终留在 Android 应用沙箱。
      media_items: state.workoutMediaDraft, updated_at: new Date().toISOString()
    };
    Store.upsert("sessions", item);
    state.editingWorkout = ""; state.workoutMediaOwner = ""; state.workoutMediaDraft = []; state.workoutNewMediaKeys = [];
    state.selectedDate = item.date;
    navigate("records");
    showToast(existing ? "训练已更新" : "训练已保存");
  }

  function submitReview(form) {
    const data = new FormData(form);
    const start = String(data.get("startDate"));
    const end = String(data.get("endDate"));
    if (start > end) { showToast("开始日期不能晚于结束日期"); return; }
    const existing = state.editingReview ? Store.get().reviews.find((item) => item.id === state.editingReview) : null;
    const item = { id: existing?.id || Store.id("review"), cycle_type: String(data.get("cycleType")), start_date: start, end_date: end, metrics_json: Store.metrics(start, end), wins: String(data.get("wins") || "").trim(), problems: String(data.get("problems") || "").trim(), insights: String(data.get("insights") || "").trim(), plan_adjustments: String(data.get("planAdjustments") || "").trim(), next_focus: String(data.get("nextFocus") || "").trim() };
    Store.upsert("reviews", item); state.editingReview = ""; render(); showToast(existing ? "复盘已更新" : "复盘已保存");
  }

  function submitOkr(form) {
    const data = new FormData(form);
    const objective = String(data.get("objective") || "").trim();
    if (!objective) { showToast("请填写目标"); return; }
    const existing = state.editingOkr ? Store.get().okrs.find((item) => item.id === state.editingOkr) : null;
    const results = [0, 1, 2].map((index) => ({ id: existing?.key_results?.[index]?.id || Store.id("kr"), title: String(data.get(`krTitle${index}`) || "").trim(), current_value: num(data.get(`krCurrent${index}`)), target_value: num(data.get(`krTarget${index}`)), unit: String(data.get(`krUnit${index}`) || "").trim() })).filter((item) => item.title || item.target_value != null);
    const item = { id: existing?.id || Store.id("okr"), cycle_type: String(data.get("cycleType")), objective, status: "active", start_date: String(data.get("startDate")), end_date: String(data.get("endDate")), key_results: results };
    Store.upsert("okrs", item); state.editingOkr = ""; render(); showToast(existing ? "目标已更新" : "目标已保存");
  }

  function submitKnowledge(form) {
    const data = new FormData(form);
    const titleValue = String(data.get("title") || "").trim();
    const mistake = String(data.get("mistake") || "").trim();
    if (!titleValue && !mistake) { showToast("请先写一个知识点"); return; }
    const existing = state.editingKnowledge ? Store.get().knowledge_points.find((item) => item.id === state.editingKnowledge) : null;
    const item = { id: existing?.id || Store.id("knowledge"), title: titleValue, category: String(data.get("category") || "").trim(), mistake, correction: String(data.get("correction") || "").trim(), notes: String(data.get("notes") || "").trim(), updated_at: new Date().toISOString() };
    Store.upsert("knowledge_points", item); state.editingKnowledge = ""; render(); showToast(existing ? "知识点已更新" : "知识点已保存");
  }

  // 修改时间：2026-09-07 18:42:00 +08:00；目的：启动封面可轻触跳过，并在短暂展示后自动淡出，避免阻塞离线训练数据的正常使用。
  function dismissLaunchCover() {
    const cover = document.getElementById("launch-cover");
    if (!cover || cover.classList.contains("is-hiding")) return;
    cover.classList.add("is-hiding");
    window.setTimeout(() => cover.remove(), 260);
  }

  const launchCover = document.getElementById("launch-cover");
  if (launchCover) {
    launchCover.addEventListener("click", dismissLaunchCover, { once: true });
    window.setTimeout(dismissLaunchCover, 1650);
  }

  render();
})();
