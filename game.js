// game.js
export function startGame() {
  const BASE_W = 720;
  const BASE_H = 405;
  const ALLOWED_PARENT_ORIGIN = "*";

  /* ==========================
     ここは後で調整するパラメータ
     ========================== */
  const CONFIG = {
    DIFFICULTY: {
      SECONDS_TO_MAX: 60,
    },
    PLAYER: {
      WIDTH: 52,
      HEIGHT: 18,
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
      SAFE_TIME_SEC: 1.0,
      RATE_BASE: 0.22,
      RATE_ADD_BY_DIFFICULTY: 0.22,
      SIZE_MIN: 28,
      SIZE_MAX: 44,
    },
    CHARA: {
      SIZE_MIN: 34,
      SIZE_MAX: 64,
      MISS_PENALTY_POINTS: 1,
    },
    FALL: {
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
      SPAWN_WEIGHT: 0.06,
      POINTS: 120,
      SPARKLE_ENABLED: true,
      SPARKLE_COUNT: 10,
      SPARKLE_RADIUS: 18,
      SPARKLE_ALPHA: 0.85,
    },
  };

  const LOCAL_CHARACTERS = [
    { id: "character1", label: "character1", src: "./img/character1.png", spawnWeight: 1.0, points: 10 },
    { id: "character2", label: "character2", src: "./img/character2.png", spawnWeight: 1.0, points: 10 },
    { id: "character3", label: "character3", src: "./img/character3.png", spawnWeight: 1.0, points: 10 },
    { id: "character4", label: "character4", src: "./img/character4.png", spawnWeight: 0.9, points: 12 },
    { id: "character5", label: "character5", src: "./img/character5.png", spawnWeight: 0.9, points: 12 },
    { id: "character6", label: "character6", src: "./img/character6.png", spawnWeight: 0.8, points: 14 },
    { id: "character7", label: "character7", src: "./img/character7.png", spawnWeight: 0.8, points: 14 },
    { id: "character8", label: "character8", src: "./img/character8.png", spawnWeight: 0.7, points: 16 },
    { id: "character9", label: "character9", src: "./img/character9.png", spawnWeight: 0.6, points: 18 },
  ];

  const RARE_CHARACTER = {
    id: "rare",
    label: "レア",
    src: null,
    spawnWeight: CONFIG.RARE.SPAWN_WEIGHT,
    points: CONFIG.RARE.POINTS,
    isRare: true,
  };

  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d", { alpha: false });

  const scoreEl = document.getElementById("score");
  const statusEl = document.getElementById("status");
  const overlayEl = document.getElementById("overlay");
  const containerEl = document.getElementById("container");

  canvas.width = BASE_W;
  canvas.height = BASE_H;

  // ===== 背景：background.png（同階層）=====
  const bg = new Image();
  let bgReady = false;
  bg.onload = () => (bgReady = true);
  bg.onerror = () => (bgReady = false);
  bg.src = "./background.png";

  // ===== iframe resize =====
  function postToParent(type, payload = {}) {
    if (!window.parent || window.parent === window) return;
    window.parent.postMessage({ type, payload }, ALLOWED_PARENT_ORIGIN);
  }
  function sendResize() {
    const h = Math.ceil(containerEl.getBoundingClientRect().height);
    postToParent("RESIZE", { height: h });
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

  const player = {
    x: BASE_W * 0.5,
    y: BASE_H * CONFIG.PLAYER.Y_RATIO,
    w: CONFIG.PLAYER.WIDTH,
    h: CONFIG.PLAYER.HEIGHT,
    vx: 0,
  };

  const drops = [];
  let spawnTimer = 0;
  let elapsedRun = 0;

  const collected = new Map(); // id -> count

  overlayEl.style.pointerEvents = "none";

  // ===== 入力 =====
  const input = { left: false, right: false, targetX: null };

  function setTargetFromClientX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const nx = (clientX - rect.left) / rect.width;
    input.targetX = clamp(nx, 0, 1) * BASE_W;
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
    const rect = canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * BASE_W;
    const cy = ((e.clientY - rect.top) / rect.height) * BASE_H;

    const b = getStartButtonRect();
    const hit = cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;
    if (hit) startRun();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "a") input.left = true;
    if (e.key === "ArrowRight" || e.key === "d") input.right = true;
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft" || e.key === "a") input.left = false;
    if (e.key === "ArrowRight" || e.key === "d") input.right = false;
  });

  // ===== 親→子：待ち終了 =====
  window.addEventListener("message", (ev) => {
    const data = ev.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "WAIT_DONE") {
      stopped = true;
      showOverlayDone("待ちが完了しました");
    }
  });

  // ===== 画像ロード（ローカル10枚 + レア1枚）=====
  const sprites = new Map(); // id -> { img, ready }

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
    return CONFIG.BOMB.RATE_BASE + d * CONFIG.BOMB.RATE_ADD_BY_DIFFICULTY;
  }

  function spawnIntervalSec() {
    const d = difficulty01();
    return Math.max(
      CONFIG.SPAWN.INTERVAL_SEC_MIN,
      CONFIG.SPAWN.INTERVAL_SEC_BASE - d * CONFIG.SPAWN.INTERVAL_SEC_DECAY
    );
  }

  function fallSpeed(scoreNow) {
    const d = difficulty01();
    const addByScore = Math.min(scoreNow * CONFIG.FALL.SPEED_ADD_BY_SCORE_FACTOR, CONFIG.FALL.SPEED_ADD_BY_SCORE_CAP);
    return CONFIG.FALL.SPEED_BASE + d * CONFIG.FALL.SPEED_ADD_BY_DIFFICULTY + addByScore;
  }

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }
  function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
    return Math.abs(ax - bx) * 2 < aw + bw && Math.abs(ay - by) * 2 < ah + bh;
  }

  function weightedPick(defs) {
    let sum = 0;
    for (const d of defs) sum += Math.max(0, d.spawnWeight ?? 0);
    if (sum <= 0) return null;
    let r = Math.random() * sum;
    for (const d of defs) {
      r -= Math.max(0, d.spawnWeight ?? 0);
      if (r <= 0) return d;
    }
    return defs[defs.length - 1] ?? null;
  }

  function availableCharacters() {
    const out = [];
    for (const d of LOCAL_CHARACTERS) {
      if ((d.spawnWeight ?? 0) <= 0) continue;
      out.push(d);
    }

    const rareSlot = sprites.get(RARE_CHARACTER.id);
    if (rareSlot?.ready && (RARE_CHARACTER.spawnWeight ?? 0) > 0) out.push(RARE_CHARACTER);
    return out;
  }

  function spawnDrop() {
    const isBomb = Math.random() < bombRate();
    const size = isBomb
      ? rand(CONFIG.BOMB.SIZE_MIN, CONFIG.BOMB.SIZE_MAX)
      : rand(CONFIG.CHARA.SIZE_MIN, CONFIG.CHARA.SIZE_MAX);

    if (isBomb) {
      drops.push({
        type: "bomb",
        x: rand(size / 2, BASE_W - size / 2),
        y: -size,
        w: size,
        h: size,
        vy: fallSpeed(score) + rand(CONFIG.FALL.SPEED_JITTER_MIN, CONFIG.FALL.SPEED_JITTER_MAX),
        rot: rand(-0.6, 0.6),
        t: 0,
      });
      return;
    }

    const pool = availableCharacters();
    const def = weightedPick(pool);
    const spriteSlot = def ? sprites.get(def.id) : null;

    drops.push({
      type: "chara",
      charaId: def?.id ?? "unknown",
      label: def?.label ?? "unknown",
      points: def?.points ?? 1,
      isRare: !!def?.isRare,
      src: def?.src ?? null,
      sprite: spriteSlot?.ready ? spriteSlot.img : null,
      x: rand(size / 2, BASE_W - size / 2),
      y: -size,
      w: size,
      h: size,
      vy: fallSpeed(score) + rand(CONFIG.FALL.SPEED_JITTER_MIN, CONFIG.FALL.SPEED_JITTER_MAX),
      rot: rand(-0.6, 0.6),
      t: 0,
    });
  }

  function resetWorld() {
    score = 0;
    lastPostedScore = 0;
    collected.clear();
    drops.length = 0;
    spawnTimer = 0;
    elapsedRun = 0;
    safeTime = CONFIG.BOMB.SAFE_TIME_SEC;

    player.x = BASE_W * 0.5;
    player.vx = 0;
    lastTs = 0;

    scoreEl.textContent = `SCORE: 0`;
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
    score += points;
    scoreEl.textContent = `SCORE: ${score}`;

    if (score - lastPostedScore >= CONFIG.HUD.POST_SCORE_EVERY_POINTS) {
      lastPostedScore = score;
      postToParent("SCORE", { score });
    }
  }

  function update(dt) {
    elapsedRun += dt;
    safeTime = Math.max(0, safeTime - dt);

    // プレイヤー移動（滑らか）
    let targetV = 0;
    if (input.targetX != null) {
      const dx = input.targetX - player.x;
      targetV = clamp(dx / 70, -1, 1) * CONFIG.PLAYER.SPEED;
    } else {
      if (input.left) targetV -= CONFIG.PLAYER.SPEED;
      if (input.right) targetV += CONFIG.PLAYER.SPEED;
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
          score = Math.max(0, score - CONFIG.CHARA.MISS_PENALTY_POINTS);
          scoreEl.textContent = `SCORE: ${score}`;
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

  function getStartButtonRect() {
    return { x: BASE_W / 2 - 76, y: BASE_H - 148, w: 152, h: 44 };
  }

  function drawRulesScreen() {
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    roundRect(ctx, 95, 85, BASE_W - 190, BASE_H - 170, 18);

    ctx.fillStyle = "#fff";
    ctx.globalAlpha = 0.96;
    ctx.font = '900 18px system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans JP", sans-serif';
    ctx.fillText("ルール", 112, 118);

    ctx.font = '13px system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans JP", sans-serif';
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText("・キャラを集めてポイントを稼ぐ", 112, 150);
    ctx.fillText("・爆弾に当たるとゲームオーバー", 112, 172);
    ctx.fillText("・左右移動：スワイプ / ← → キー", 112, 194);
    ctx.fillText("・レアキャラは低確率で出現（高得点）", 112, 216);

    const a = getAssetStatus();
    ctx.fillStyle = "rgba(255,255,255,0.80)";
    ctx.fillText(`・画像: ${a.localReady}/${a.localTotal}  レア: ${a.rareReady ? "OK" : "LOADING"}`, 112, 240);

    const b = getStartButtonRect();
    ctx.globalAlpha = ready ? 1.0 : 0.45;

    const grad = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y);
    grad.addColorStop(0, "rgba(124,92,255,1)");
    grad.addColorStop(1, "rgba(39,214,255,1)");
    ctx.fillStyle = grad;
    roundRect(ctx, b.x, b.y, b.w, b.h, 14);

    ctx.fillStyle = "rgba(8,10,18,0.92)";
    ctx.font = '900 16px system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans JP", sans-serif';
    ctx.fillText(ready ? "START" : "LOADING...", b.x + 42, b.y + 28);
    ctx.globalAlpha = 1.0;
  }

  function drawPlayer() {
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#000";
    roundRect(ctx, player.x - player.w / 2 + 2, player.y - player.h / 2 + 3, player.w, player.h, 9);
    ctx.globalAlpha = 1.0;

    const grad = ctx.createLinearGradient(
      player.x - player.w / 2,
      player.y - player.h / 2,
      player.x + player.w / 2,
      player.y + player.h / 2
    );
    grad.addColorStop(0, "rgba(255,255,255,0.96)");
    grad.addColorStop(1, "rgba(210,220,255,0.96)");
    ctx.fillStyle = grad;
    roundRect(ctx, player.x - player.w / 2, player.y - player.h / 2, player.w, player.h, 9);
  }

  function drawDropChara(d) {
    if (!d.sprite) {
      const slot = sprites.get(d.charaId);
      if (slot?.ready) d.sprite = slot.img;
    }

    const hasSprite = !!d.sprite;
    if (hasSprite) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot * Math.sin(d.t * 3));
      ctx.drawImage(d.sprite, -d.w / 2, -d.h / 2, d.w, d.h);

      if (d.isRare && CONFIG.RARE.SPARKLE_ENABLED) {
        drawSparkle(0, 0, d.w, d.t);
      }
      ctx.restore();
      return;
    }

    drawPlaceholderChara(d.x, d.y, d.w, d.isRare);
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

  function draw() {
    drawBackground();

    if (!running) {
      drawRulesScreen();
      return;
    }

    drawPlayer();

    for (const d of drops) {
      if (d.type === "bomb") drawBomb(d.x, d.y, d.w);
      else drawDropChara(d);
    }

    if (safeTime > 0) {
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans JP", sans-serif';
      ctx.fillText("スタート直後は爆弾なし!", 12, 26);
      ctx.globalAlpha = 1;
    }
  }

  // ===== overlay =====
  function showOverlayGameOver(msg) {
    running = false;
    statusEl.textContent = "GAME OVER";
    postToParent("GAME_OVER", { score });

    overlayEl.style.display = "flex";
    overlayEl.style.pointerEvents = "auto";
    overlayEl.replaceChildren(buildResultCard(msg));
  }

  function showOverlayDone(msg) {
    running = false;
    statusEl.textContent = "DONE";
    postToParent("WAIT_DONE_ACK", { score });

    overlayEl.style.display = "flex";
    overlayEl.style.pointerEvents = "auto";
    overlayEl.replaceChildren(buildResultCard(msg, { hideRetry: true }));
  }

  function buildResultCard(title, { hideRetry = false } = {}) {
    const card = document.createElement("div");
    card.className = "overlayCard";

    const t = document.createElement("div");
    t.className = "overlayTitle";
    t.textContent = title;
    card.appendChild(t);

    const sub = document.createElement("div");
    sub.className = "overlaySubtitle";
    sub.textContent = "集めたキャラクターの内訳";
    card.appendChild(sub);

    const table = document.createElement("table");
    table.className = "resultTable";
    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr>
        <th>キャラ</th>
        <th style="text-align:right;">個数</th>
        <th style="text-align:right;">pt/体</th>
        <th style="text-align:right;">小計</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const rows = buildScoreRows();
    if (!rows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="4" style="color: rgba(238,242,255,.78);">まだ何も集められていない…</td>`;
      tbody.appendChild(tr);
    } else {
      for (const r of rows) tbody.appendChild(r);
    }
    table.appendChild(tbody);
    card.appendChild(table);

    const total = document.createElement("div");
    total.className = "resultTotal";
    total.innerHTML = `<span>最終スコア</span><strong>${score} pt</strong>`;
    card.appendChild(total);

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "※ パラメータ（確率/速度/ポイント）は game.js の CONFIG / LOCAL_CHARACTERS を編集して調整できます。";
    card.appendChild(hint);

    if (!hideRetry) {
      const row = document.createElement("div");
      row.className = "btnRow";
      const retry = document.createElement("button");
      retry.className = "btn";
      retry.type = "button";
      retry.textContent = "もう一回";
      retry.addEventListener("click", () => startRun());
      row.appendChild(retry);
      card.appendChild(row);
    }

    return card;
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

      const tdCount = document.createElement("td");
      tdCount.style.textAlign = "right";
      tdCount.textContent = String(it.count);

      const tdPts = document.createElement("td");
      tdPts.style.textAlign = "right";
      tdPts.textContent = String(it.points);

      const tdSub = document.createElement("td");
      tdSub.style.textAlign = "right";
      tdSub.textContent = String(it.subtotal);

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

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  // ===== 起動 =====
  scoreEl.textContent = "SCORE: 0";
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
