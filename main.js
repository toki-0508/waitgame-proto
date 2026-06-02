// main.js
import { getRandomGenerationCharacterUrl } from "./storage_urls.js?v=20260602-1";
import { startGame } from "./game.js?v=20260602-1";

// 埋め込み（iframe / ポップアップ）想定のときは余白などを抑える
// - iframe内なら自動で embed モード
// - URLに ?embed=1 を付けても embed モード
let isEmbed = false;
try {
  isEmbed = (window.parent && window.parent !== window) || new URLSearchParams(location.search).get("embed") === "1";
  document.documentElement.classList.toggle("embed", isEmbed);
} catch {}

// 画面が縦長（スマホ想定）なら portrait モードにする
// - URLに ?portrait=1 / ?landscape=1 で強制も可能
function updateViewportModeClass() {
  try {
    const qs = new URLSearchParams(location.search);
    const forcedPortrait = qs.get("portrait") === "1";
    const forcedLandscape = qs.get("landscape") === "1";
    // 埋め込み先には見出しやCTAが同居するため、指定がない場合は横長のコンパクト表示を優先する。
    const portrait =
      forcedPortrait ||
      (!isEmbed &&
        !forcedLandscape &&
        (window.matchMedia?.("(orientation: portrait)")?.matches ?? (innerHeight >= innerWidth)));
    document.documentElement.classList.toggle("portrait", !!portrait);
  } catch {}
}
updateViewportModeClass();
let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(updateViewportModeClass, 120);
});

const statusEl = document.getElementById("status");
const setStatus = (m) => (statusEl.textContent = m);

window.addEventListener("error", (e) => setStatus(`ERROR: ${e.message}`));
window.addEventListener("unhandledrejection", (e) =>
  setStatus(`PROMISE ERROR: ${e.reason?.message ?? e.reason}`)
);

// ① 即起動（ルール画面 & START無効）
setStatus("LOADING...");
const game = startGame();

// ② 3秒以内保証：2.2秒で必ずSTART解禁（画像ゼロでも開始OK）
let unlocked = false;
const unlockStart = () => {
  if (unlocked) return;
  unlocked = true;
  game.setReady(true);
  setStatus("READY");
};
setTimeout(unlockStart, 2200);

// ③ ゲーム開始と同時に、レアキャラ画像を「1枚だけ」バックで取得しておく（開始は待たない）
(async () => {
  const url = await getRandomGenerationCharacterUrl({
    preferCache: true,
    folderSample: 24,
    perFolderMaxResults: 32,
    maxFolderTries: 10,
  });
  if (!url) return;
  game.setRareCharacterUrl(url);
})();
