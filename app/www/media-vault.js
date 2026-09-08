/* 修改时间：2026-09-07 19:35:00 +08:00；目的：将训练照片和短视频以 Blob 存入 Android WebView 的 IndexedDB 应用沙箱，避免大媒体写入 localStorage。 */
(function () {
  "use strict";
  const DB_NAME = "fitness_okr_media_v1";
  const STORE_NAME = "files";
  const MAX_FILE_BYTES = 30 * 1024 * 1024;
  const MAX_MEDIA_PER_RECORD = 3;

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("无法打开本地媒体库"));
    });
  }

  function makeKey() {
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);
    return `media_${Date.now().toString(36)}_${values[0].toString(36)}${values[1].toString(36)}`;
  }

  function fileType(file) {
    return String(file.type || "").startsWith("video/") ? "video" : "image";
  }

  function assertFile(file) {
    if (!file || !(file instanceof Blob)) throw new Error("未读取到媒体文件");
    if (!String(file.type || "").startsWith("image/") && !String(file.type || "").startsWith("video/")) throw new Error("仅支持照片或视频");
    if (file.size > MAX_FILE_BYTES) throw new Error("单个照片或视频不能超过 30MB");
  }

  async function putFile(file, name = "") {
    assertFile(file);
    const key = makeKey();
    const item = { key, blob: file, name: name || file.name || "附件", mime: file.type || "application/octet-stream", size: file.size, type: fileType(file), created_at: new Date().toISOString() };
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(item);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error || new Error("保存媒体失败"));
    });
    db.close();
    return { id: key, storage_key: key, type: item.type, name: item.name, size: item.size, mime: item.mime, available: true };
  }

  async function getFile(key) {
    if (!key) return null;
    const db = await openDb();
    const item = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("读取媒体失败"));
    });
    db.close();
    return item;
  }

  async function removeFile(key) {
    if (!key) return;
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(key);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error || new Error("删除媒体失败"));
    });
    db.close();
  }

  function dataUrlToBlob(value) {
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(value || ""));
    if (!match) throw new Error("媒体数据格式无效");
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: match[1] });
  }

  // 修改时间：2026-09-07 19:35:00 +08:00；目的：兼容将 dataUrl 内嵌在迁移包中的媒体，导入时转回 IndexedDB Blob 而非长期保留 Base64 文本。
  async function hydrateEmbeddedMedia(item) {
    const dataUrl = item?.data_url || item?.dataUrl;
    if (!dataUrl) return { ...item, available: Boolean(item?.storage_key), migration_notice: item?.path && !item?.storage_key ? "微信附件路径无法跨应用读取，请重新选择原文件" : item?.migration_notice || "" };
    const blob = dataUrlToBlob(dataUrl);
    const saved = await putFile(blob, item.name || item.file_name || "迁移附件");
    return { ...saved, original_path: item.path || "" };
  }

  window.FitnessMediaVault = Object.freeze({ MAX_FILE_BYTES, MAX_MEDIA_PER_RECORD, putFile, getFile, removeFile, hydrateEmbeddedMedia });
})();
