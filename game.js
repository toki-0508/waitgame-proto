// game.js

/**
 * @typedef {"landscape" | "portrait"} ViewportProfile
 *
 * @typedef {Object} ViewportTune
 * @property {number} BASE_W
 * @property {number} BASE_H
 * @property {number} PLAYER_SPEED_MUL
 * @property {number} PLAYER_SIZE_MUL
 * @property {number} ITEM_SIZE_MUL
 * @property {number} FALL_SPEED_MUL
 * @property {number} SPAWN_INTERVAL_MUL
 * @property {number} BOMB_RATE_MUL
 * @property {number} SAFE_TIME_MUL
 *
 * @typedef {Object} CharacterDef
 * @property {string} id
 * @property {string} label
 * @property {string|null} src
 * @property {number} spawnWeight
 * @property {number} points
 * @property {boolean=} isRare
 *
 * @typedef {Object} SpriteSlot
 * @property {HTMLImageElement|null} img
 * @property {boolean} ready
 * @property {boolean=} loading
 * @property {string|null} src
 */

export function startGame() {
  const parentWindow = window.parent && window.parent !== window ? window.parent : null;
  const parentOrigin = (() => {
    // iframe 埋め込み時は referrer から親originを推定して、postMessage の targetOrigin を絞る
    try {
      if (!parentWindow) return null;
      if (!document.referrer) return null;
      return new URL(document.referrer).origin;
    } catch {
      return null;
    }
  })();
  const ALLOWED_PARENT_ORIGIN = parentOrigin ?? "*";

  const MESSAGE = {
    RESIZE: "RESIZE",
    SCORE: "SCORE",
    GAME_OVER: "GAME_OVER",
    WAIT_DONE: "WAIT_DONE",
    WAIT_DONE_ACK: "WAIT_DONE_ACK",
  };

  /* ==========================
     ここは後で調整するパラメータ
     ========================== */
  /** @type {Record<ViewportProfile, ViewportTune>} */
  const PROFILE_TUNING = {
    // 画面の縦横（PC/スマホ）で “ゲーム内の体感” を合わせるための倍率群
    // - 画面比率自体は CSS 側（style.css）の `html.portrait` で切り替え
    // - ここは「落下の速さ」「生成間隔」「操作感」などのゲームパラメータ調整
    // PC（横長）想定
    landscape: {
      BASE_W: 720,
      BASE_H: 405,
      PLAYER_SPEED_MUL: 1.0,
      PLAYER_SIZE_MUL: 1.0,
      ITEM_SIZE_MUL: 1.0,
      FALL_SPEED_MUL: 1.0,
      SPAWN_INTERVAL_MUL: 1.0,
      BOMB_RATE_MUL: 1.0,
      SAFE_TIME_MUL: 1.0,
    },
    // スマホ（縦長）想定
    portrait: {
      BASE_W: 405,
      BASE_H: 720,
      PLAYER_SPEED_MUL: 0.92,
      PLAYER_SIZE_MUL: 0.92,
      ITEM_SIZE_MUL: 0.90,
      FALL_SPEED_MUL: 1.45,
      SPAWN_INTERVAL_MUL: 1.20,
      BOMB_RATE_MUL: 0.95,
      SAFE_TIME_MUL: 1.15,
    },
  };

  /** @returns {ViewportProfile} */
  function detectViewportProfile() {
    const qs = new URLSearchParams(location.search);
    if (qs.get("portrait") === "1") return "portrait";
    if (qs.get("landscape") === "1") return "landscape";
    if (document.documentElement.classList.contains("portrait")) return "portrait";
    return "landscape";
  }

  /** @type {ViewportProfile} */
  let viewportProfile = detectViewportProfile();
  let TUNE = PROFILE_TUNING[viewportProfile] ?? PROFILE_TUNING.landscape;
  let BASE_W = TUNE.BASE_W;
  let BASE_H = TUNE.BASE_H;

  const CONFIG = {
    DIFFICULTY: {
      SECONDS_TO_MAX: 60,
    },
    PLAYER: {
      WIDTH: 112,
      HEIGHT: 26,
      Y_RATIO: 0.82,
      SPEED: 520,
      FOLLOW: 14,
      FRICTION: 10,
    },
    SPAWN: {
      INTERVAL_SEC_BASE: 0.42,
      INTERVAL_SEC_DECAY: 0.16,
      INTERVAL_SEC_MIN: 0.18,
    },
    BOMB: {
      SAFE_TIME_SEC: 3.0,
      RATE_BASE: 0.22,
      RATE_ADD_BY_DIFFICULTY: 0.22,
      SIZE_MIN: 28,
      SIZE_MAX: 44,
    },
    CHARA: {
      SIZE_MIN: 50,
      SIZE_MAX: 96,
      MISS_PENALTY_POINTS: 1,
    },
    FALL: {
      // 「降ってくる速さ」全体の倍率（80%なら 0.8）
      GLOBAL_SPEED_MUL: 0.8,
      SPEED_BASE: 190,
      SPEED_ADD_BY_DIFFICULTY: 110,
      SPEED_ADD_BY_SCORE_FACTOR: 1.2,
      SPEED_ADD_BY_SCORE_CAP: 120,
      SPEED_JITTER_MIN: -20,
      SPEED_JITTER_MAX: 25,
    },
    HUD: {
      POST_SCORE_EVERY_POINTS: 25,
    },
    RARE: {
      SPAWN_WEIGHT: 0.1,
      POINTS: 100,
      SPARKLE_ENABLED: true,
      SPARKLE_COUNT: 10,
      SPARKLE_RADIUS: 18,
      SPARKLE_ALPHA: 0.85,
    },
  };

  /** @type {CharacterDef[]} */
  const LOCAL_CHARACTERS = [
    { id: "character1", label: "お化けちゃん", src: "./img/character1.png", spawnWeight: 1.0, points: 5 },
    { id: "character2", label: "ねこちゃん", src: "./img/character2.png", spawnWeight: 1.0, points: 5 },
    { id: "character3", label: "ウーパールーパー", src: "./img/character3.png", spawnWeight: 1.0, points: 5 },
    { id: "character4", label: "腹巻太郎", src: "./img/character4.png", spawnWeight: 0.9, points: 10 },
    { id: "character5", label: "ウバメザメ", src: "./img/character5.png", spawnWeight: 0.9, points: 10 },
    { id: "character6", label: "ほのおくん", src: "./img/character6.png", spawnWeight: 0.8, points: 10 },
    { id: "character7", label: "ブラックスター", src: "./img/character7.png", spawnWeight: 0.8, points: 15 },
    { id: "character8", label: "魔法使い", src: "./img/character8.png", spawnWeight: 0.7, points: 15 },
    { id: "character9", label: "ねこメガネ", src: "./img/character9.png", spawnWeight: 0.6, points: 15 },
  ];

  /** @type {CharacterDef} */
  const RARE_CHARACTER = {
    id: "rare",
    label: "レア",
    src: null,
    spawnWeight: CONFIG.RARE.SPAWN_WEIGHT,
    points: CONFIG.RARE.POINTS,
    isRare: true,
  };

  const canvas = document.getElementById("c");
  const scoreEl = document.getElementById("score");
  const statusEl = document.getElementById("status");
  const overlayEl = document.getElementById("overlay");
  const containerEl = document.getElementById("container");
  if (!(canvas instanceof HTMLCanvasElement) || !scoreEl || !statusEl || !overlayEl || !containerEl) {
    throw new Error("Game UI elements are missing.");
  }

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D context is not available.");

  // ===== 背景：img/background.png =====
  const bg = new Image();
  let bgReady = false;
  bg.onload = () => (bgReady = true);
  bg.onerror = () => (bgReady = false);
  bg.src = "./img/background.png";

  // ===== iframe resize =====
  function postToParent(type, payload = {}) {
    if (!window.parent || window.parent === window) return;
    window.parent.postMessage({ type, payload }, ALLOWED_PARENT_ORIGIN);
  }
  function sendResize() {
    const rect = containerEl.getBoundingClientRect();
    postToParent(MESSAGE.RESIZE, {
      height: Math.ceil(rect.height),
      width: Math.ceil(rect.width),
      profile: viewportProfile,
      aspectRatio: `${BASE_W} / ${BASE_H}`,
    });
  }
  const ro = new ResizeObserver(() => sendResize());
  ro.observe(containerEl);
  setTimeout(sendResize, 0);

  // ===== 状態 =====
  let running = false;
  let ready = false;
  let stopped = false;
  let lastTs = 0;

  let score = 0;
  let safeTime = 0;
  let lastPostedScore = 0;
  const MOVE_KEYS = new Set(["ArrowLeft", "ArrowRight", "a", "A", "d", "D"]);

  const player = {
    x: 0,
    y: 0,
    w: CONFIG.PLAYER.WIDTH,
    h: CONFIG.PLAYER.HEIGHT,
    vx: 0,
  };

  const drops = [];
  let spawnTimer = 0;
  let elapsedRun = 0;

  const collected = new Map(); // id -> count

  overlayEl.style.pointerEvents = "none";

  function applyViewport(profile) {
    viewportProfile = profile;
    TUNE = PROFILE_TUNING[viewportProfile] ?? PROFILE_TUNING.landscape;
    BASE_W = TUNE.BASE_W;
    BASE_H = TUNE.BASE_H;

    configureCanvasResolution();

    player.w = CONFIG.PLAYER.WIDTH * TUNE.PLAYER_SIZE_MUL;
    player.h = CONFIG.PLAYER.HEIGHT * TUNE.PLAYER_SIZE_MUL;
    player.y = BASE_H * CONFIG.PLAYER.Y_RATIO;

    // ルール画面中の回転/リサイズは見た目だけ合わせる（プレイ中は変えない）
    resetWorld();
  }

  function configureCanvasResolution() {
    const canvasScale = clamp(window.devicePixelRatio || 1, 1, 3);
    canvas.width = Math.round(BASE_W * canvasScale);
    canvas.height = Math.round(BASE_H * canvasScale);
    canvas.style.aspectRatio = `${BASE_W} / ${BASE_H}`;
    ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
  }

  // ===== 入力 =====
  const input = { left: false, right: false, targetX: null };

  function setTargetFromClientX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const nx = (clientX - rect.left) / rect.width;
    input.targetX = clamp(nx, 0, 1) * BASE_W;
  }

  function pointerToCanvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * BASE_W,
      y: ((e.clientY - rect.top) / rect.height) * BASE_H,
    };
  }

  function rectContainsPoint(rect, point) {
    return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
  }

  function updateMoveKey(key, pressed) {
    if (key === "ArrowLeft" || key === "a" || key === "A") input.left = pressed;
    if (key === "ArrowRight" || key === "d" || key === "D") input.right = pressed;
  }

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    setTargetFromClientX(e.clientX);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.buttons) setTargetFromClientX(e.clientX);
  });
  canvas.addEventListener("pointerup", () => (input.targetX = null));

  canvas.addEventListener("click", (e) => {
    if (stopped || running || !ready) return;
    if (rectContainsPoint(getStartButtonRect(), pointerToCanvasPoint(e))) startRun();
  });

  window.addEventListener("keydown", (e) => {
    if (!MOVE_KEYS.has(e.key)) return;
    e.preventDefault();
    updateMoveKey(e.key, true);
  });
  window.addEventListener("keyup", (e) => {
    if (!MOVE_KEYS.has(e.key)) return;
    e.preventDefault();
    updateMoveKey(e.key, false);
  });

  // ===== 親→子：待ち終了 =====
  window.addEventListener("message", (ev) => {
    // 親以外からの message は無視（WAIT_DONE などの誤作動防止）
    if (parentWindow && ev.source !== parentWindow) return;
    if (parentOrigin && ev.origin !== parentOrigin) return;

    const data = ev.data;
    if (!data || typeof data !== "object") return;
    if (data.type === MESSAGE.WAIT_DONE) {
      stopped = true;
      showOverlayDone("待ちが完了しました");
    }
  });

  // 画面の縦横が変わったら、ルール画面中のみ追従（プレイ中は触らない）
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (running) return;
      const p = detectViewportProfile();
      if (p !== viewportProfile) applyViewport(p);
    }, 120);
  });

  // ===== 画像ロード（ローカル9枚 + レア1枚）=====
  /** @type {Map<string, SpriteSlot>} */
  const sprites = new Map(); // id -> { img, ready, loading?, src }

  /** @param {CharacterDef} def @returns {SpriteSlot} */
  function ensureSprite(def) {
    if (!sprites.has(def.id)) sprites.set(def.id, { img: null, ready: false, src: def.src });
    return sprites.get(def.id);
  }

  function loadImage(url) {
    return new Promise((resolve) => {
      if (!url) return resolve(null);
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  async function beginLoad(def) {
    const slot = ensureSprite(def);
    if (slot.ready || slot.loading) return;
    slot.loading = true;
    slot.src = def.src;
    const img = await loadImage(def.src);
    slot.img = img;
    slot.ready = !!img;
    slot.loading = false;
  }

  for (const def of LOCAL_CHARACTERS) beginLoad(def);

  async function setRareCharacterUrl(url) {
    if (!url) return;
    RARE_CHARACTER.src = url;
    const slot = ensureSprite(RARE_CHARACTER);
    if (slot.src === url && slot.ready) return;
    slot.ready = false;
    slot.img = null;
    slot.src = url;
    const img = await loadImage(url);
    slot.img = img;
    slot.ready = !!img;
    characterPool.rebuild();
  }

  function getAssetStatus() {
    let localReady = 0;
    for (const def of LOCAL_CHARACTERS) {
      const s = sprites.get(def.id);
      if (s?.ready) localReady++;
    }
    const rareReady = !!sprites.get(RARE_CHARACTER.id)?.ready;
    return { localReady, localTotal: LOCAL_CHARACTERS.length, rareReady };
  }

  // ===== ゲームロジック =====
  function difficulty01() {
    return clamp(elapsedRun / CONFIG.DIFFICULTY.SECONDS_TO_MAX, 0, 1);
  }

  function bombRate() {
    if (safeTime > 0) return 0;
    const d = difficulty01();
    return (CONFIG.BOMB.RATE_BASE + d * CONFIG.BOMB.RATE_ADD_BY_DIFFICULTY) * TUNE.BOMB_RATE_MUL;
  }

  function spawnIntervalSec() {
    const d = difficulty01();
    const base = CONFIG.SPAWN.INTERVAL_SEC_BASE - d * CONFIG.SPAWN.INTERVAL_SEC_DECAY;
    const interval = base * TUNE.SPAWN_INTERVAL_MUL;
    return Math.max(CONFIG.SPAWN.INTERVAL_SEC_MIN * TUNE.SPAWN_INTERVAL_MUL, interval);
  }

  function fallSpeed(scoreNow) {
    const d = difficulty01();
    const addByScore = Math.min(scoreNow * CONFIG.FALL.SPEED_ADD_BY_SCORE_FACTOR, CONFIG.FALL.SPEED_ADD_BY_SCORE_CAP);
    const v = CONFIG.FALL.SPEED_BASE + d * CONFIG.FALL.SPEED_ADD_BY_DIFFICULTY + addByScore;
    return v * TUNE.FALL_SPEED_MUL * CONFIG.FALL.GLOBAL_SPEED_MUL;
  }

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }
  function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
    return Math.abs(ax - bx) * 2 < aw + bw && Math.abs(ay - by) * 2 < ah + bh;
  }

  /**
   * 出現候補（通常9体 + 読み込み完了したレア）を重み付きで選ぶためのプール
   * - rare の読み込み完了タイミングで rebuild() する
   */
  const characterPool = createWeightedCharacterPool();

  function createWeightedCharacterPool() {
    /** @type {{def: CharacterDef, cumulative: number}[]} */
    let cumulative = [];
    let total = 0;

    function rebuild() {
      const candidates = [];

      for (const d of LOCAL_CHARACTERS) {
        const w = Math.max(0, d.spawnWeight ?? 0);
        if (w <= 0) continue;
        candidates.push(d);
      }

      const rareSlot = sprites.get(RARE_CHARACTER.id);
      if (rareSlot?.ready) {
        const w = Math.max(0, RARE_CHARACTER.spawnWeight ?? 0);
        if (w > 0) candidates.push(RARE_CHARACTER);
      }

      cumulative = [];
      total = 0;
      for (const def of candidates) {
        total += Math.max(0, def.spawnWeight ?? 0);
        cumulative.push({ def, cumulative: total });
      }
    }

    function pick() {
      if (total <= 0) return null;
      const r = Math.random() * total;
      for (const it of cumulative) {
        if (r <= it.cumulative) return it.def;
      }
      return cumulative[cumulative.length - 1]?.def ?? null;
    }

    rebuild();
    return { rebuild, pick };
  }

  function createDropBase(size) {
    return {
      x: rand(size / 2, BASE_W - size / 2),
      y: -size,
      w: size,
      h: size,
      vy: fallSpeed(score) + rand(CONFIG.FALL.SPEED_JITTER_MIN, CONFIG.FALL.SPEED_JITTER_MAX),
      rot: rand(-0.6, 0.6),
      t: 0,
    };
  }

  function spawnDrop() {
    const isBomb = Math.random() < bombRate();
    const sizeMul = TUNE.ITEM_SIZE_MUL;
    const size = isBomb
      ? rand(CONFIG.BOMB.SIZE_MIN * sizeMul, CONFIG.BOMB.SIZE_MAX * sizeMul)
      : rand(CONFIG.CHARA.SIZE_MIN * sizeMul, CONFIG.CHARA.SIZE_MAX * sizeMul);

    if (isBomb) {
      drops.push({
        ...createDropBase(size),
        type: "bomb",
      });
      return;
    }

    const def = characterPool.pick();
    const spriteSlot = def ? sprites.get(def.id) : null;

    drops.push({
      ...createDropBase(size),
      type: "chara",
      charaId: def?.id ?? "unknown",
      label: def?.label ?? "unknown",
      points: def?.points ?? 1,
      isRare: !!def?.isRare,
      src: def?.src ?? null,
      sprite: spriteSlot?.ready ? spriteSlot.img : null,
    });
  }

  function resetWorld() {
    setScore(0);
    lastPostedScore = 0;
    collected.clear();
    drops.length = 0;
    spawnTimer = 0;
    elapsedRun = 0;
    safeTime = CONFIG.BOMB.SAFE_TIME_SEC * TUNE.SAFE_TIME_MUL;

    player.x = BASE_W * 0.5;
    player.vx = 0;
    lastTs = 0;
  }

  function startRun() {
    if (stopped) return;
    overlayEl.style.display = "none";
    overlayEl.style.pointerEvents = "none";
    resetWorld();
    statusEl.textContent = "RUNNING";
    running = true;
  }

  function addCollected(charaId, points) {
    const prev = collected.get(charaId) ?? 0;
    collected.set(charaId, prev + 1);
    setScore(score + points);

    if (score - lastPostedScore >= CONFIG.HUD.POST_SCORE_EVERY_POINTS) {
      lastPostedScore = score;
      postToParent(MESSAGE.SCORE, { score });
    }
  }

  function setScore(nextScore) {
    score = Math.max(0, nextScore | 0);
    scoreEl.textContent = `SCORE: ${score}`;
  }

  function update(dt) {
    elapsedRun += dt;
    safeTime = Math.max(0, safeTime - dt);

    // プレイヤー移動（滑らか）
    const speed = CONFIG.PLAYER.SPEED * TUNE.PLAYER_SPEED_MUL;
    let targetV = 0;
    if (input.targetX != null) {
      const dx = input.targetX - player.x;
      targetV = clamp(dx / 70, -1, 1) * speed;
    } else {
      if (input.left) targetV -= speed;
      if (input.right) targetV += speed;
    }

    player.vx += (targetV - player.vx) * clamp(CONFIG.PLAYER.FOLLOW * dt, 0, 1);
    player.vx *= (1 - clamp(CONFIG.PLAYER.FRICTION * dt, 0, 0.6));
    player.x += player.vx * dt;
    player.x = clamp(player.x, player.w / 2, BASE_W - player.w / 2);

    // 生成
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnDrop();
      spawnTimer = spawnIntervalSec();
    }

    // 落下物更新
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.t += dt;
      d.y += d.vy * dt;

      if (aabb(player.x, player.y, player.w, player.h, d.x, d.y, d.w, d.h)) {
        if (d.type === "bomb") {
          showOverlayGameOver("爆弾に当たった！");
          return;
        }
        drops.splice(i, 1);
        addCollected(d.charaId, d.points);
        continue;
      }

      if (d.y - d.h / 2 > BASE_H + 10) {
        drops.splice(i, 1);
        if (d.type === "chara") {
          setScore(score - CONFIG.CHARA.MISS_PENALTY_POINTS);
        }
      }
    }
  }

  // ===== 描画 =====
  function drawBackground() {
    if (bgReady) {
      const cw = BASE_W;
      const ch = BASE_H;
      const iw = bg.naturalWidth || 1;
      const ih = bg.naturalHeight || 1;
      const s = Math.max(cw / iw, ch / ih);
      const dw = iw * s;
      const dh = ih * s;
      const dx = (cw - dw) / 2;
      const dy = (ch - dh) / 2;
      ctx.drawImage(bg, dx, dy, dw, dh);

      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(0, 0, BASE_W, BASE_H);
    } else {
      ctx.fillStyle = "#07080c";
      ctx.fillRect(0, 0, BASE_W, BASE_H);
    }
  }

  function drawSceneFrame() {
    const r = viewportProfile === "portrait" ? 18 : 16;
    ctx.save();
    ctx.lineWidth = viewportProfile === "portrait" ? 4 : 3;
    ctx.strokeStyle = "#fff";
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 8;
    strokeRoundRect(ctx, 2, 2, BASE_W - 4, BASE_H - 4, r);
    ctx.restore();
  }

  function drawComicTitle(text, x, y, size, align = "center") {
    ctx.save();
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.font = `900 ${size}px system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans JP", sans-serif`;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = Math.max(7, size * 0.18);
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 2;
    ctx.strokeText(text, x, y);
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#e90000";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawHudPanel(x, y, w, h, title, value, { accent = "#e90000", icon = "star", smallValue = false } = {}) {
    ctx.save();
    ctx.fillStyle = "rgba(255,250,241,0.96)";
    ctx.strokeStyle = "rgba(112,83,58,0.35)";
    ctx.lineWidth = 1.4;
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    roundRect(ctx, x, y, w, h, 13);
    ctx.shadowColor = "transparent";
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.font = `900 ${Math.max(12, h * 0.22)}px system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans JP", sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(title, x + w * 0.11, y + h * 0.34);

    if (icon === "star") drawSimpleStar(x + w - h * 0.30, y + h * 0.26, h * 0.11, h * 0.22, "#ffd64f");
    if (icon === "shield") drawShieldIcon(x + w - h * 0.31, y + h * 0.58, h * 0.22);
    if (icon === "clock") drawClockIcon(x + w * 0.17, y + h * 0.64, h * 0.16);

    ctx.fillStyle = "#2b211b";
    ctx.font = `900 ${smallValue ? h * 0.25 : h * 0.39}px system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans JP", sans-serif`;
    ctx.textAlign = icon === "clock" ? "right" : "left";
    const valueX = icon === "clock" ? x + w * 0.86 : x + w * 0.10;
    ctx.fillText(value, valueX, y + h * 0.76);
    ctx.restore();
  }

  function drawGameHud() {
    const top = viewportProfile === "portrait" ? 14 : 14;
    if (viewportProfile === "portrait") {
      drawHudPanel(12, top, 108, 56, "SCORE", padScore(score), { accent: "#e90000", icon: "star" });
      drawHudPanel(BASE_W / 2 - 60, top, 120, 58, "TIME", elapsedRun.toFixed(1).padStart(4, "0"), {
        accent: "#2b211b",
        icon: "clock",
      });
      drawHudPanel(BASE_W - 120, top, 108, 56, "STATUS", safeTime > 0 ? "安全時間" : difficultyLabel(), {
        accent: "#e90000",
        icon: safeTime > 0 ? "shield" : "star",
        smallValue: true,
      });
      return;
    }

    drawHudPanel(14, 14, 118, 58, "SCORE", padScore(score), { accent: "#e90000", icon: "star" });
    drawHudPanel(BASE_W - 144, 14, 130, 54, "STATUS", safeTime > 0 ? `SAFE ${safeTime.toFixed(1)}` : difficultyLabel(), {
      accent: "#2b211b",
      icon: safeTime > 0 ? "shield" : "star",
      smallValue: true,
    });
  }

  function difficultyLabel() {
    const d = difficulty01();
    if (d < 0.35) return "やさしい";
    if (d < 0.72) return "ふつう";
    return "むずかしい";
  }

  function padScore(v) {
    return String(Math.max(0, v | 0)).padStart(6, "0");
  }

  function getStartButtonRect() {
    const w = clamp(BASE_W * 0.30, 150, 240);
    const h = clamp(BASE_H * 0.075, 44, 62);
    const bottomPad = clamp(BASE_H * 0.14, 72, 132);
    return { x: BASE_W / 2 - w / 2, y: BASE_H - bottomPad - h, w, h };
  }

  function drawRulesScreen() {
    drawSceneFrame();
    drawStartDecorations();

    if (viewportProfile === "portrait") {
      drawComicTitle("キャラ", BASE_W / 2, 72, 38);
      drawComicTitle("キャッチ!", BASE_W / 2, 112, 38);
      drawPillText(BASE_W * 0.18, 136, BASE_W * 0.64, 26, "生成中にあそべるミニゲーム！");
      drawPortraitRulesCard();
      drawStartButton();
      drawBottomOperationGuide();
      return;
    }

    drawHudPanel(14, 14, 118, 58, "SCORE", "000000", { accent: "#e90000", icon: "star" });
    drawHudPanel(BASE_W - 144, 15, 130, 54, "STATUS", `SAFE ${CONFIG.BOMB.SAFE_TIME_SEC.toFixed(1)}`, {
      accent: "#ff7a00",
      icon: "clock",
      smallValue: true,
    });
    drawComicTitle("キャラ", BASE_W / 2, 66, 42);
    drawComicTitle("キャッチ!", BASE_W / 2, 110, 42);
    drawPillText(BASE_W / 2 - 142, 130, 284, 27, "生成中にあそべるミニゲーム！");
    drawLandscapeRulesCard();
    drawStartButton();
  }

  function drawStartDecorations() {
    if (viewportProfile === "portrait") {
      drawStickerCharacter("character1", BASE_W * 0.11, BASE_H * 0.22, 44, -0.12);
      drawStickerCharacter("character4", BASE_W * 0.90, BASE_H * 0.23, 44, 0.10);
      drawStickerCharacter("character2", BASE_W * 0.10, BASE_H * 0.62, 44, 0.08);
      drawStickerCharacter("character9", BASE_W * 0.90, BASE_H * 0.61, 46, -0.08);
      drawSimpleStar(BASE_W * 0.24, 128, 5, 12, "#ffd64f");
      drawSimpleStar(BASE_W * 0.76, 128, 5, 12, "#ffd64f");
      drawSimpleStar(BASE_W * 0.82, BASE_H * 0.83, 5, 12, "#ffd64f");
      return;
    } else {
      drawStickerCharacter("character1", 78, 118, 42, -0.12);
      drawStickerCharacter("character2", 62, 226, 44, 0.08);
      drawStickerCharacter("character4", BASE_W - 105, 126, 48, 0.10);
      drawStickerCharacter("character6", BASE_W - 54, 122, 50, 0.14);
      drawStickerCharacter("character9", BASE_W - 74, 235, 50, -0.08);
      drawStickerCharacter("character8", BASE_W - 106, 318, 42, 0.10);
    }

    drawSimpleStar(BASE_W * 0.23, BASE_H * 0.16, 6, 14, "#ffd64f");
    drawSimpleStar(BASE_W * 0.74, BASE_H * 0.16, 6, 14, "#ffd64f");
    drawSimpleStar(BASE_W * 0.84, BASE_H * 0.84, 5, 12, "#ffd64f");
    drawComicMark(BASE_W * 0.33, BASE_H * 0.16, 20, -0.7);
    drawComicMark(BASE_W * 0.69, BASE_H * 0.20, 18, 0.8);
  }

  function drawLandscapeRulesCard() {
    const x = 126;
    const y = 164;
    const w = BASE_W - x * 2;
    const h = 114;
    drawCreamPanel(x, y, w, h, 15);

    ctx.save();
    ctx.strokeStyle = "rgba(217,171,102,0.34)";
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + 14);
    ctx.lineTo(x + w / 2, y + h - 14);
    ctx.moveTo(x + 16, y + h / 2);
    ctx.lineTo(x + w - 16, y + h / 2);
    ctx.stroke();
    ctx.restore();

    const cellW = w / 2;
    const cellH = h / 2;
    drawRuleItem(x + 36, y + 32, "★", "#ffd64f", "キャラをキャッチ！", "+ポイント。高得点をめざそう！", {
      maxTextWidth: cellW - 74,
    });
    drawRuleItem(x + cellW + 36, y + 32, "☠", "#2d2d2d", "ボムは避ける！", "当たるとゲームオーバー！", {
      maxTextWidth: cellW - 74,
    });
    drawRuleItem(x + 36, y + cellH + 32, "💧", "#42a9e8", "取り逃しは減点", "落とすと少しだけ減点。", {
      maxTextWidth: cellW - 74,
    });
    drawRuleItem(x + cellW + 36, y + cellH + 32, "盾", "#4aa34a", "最初の5秒は安全", "ボムなしでプレイ開始。", {
      maxTextWidth: cellW - 74,
    });
  }

  function drawPortraitRulesCard() {
    const x = 22;
    const y = 180;
    const w = BASE_W - 44;
    const h = 224;
    drawCreamPanel(x, y, w, h, 13);
    drawRuleItem(x + 26, y + 38, "★", "#ffd64f", "キャラをキャッチで+ポイント！", "いろんなキャラを集めよう！");
    drawRuleItem(x + 26, y + 90, "☠", "#2d2d2d", "ボムは絶対にキャッチしない！", "当たるとゲームオーバー！");
    drawRuleItem(x + 26, y + 142, "💧", "#42a9e8", "取り逃すと少しだけ減点…", "落ちたキャラは少し減点！");
    drawRuleItem(x + 26, y + 194, "盾", "#4aa34a", "最初の5秒はセーフタイム！", "安心してスタートできるよ！");
  }

  function drawStartButton() {
    const b = getStartButtonRect();
    ctx.save();
    ctx.globalAlpha = ready ? 1 : 0.5;
    ctx.fillStyle = "#fff";
    roundRect(ctx, b.x - 4, b.y - 4, b.w + 8, b.h + 8, b.h / 2 + 4);
    const grad = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
    grad.addColorStop(0, "#ff1717");
    grad.addColorStop(1, "#d40000");
    ctx.fillStyle = grad;
    roundRect(ctx, b.x, b.y, b.w, b.h, b.h / 2);
    ctx.strokeStyle = "rgba(80,20,20,0.25)";
    ctx.lineWidth = 2;
    strokeRoundRect(ctx, b.x, b.y, b.w, b.h, b.h / 2);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${Math.min(28, b.h * 0.52)}px system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans JP", sans-serif`;
    ctx.fillText(ready ? "START!" : "LOADING...", b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.restore();
  }

  function drawBottomOperationGuide() {
    if (viewportProfile === "portrait") {
      drawPortraitOperationGuide();
      return;
    }

    const h = 96;
    const y = BASE_H - h;
    ctx.fillStyle = "rgba(255,250,241,0.98)";
    ctx.fillRect(0, y, BASE_W, h);
    ctx.strokeStyle = "rgba(80,55,35,0.16)";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(BASE_W, y);
    ctx.stroke();
    drawOperationMini(BASE_W * 0.22, y + 48, "スワイプ / ドラッグ", "左右に動かそう！");
    drawOperationMini(BASE_W * 0.72, y + 48, "A / D", "または左右に動かそう！");
  }

  function drawPortraitOperationGuide() {
    const h = 88;
    const y = BASE_H - h;
    ctx.save();
    ctx.fillStyle = "rgba(255,250,241,0.98)";
    ctx.fillRect(0, y, BASE_W, h);
    ctx.strokeStyle = "rgba(80,55,35,0.16)";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(BASE_W, y);
    ctx.stroke();

    ctx.strokeStyle = "#e90000";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(38, y + 24);
    ctx.lineTo(92, y + 24);
    ctx.stroke();
    ctx.fillStyle = "#e90000";
    ctx.font = "900 24px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("↔", 65, y + 24);

    drawKeycap(292, y + 42, "A");
    drawKeycap(326, y + 42, "D");

    ctx.fillStyle = "#2b211b";
    ctx.textAlign = "left";
    ctx.font = "900 16px system-ui, -apple-system, Segoe UI, Roboto, 'Noto Sans JP', sans-serif";
    ctx.fillText("スワイプ / ドラッグ", 104, y + 30);
    ctx.font = "800 13px system-ui, -apple-system, Segoe UI, Roboto, 'Noto Sans JP', sans-serif";
    ctx.fillText("または A / D で左右に動こう！", 104, y + 58);
    ctx.restore();
  }

  function drawCreamPanel(x, y, w, h, r) {
    ctx.save();
    ctx.fillStyle = "rgba(255,250,241,0.96)";
    ctx.strokeStyle = "rgba(210,166,106,0.42)";
    ctx.lineWidth = 1.5;
    ctx.shadowColor = "rgba(0,0,0,0.20)";
    ctx.shadowBlur = 9;
    ctx.shadowOffsetY = 4;
    roundRect(ctx, x, y, w, h, r);
    ctx.shadowColor = "transparent";
    ctx.stroke();
    ctx.restore();
  }

  function drawPillText(x, y, w, h, text) {
    ctx.save();
    ctx.fillStyle = "rgba(255,250,241,0.94)";
    ctx.strokeStyle = "rgba(217,171,102,0.35)";
    ctx.lineWidth = 1.2;
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.stroke();
    drawSimpleStar(x + 24, y + h / 2, 4, 9, "#ffd64f");
    drawSimpleStar(x + w - 24, y + h / 2, 4, 9, "#ffd64f");
    ctx.fillStyle = "#2b211b";
    ctx.font = `900 ${Math.max(13, h * 0.46)}px system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans JP", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + w / 2, y + h / 2 + 1);
    ctx.restore();
  }

  function drawRuleItem(x, y, icon, iconColor, title, body, options = {}) {
    ctx.save();
    const isPortrait = viewportProfile === "portrait";
    const iconSize = isPortrait ? 22 : 23;
    if (icon === "盾") drawShieldIcon(x, y - 2, iconSize * 0.78);
    else if (icon === "☠") drawBomb(x, y, iconSize * 1.45);
    else if (icon === "★") drawSimpleStar(x, y, iconSize * 0.35, iconSize * 0.72, iconColor);
    else {
      ctx.font = `900 ${iconSize}px system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans JP", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = iconColor;
      ctx.fillText(icon, x, y);
    }

    const tx = x + (viewportProfile === "portrait" ? 34 : 40);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = title.includes("ボム") ? "#e90000" : title.includes("セーフ") || title.includes("安全") ? "#318c35" : "#2b211b";
    ctx.font = `900 ${isPortrait ? 13 : 12}px system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans JP", sans-serif`;
    drawSingleLineText(title, tx, y - 4, options.maxTextWidth);
    ctx.fillStyle = "#2b211b";
    ctx.font = `700 ${isPortrait ? 11 : 10}px system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans JP", sans-serif`;
    drawWrappedText(body, tx, y + 15, options.maxTextWidth, isPortrait ? 14 : 12, 2);
    ctx.restore();
  }

  function drawSingleLineText(text, x, y, maxWidth) {
    if (!maxWidth) {
      ctx.fillText(text, x, y);
      return;
    }
    ctx.fillText(text, x, y, maxWidth);
  }

  function drawWrappedText(text, x, y, maxWidth, lineHeight, maxLines = 2) {
    if (!maxWidth) {
      ctx.fillText(text, x, y);
      return;
    }

    const lines = [];
    let line = "";
    for (const char of text) {
      const nextLine = line + char;
      if (ctx.measureText(nextLine).width > maxWidth && line) {
        lines.push(line);
        line = char;
        if (lines.length >= maxLines) break;
      } else {
        line = nextLine;
      }
    }
    if (line && lines.length < maxLines) lines.push(line);

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, y + i * lineHeight, maxWidth);
    }
  }

  function drawStickerCharacter(id, x, y, maxSize, rot = 0) {
    const slot = sprites.get(id);
    const img = slot?.img;
    if (!img) return;
    const { dw, dh } = fitImageToBox(img, maxSize, maxSize);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.shadowColor = "rgba(0,0,0,0.30)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }

  function drawComicMark(x, y, size, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-size * 0.6, -size * 0.4);
    ctx.lineTo(size * 0.5, size * 0.45);
    ctx.moveTo(-size * 0.35, size * 0.6);
    ctx.lineTo(size * 0.62, size * 0.92);
    ctx.stroke();
    ctx.strokeStyle = "#2b211b";
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.restore();
  }

  function drawOperationMini(x, y, title, body) {
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    if (title.includes("A")) {
      drawKeycap(x - 52, y - 4, "A");
      drawKeycap(x - 16, y - 4, "D");
      x += 28;
    } else {
      ctx.strokeStyle = "#e90000";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 58, y - 18);
      ctx.lineTo(x - 24, y - 18);
      ctx.stroke();
      ctx.fillStyle = "#e90000";
      ctx.font = "900 22px system-ui";
      ctx.fillText("↔", x - 60, y - 18);
      x -= 10;
    }
    ctx.fillStyle = "#2b211b";
    ctx.font = "900 15px system-ui, -apple-system, Segoe UI, Roboto, 'Noto Sans JP', sans-serif";
    ctx.fillText(title, x, y - 12);
    ctx.font = "800 13px system-ui, -apple-system, Segoe UI, Roboto, 'Noto Sans JP', sans-serif";
    ctx.fillText(body, x, y + 12);
    ctx.restore();
  }

  function drawKeycap(x, y, label) {
    ctx.save();
    ctx.fillStyle = "#3a3a3a";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    roundRect(ctx, x, y - 18, 28, 28, 5);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 16px system-ui";
    ctx.fillText(label, x + 14, y - 4);
    ctx.restore();
  }

  function drawPlayer() {
    const x = player.x - player.w / 2;
    const y = player.y - player.h / 2;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = "#fff";
    roundRect(ctx, x - 5, y - 5, player.w + 10, player.h + 10, player.h);
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#111";
    roundRect(ctx, x - 2, y - 2, player.w + 4, player.h + 4, player.h);
    ctx.fillStyle = "#fff";
    roundRect(ctx, x + 1, y + 1, player.w - 2, player.h - 2, player.h);
    const grad = ctx.createLinearGradient(x, y, x + player.w, y + player.h);
    grad.addColorStop(0, "#ff2a16");
    grad.addColorStop(1, "#f00000");
    ctx.fillStyle = grad;
    roundRect(ctx, x + 8, y + 6, player.w - 16, player.h - 12, player.h * 0.35);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#ffcc75";
    for (let sx = x + 12; sx < x + player.w - 12; sx += 16) {
      ctx.beginPath();
      ctx.moveTo(sx, y + 6);
      ctx.lineTo(sx + 8, y + 6);
      ctx.lineTo(sx - 1, y + player.h - 6);
      ctx.lineTo(sx - 9, y + player.h - 6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDropChara(d) {
    if (!d.sprite) {
      const slot = sprites.get(d.charaId);
      if (slot?.ready) d.sprite = slot.img;
    }

    drawFallLines(d.x, d.y, d.h);
    const hasSprite = !!d.sprite;
    if (hasSprite) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot * Math.sin(d.t * 3));
      const { dw, dh } = fitImageToBox(d.sprite, d.w, d.h);
      ctx.drawImage(d.sprite, -dw / 2, -dh / 2, dw, dh);

      if (d.isRare && CONFIG.RARE.SPARKLE_ENABLED) {
        drawSparkle(0, 0, d.w, d.t);
      }
      ctx.restore();
      return;
    }

    drawPlaceholderChara(d.x, d.y, d.w, d.isRare);
  }

  function drawFallLines(x, y, size) {
    ctx.save();
    ctx.globalAlpha = 0.52;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = Math.max(2, size * 0.035);
    ctx.lineCap = "round";
    for (let i = -1; i <= 1; i++) {
      const lx = x + i * size * 0.22;
      const top = y - size * 1.25 - Math.abs(i) * size * 0.18;
      const bottom = y - size * 0.58;
      ctx.beginPath();
      ctx.moveTo(lx, top);
      ctx.lineTo(lx, bottom);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSparkle(cx, cy, size, t) {
    const count = CONFIG.RARE.SPARKLE_COUNT;
    const baseR = CONFIG.RARE.SPARKLE_RADIUS + size * 0.12;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = CONFIG.RARE.SPARKLE_ALPHA;

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + t * 2.1;
      const r = baseR + Math.sin(t * 3 + i) * 3;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      const s = 2 + ((Math.sin(t * 6 + i * 1.7) + 1) * 0.5) * 2.8;

      const hue = 210 + (i * 18) % 90;
      ctx.fillStyle = `hsla(${hue} 100% 70% / 1)`;
      drawStar(x, y, s, s * 2.1, 4);
    }

    ctx.restore();
  }

  function drawStar(x, y, r0, r1, spikes) {
    const step = Math.PI / spikes;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? r1 : r0;
      const a = i * step;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }

  function fitImageToBox(img, boxW, boxH) {
    const iw = img?.naturalWidth ?? 0;
    const ih = img?.naturalHeight ?? 0;
    if (iw <= 0 || ih <= 0) return { dw: boxW, dh: boxH };

    const scale = Math.min(boxW / iw, boxH / ih);
    return { dw: iw * scale, dh: ih * scale };
  }

  function draw() {
    drawBackground();

    if (!running) {
      drawRulesScreen();
      return;
    }

    for (const d of drops) {
      if (d.type === "bomb") drawBomb(d.x, d.y, d.w);
      else drawDropChara(d);
    }

    drawPlayer();
    drawGameHud();
    drawSceneFrame();

    if (safeTime > 0) {
      drawPillText(BASE_W / 2 - 82, viewportProfile === "portrait" ? 82 : 78, 164, 24, "安全時間");
    }
  }

  // ===== overlay =====
  function showOverlayGameOver(msg) {
    running = false;
    statusEl.textContent = "GAME OVER";
    postToParent(MESSAGE.GAME_OVER, { score });

    overlayEl.style.display = "flex";
    overlayEl.style.pointerEvents = "auto";
    overlayEl.replaceChildren(buildResultCard(msg));
  }

  function showOverlayDone(msg) {
    running = false;
    statusEl.textContent = "DONE";
    postToParent(MESSAGE.WAIT_DONE_ACK, { score });

    overlayEl.style.display = "flex";
    overlayEl.style.pointerEvents = "auto";
    overlayEl.replaceChildren(buildResultCard(msg, { hideRetry: true }));
  }

  function buildResultCard(reason, { hideRetry = false } = {}) {
    const card = document.createElement("div");
    card.className = "overlayCard";

    const t = document.createElement("div");
    t.className = "overlayTitle";
    t.textContent = "ゲーム結果";
    card.appendChild(t);

    const sub = document.createElement("div");
    sub.className = "overlaySubtitle";
    sub.textContent = `${reason}　結果を確認してね。`;
    card.appendChild(sub);

    const table = document.createElement("table");
    table.className = "resultTable";
    table.appendChild(buildResultTableHead());

    const tbody = document.createElement("tbody");
    const rows = buildScoreRows();
    if (!rows.length) {
      const tr = document.createElement("tr");
      const td = createTableCell("まだ何も集められていない…", { className: "emptyResult", colSpan: 4 });
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      for (const r of rows) tbody.appendChild(r);
    }
    table.appendChild(tbody);

    const tableWrap = document.createElement("div");
    tableWrap.className = "resultTableWrap";
    tableWrap.appendChild(table);
    card.appendChild(tableWrap);

    const total = document.createElement("div");
    total.className = "resultTotal";
    const totalLabel = document.createElement("span");
    totalLabel.textContent = "合計スコア";
    const totalValue = document.createElement("strong");
    totalValue.textContent = `${score.toLocaleString()} pt`;
    total.append(totalLabel, totalValue);
    card.appendChild(total);

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "おつかれさまでした！集めたキャラのポイントを確認してね。";
    card.appendChild(hint);

    if (!hideRetry) {
      const row = document.createElement("div");
      row.className = "btnRow";
      const retry = document.createElement("button");
      retry.className = "btn";
      retry.type = "button";
      retry.textContent = "↻ もう一回";
      retry.addEventListener("click", () => startRun());
      row.appendChild(retry);
      card.appendChild(row);
    }

    return card;
  }

  function buildResultTableHead() {
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");
    tr.append(
      createTableHeader("キャラ"),
      createTableHeader("個数", { alignRight: true }),
      createTableHeader("pt/体", { alignRight: true }),
      createTableHeader("小計", { alignRight: true })
    );
    thead.appendChild(tr);
    return thead;
  }

  function createTableHeader(text, { alignRight = false } = {}) {
    const th = document.createElement("th");
    th.textContent = text;
    if (alignRight) th.className = "numericCell";
    return th;
  }

  function createTableCell(text, { alignRight = false, className = "", colSpan = 1 } = {}) {
    const td = document.createElement("td");
    td.textContent = text;
    if (className) td.className = className;
    if (alignRight) td.classList.add("numericCell");
    if (colSpan > 1) td.colSpan = colSpan;
    return td;
  }

  function buildScoreRows() {
    const defs = new Map();
    for (const d of LOCAL_CHARACTERS) defs.set(d.id, d);
    defs.set(RARE_CHARACTER.id, RARE_CHARACTER);

    const items = [];
    for (const [id, count] of collected.entries()) {
      if (!count) continue;
      const def = defs.get(id) ?? { id, label: id, points: 1, src: null };
      const pts = def.points ?? 1;
      items.push({
        id,
        label: def.label ?? id,
        points: pts,
        count,
        subtotal: pts * count,
        src: def.src,
      });
    }
    items.sort((a, b) => b.subtotal - a.subtotal);

    const rows = [];
    for (const it of items) {
      const tr = document.createElement("tr");

      const tdName = document.createElement("td");
      const nameWrap = document.createElement("div");
      nameWrap.className = "resultName";

      const img = document.createElement("img");
      img.className = "resultIcon";
      img.alt = it.label;
      if (it.src) img.src = it.src;
      nameWrap.appendChild(img);

      const nameText = document.createElement("div");
      nameText.textContent = it.label;
      nameWrap.appendChild(nameText);
      tdName.appendChild(nameWrap);

      const tdCount = createTableCell(String(it.count), { alignRight: true });
      const tdPts = createTableCell(String(it.points), { alignRight: true });
      const tdSub = createTableCell(String(it.subtotal), { alignRight: true });

      tr.appendChild(tdName);
      tr.appendChild(tdCount);
      tr.appendChild(tdPts);
      tr.appendChild(tdSub);
      rows.push(tr);
    }

    return rows;
  }

  // ===== helpers =====
  function drawBomb(x, y, size) {
    const r = size * 0.38;

    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.ellipse(x + r * 0.2, y + r * 0.25, r * 0.9, r * 0.75, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1d26";
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.88)";
    ctx.lineWidth = Math.max(2, size * 0.06);
    ctx.beginPath();
    ctx.moveTo(x + r * 0.2, y - r * 0.9);
    ctx.quadraticCurveTo(x + r * 0.7, y - r * 1.2, x + r * 0.9, y - r * 0.6);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,77,77,0.9)";
    ctx.beginPath();
    ctx.arc(x + r * 0.86, y - r * 0.6, Math.max(2, size * 0.06), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlaceholderChara(x, y, size, isRare) {
    const r = Math.max(8, size * 0.18);
    const hue = isRare ? 280 : (Math.floor(x * 3 + y * 5) % 360);

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#000";
    roundRect(ctx, x - size / 2 + 2, y - size / 2 + 3, size, size, r);
    ctx.globalAlpha = 1;

    const fill = isRare ? `hsl(${hue} 90% 72%)` : `hsl(${hue} 55% 65%)`;
    ctx.fillStyle = fill;
    roundRect(ctx, x - size / 2, y - size / 2, size, size, r);

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    const eyeY = y - size * 0.10;
    const eyeDX = size * 0.16;
    const eyeR = Math.max(1.5, size * 0.05);
    ctx.beginPath();
    ctx.arc(x - eyeDX, eyeY, eyeR, 0, Math.PI * 2);
    ctx.arc(x + eyeDX, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = Math.max(2, size * 0.06);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(x, y + size * 0.08, size * 0.16, 0, Math.PI);
    ctx.stroke();
  }

  function roundRect(ctx2, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx2.beginPath();
    ctx2.moveTo(x + rr, y);
    ctx2.arcTo(x + w, y, x + w, y + h, rr);
    ctx2.arcTo(x + w, y + h, x, y + h, rr);
    ctx2.arcTo(x, y + h, x, y, rr);
    ctx2.arcTo(x, y, x + w, y, rr);
    ctx2.closePath();
    ctx2.fill();
  }

  function strokeRoundRect(ctx2, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx2.beginPath();
    ctx2.moveTo(x + rr, y);
    ctx2.arcTo(x + w, y, x + w, y + h, rr);
    ctx2.arcTo(x + w, y + h, x, y + h, rr);
    ctx2.arcTo(x, y + h, x, y, rr);
    ctx2.arcTo(x, y, x + w, y, rr);
    ctx2.closePath();
    ctx2.stroke();
  }

  function drawSimpleStar(x, y, r0, r1, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = Math.max(2, r1 * 0.22);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? r1 : r0;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  function drawShieldIcon(x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#51ad45";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = Math.max(2, size * 0.15);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.82, -size * 0.55);
    ctx.lineTo(size * 0.68, size * 0.45);
    ctx.quadraticCurveTo(0, size, -size * 0.68, size * 0.45);
    ctx.lineTo(-size * 0.82, -size * 0.55);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    drawSimpleStar(0, -size * 0.10, size * 0.18, size * 0.40, "#fff");
    ctx.restore();
  }

  function drawClockIcon(x, y, size) {
    ctx.save();
    ctx.strokeStyle = "#2b211b";
    ctx.fillStyle = "#fff";
    ctx.lineWidth = Math.max(2, size * 0.14);
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - size * 0.62);
    ctx.moveTo(x, y);
    ctx.lineTo(x + size * 0.45, y + size * 0.18);
    ctx.stroke();
    ctx.fillStyle = "#e90000";
    ctx.beginPath();
    ctx.arc(x + size * 0.45, y + size * 0.18, size * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  // ===== 起動 =====
  applyViewport(viewportProfile);
  setScore(0);
  statusEl.textContent = "LOADING...";
  requestAnimationFrame(loop);

  function loop(ts) {
    if (stopped) return;
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.033, (ts - lastTs) / 1000);
    lastTs = ts;

    if (running) update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // 外部API
  return {
    setReady(v) {
      ready = !!v;
      if (ready) statusEl.textContent = "READY";
    },
    setRareCharacterUrl(url) {
      setRareCharacterUrl(url);
    },
    getAssetStatus() {
      return getAssetStatus();
    },
  };
}
