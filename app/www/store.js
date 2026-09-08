/* 修改时间：2026-08-20 15:46:01 +08:00；目的：提供只写入 Android 应用沙箱的本地数据层及安全备份校验。 */
(function () {
  "use strict";
  const KEY = "fitness_okr_android_v1";

  function id(prefix) {
    const random = new Uint32Array(2);
    crypto.getRandomValues(random);
    return `${prefix}_${Date.now().toString(36)}_${random[0].toString(36)}${random[1].toString(36)}`;
  }

  function dateString(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function initial() {
    const year = new Date().getFullYear();
    return {
      // 修改时间：2026-09-08 16:40:00 +08:00；目的：为双端数据迁移保存生理期日期，并兼容旧备份。
      schemaVersion: 1,
      sessions: [], reviews: [], knowledge_points: [], period_dates: [],
      okrs: [{
        id: id("okr"), cycle_type: "year", objective: "建立稳定训练节奏", status: "active",
        start_date: `${year}-01-01`, end_date: `${year}-12-31`,
        key_results: [
          { id: id("kr"), title: "每周完成 4 次训练", current_value: 0, target_value: 4, unit: "次/周" },
          { id: id("kr"), title: "每周完成 1 次复盘", current_value: 0, target_value: 1, unit: "次/周" }
        ]
      }]
    };
  }

  function validStore(value) {
    return value && typeof value === "object" && Array.isArray(value.sessions) && Array.isArray(value.okrs) && Array.isArray(value.reviews) && Array.isArray(value.knowledge_points);
  }

  function get() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY));
      if (validStore(parsed)) return parsed;
    } catch (_) { /* 损坏数据会由初始数据替代，避免应用崩溃。 */ }
    const value = initial();
    set(value);
    return value;
  }

  function set(value) {
    if (!validStore(value)) throw new Error("数据格式无效");
    localStorage.setItem(KEY, JSON.stringify(value));
  }

  function upsert(collection, value) {
    const store = get();
    const list = store[collection] || [];
    const index = list.findIndex((item) => item.id === value.id);
    if (index >= 0) list[index] = value; else list.unshift(value);
    store[collection] = list;
    set(store);
    return value;
  }

  function remove(collection, targetId) {
    const store = get();
    store[collection] = (store[collection] || []).filter((item) => item.id !== targetId);
    set(store);
  }

  function metrics(start, end) {
    const sessions = get().sessions.filter((item) => item.date >= start && item.date <= end);
    const completedSessions = sessions.filter((item) => item.status === undefined || item.status === "completed").length;
    const sets = sessions.reduce((sum, item) => sum + Number(item.groups || 0), 0);
    const volume = sessions.reduce((sum, item) => sum + Number(item.weight || 0) * Number(item.groups || 0) * Number(item.reps || 0), 0);
    const lactates = sessions.map((item) => Number(item.lactate)).filter(Number.isFinite);
    // 修改时间：2026-09-07 18:05:00 +08:00；目的：补齐与小程序一致的完成率统计，让 Android 复盘指标与小程序复盘页面对齐。
    return { sessions: sessions.length, completedSessions, completionRate: sessions.length ? Math.round(completedSessions / sessions.length * 100) : 0, totalSets: sets, totalVolume: Math.round(volume), averageLactate: lactates.length ? Math.round(lactates.reduce((a, b) => a + b, 0) / lactates.length * 10) / 10 : 0 };
  }

  // 修改时间：2026-08-21 17:55:34 +08:00；目的：兼容小程序 workout_sets 嵌套结构与 Android 平铺结构，支持双向迁移。
  function normalizeSession(item) {
    const firstSet = (item.workout_sets || [])[0] || {};
    const weight = item.weight === undefined ? firstSet.weight : item.weight;
    const groups = item.groups === undefined ? firstSet.groups : item.groups;
    const reps = item.reps === undefined ? firstSet.reps : item.reps;
    const restSec = item.rest_sec === undefined ? firstSet.rest_sec : item.rest_sec;
    return {
      ...item,
      weight,
      groups,
      reps,
      rest_sec: restSec,
      energy: item.energy === undefined ? item.energy_score : item.energy,
      lactate: item.lactate === undefined ? item.lactate_score : item.lactate,
      soreness: item.soreness === undefined ? item.soreness_score : item.soreness,
      feeling_notes: item.feeling_notes || "",
      recovery_notes: item.recovery_notes || ""
    };
  }

  function importText(text) {
    if (text.length > 5 * 1024 * 1024) throw new Error("备份文件超过 5MB");
    const parsed = JSON.parse(text);
    if (!validStore(parsed)) throw new Error("不是有效的轻铁训练备份");
    const clean = {
      schemaVersion: 1,
      sessions: parsed.sessions.slice(0, 10000).map(normalizeSession),
      okrs: parsed.okrs.slice(0, 1000),
      reviews: parsed.reviews.slice(0, 5000),
      knowledge_points: parsed.knowledge_points.slice(0, 5000),
      // 修改时间：2026-09-08 16:40:00 +08:00；目的：导入小程序迁移包时恢复生理期标记，旧包缺失字段则使用空数组。
      period_dates: Array.isArray(parsed.period_dates) ? parsed.period_dates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)).slice(0, 1000) : []
    };
    set(clean);
  }

  window.FitnessStore = Object.freeze({ KEY, id, dateString, get, set, upsert, remove, metrics, importText, reset: () => set(initial()) });
})();
