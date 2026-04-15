// storage_urls.js
import { ref, list, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";
import { storage } from "./firebase.js";

const IMG_EXT = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"];
const isImagePath = (p) => IMG_EXT.some((e) => p.toLowerCase().endsWith(e));

const CACHE_KEY = "waitgame_urlcache_v2";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function pickRandom(arr) {
  if (!arr?.length) return null;
  return arr[(Math.random() * arr.length) | 0] ?? null;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pLimit(concurrency) {
  let active = 0;
  const q = [];
  const next = () => {
    active--;
    if (q.length) q.shift()();
  };
  return (fn) =>
    new Promise((resolve) => {
      const run = () => {
        active++;
        Promise.resolve()
          .then(fn)
          .then((v) => { resolve(v); next(); })
          .catch(() => { resolve(null); next(); });
      };
      if (active < concurrency) run();
      else q.push(run);
    });
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.ts || !Array.isArray(obj.urls)) return null;
    if (Date.now() - obj.ts > CACHE_TTL_MS) return null;
    return obj.urls;
  } catch {
    return null;
  }
}
function saveCache(urls) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), urls }));
  } catch {}
}

/**
 * generations/ 配下から「1枚だけ」ランダムに画像URLを取得する
 * - まずはキャッシュを優先（体感速い）
 * - キャッシュが無い/切れてる場合だけStorageを軽く探索
 */
export async function getRandomGenerationCharacterUrl({
  preferCache = true,
  prefixPageSize = 200,
  folderSample = 24,
  perFolderMaxResults = 32,
  maxFolderTries = 10,
} = {}) {
  try {
    if (preferCache) {
      const cached = loadCache();
      const u = pickRandom(cached);
      if (u) return u;
    }

    const root = ref(storage, "generations");

    // 1) prefix（フォルダ）を少しだけ集める（軽量）
    const prefixes = [];
    let pageToken = undefined;
    while (prefixes.length < folderSample) {
      const res = await list(root, { maxResults: prefixPageSize, pageToken });
      prefixes.push(...res.prefixes);
      pageToken = res.nextPageToken;
      if (!pageToken) break;
    }
    if (!prefixes.length) return null;

    shuffleInPlace(prefixes);

    // 2) いくつかのフォルダを試して、画像アイテムが見つかったら1枚だけ返す
    const tries = Math.min(maxFolderTries, prefixes.length);
    for (let i = 0; i < tries; i++) {
      const folderRef = prefixes[i];
      const res = await list(folderRef, { maxResults: perFolderMaxResults });
      const imageItems = res.items.filter((it) => isImagePath(it.fullPath));
      const item = pickRandom(imageItems);
      if (!item) continue;

      const url = await getDownloadURL(item);
      if (!url) continue;

      // 3) キャッシュに混ぜておく（次回以降は速い）
      const cached = loadCache() ?? [];
      const merged = [url, ...cached.filter((x) => x && x !== url)].slice(0, 160);
      saveCache(merged);

      return url;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * StorageからURLを“少しずつ”取得して onBatch(urls) に渡す
 * 返り値: { stop() } で中断できる
 */
export function streamGenerationCharacterUrls({
  onBatch,
  maxUrls = 160,
  batchSize = 16,
  prefixPageSize = 200,
  folderSample = 24,
  perFolderMaxResults = 18,
  urlConcurrency = 6,
} = {}) {
  let stopped = false;
  const stop = () => { stopped = true; };

  // 0) キャッシュがあれば先に流す（体感最速）
  const cached = loadCache();
  const seen = new Set();
  if (cached?.length) {
    let batch = [];
    for (const u of cached.slice(0, maxUrls)) {
      if (!u || seen.has(u)) continue;
      seen.add(u);
      batch.push(u);
      if (batch.length >= batchSize) {
        onBatch(batch);
        batch = [];
      }
    }
    if (batch.length) onBatch(batch);
  }

  (async () => {
    const root = ref(storage, "generations");
    const limiter = pLimit(urlConcurrency);

    // 1) generations直下prefix（フォルダ）を少し集める
    const prefixes = [];
    let pageToken = undefined;

    while (!stopped && prefixes.length < folderSample) {
      const res = await list(root, { maxResults: prefixPageSize, pageToken });
      prefixes.push(...res.prefixes);
      pageToken = res.nextPageToken;
      if (!pageToken) break;
    }

    shuffleInPlace(prefixes);
    const picked = prefixes.slice(0, folderSample);

    // 2) 各フォルダから少し拾ってURL化→バッチ通知
    let outCount = seen.size;
    let batch = [];

    for (const folderRef of picked) {
      if (stopped || outCount >= maxUrls) break;

      const res = await list(folderRef, { maxResults: perFolderMaxResults });
      const imageItems = res.items.filter((it) => isImagePath(it.fullPath));

      const urls = await Promise.all(
        imageItems.map((it) => limiter(() => getDownloadURL(it)))
      );

      for (const u of urls) {
        if (stopped || !u || seen.has(u)) continue;
        seen.add(u);
        batch.push(u);
        outCount++;

        if (batch.length >= batchSize) {
          onBatch(batch);
          batch = [];
        }
        if (outCount >= maxUrls) break;
      }
    }

    if (!stopped && batch.length) onBatch(batch);

    // 3) キャッシュ更新
    saveCache(Array.from(seen).slice(0, maxUrls));
  })();

  return { stop };
}
