# webgame prototype

降ってくるキャラクターを爆弾を避けながら集めるミニゲーム（プロトタイプ）です。

## 事前準備（画像）

`img/character1.png` 〜 `img/character9.png` を配置してください。

## ローカルで開く

（簡単）`index.html` をブラウザで開くだけでも動きます。

レア画像（Firebase Storage）取得の確認をしたい場合は、ローカルサーバで開くのがおすすめです。

Firebase Storage を使う場合は、先に `firebase_config.example.js` を `firebase_config.js` にコピーして、自分のFirebase Web設定を入れてください。`firebase_config.js` はGit管理しません。本番のGitHub Pagesでは、GitHub Actionsが `FIREBASE_CONFIG_JSON` Secret から生成します。

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

ブラウザで `http://127.0.0.1:8080/` を開きます。

## 調整ポイント

- 出現確率・ポイント: `game.js` の `LOCAL_CHARACTERS` / `RARE_CHARACTER`
- 速度・生成間隔など: `game.js` の `CONFIG`

## 埋め込み（既存サイトに載せる）

- `?embed=1` : 外側の背景/余白を抑えた埋め込み向け表示（指定がない場合は親UIを崩しにくい横長表示）
- `?portrait=1` / `?landscape=1` : 縦長/横長の表示・ゲーム調整を強制

## 既存サイトへの埋め込み手順

このゲームは `iframe` で既存サイトに埋め込む想定です。AI生成の待ち時間に表示する場合は、既存のローディング表示をゲーム用の枠に差し替え、生成完了時に `postMessage` でゲームへ待機終了を通知します。

### 1. 埋め込みURLを決める

本番公開済みのURL:

```text
https://toki-0508.github.io/waitgame-proto/?embed=1
```

スマホ縦長表示を強制したい場合:

```text
https://toki-0508.github.io/waitgame-proto/?embed=1&portrait=1
```

PC横長表示を強制したい場合:

```text
https://toki-0508.github.io/waitgame-proto/?embed=1&landscape=1
```

通常は `?embed=1` だけで問題ありません。埋め込み時は、親ページ側の見出しや生成ボタンと同居しても崩れにくいよう、指定がない場合は横長表示になります。ゲームだけを大きく見せる枠を用意できる場合のみ `portrait=1` を使ってください。

### 2. HTMLにゲーム表示エリアを追加する

既存のローディングアニメーションを表示している場所に、次の要素を追加します。最初は `hidden` にしておき、AI生成中だけ表示します。

```html
<div id="ai-waitgame" hidden>
  <iframe
    id="ai-waitgame-frame"
    src="https://toki-0508.github.io/waitgame-proto/?embed=1"
    style="width:100%;border:0;border-radius:12px;background:transparent;aspect-ratio:16/9;max-height:70dvh;"
    title="待ち時間ミニゲーム"
  ></iframe>
</div>
```

スマホ画面で縦長に固定したい場合は `src` を次に変えます。ただし縦長表示は高さを使うため、親ページ側で十分な表示領域を確保してください。

```html
src="https://toki-0508.github.io/waitgame-proto/?embed=1&portrait=1"
```

### 3. 親サイト側のJavaScriptを追加する

ゲーム側からは `RESIZE`、`SCORE`、`GAME_OVER`、`WAIT_DONE_ACK` が送られます。最低限必要なのは `RESIZE` の処理と、生成完了時に `WAIT_DONE` を送る処理です。

```html
<script>
  const WAITGAME_ORIGIN = "https://toki-0508.github.io";
  const waitgameBox = document.getElementById("ai-waitgame");
  const waitgameFrame = document.getElementById("ai-waitgame-frame");

  window.addEventListener("message", (event) => {
    if (event.origin !== WAITGAME_ORIGIN) return;

    const message = event.data;
    if (!message || typeof message !== "object") return;

    if (message.type === "RESIZE" && typeof message.payload?.height === "number") {
      waitgameFrame.style.height = `${message.payload.height}px`;
      waitgameFrame.style.aspectRatio = message.payload?.aspectRatio ?? "auto";
    }

    if (message.type === "SCORE") {
      console.log("waitgame score:", message.payload?.score);
    }

    if (message.type === "GAME_OVER") {
      console.log("waitgame game over:", message.payload?.score);
    }
  });

  function showWaitGame() {
    waitgameBox.hidden = false;
  }

  function finishWaitGame() {
    waitgameFrame.contentWindow?.postMessage({ type: "WAIT_DONE" }, WAITGAME_ORIGIN);
  }

  function hideWaitGame() {
    waitgameBox.hidden = true;
  }
</script>
```

### 4. AI生成処理と連動させる

既存の生成処理が `Promise` / `async` / `await` で書かれている場合は、生成開始前に表示し、完了時に `WAIT_DONE` を送ります。

```js
async function generateWithWaitGame() {
  showWaitGame();

  try {
    const result = await generateImage(); // 既存のAI生成処理
    finishWaitGame();
    return result;
  } finally {
    setTimeout(hideWaitGame, 800);
  }
}
```

`fetch` で生成APIを呼んでいる場合の例:

```js
async function onGenerateClick() {
  showWaitGame();

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "..." }),
    });

    const result = await response.json();
    finishWaitGame();
    return result;
  } finally {
    setTimeout(hideWaitGame, 800);
  }
}
```

生成が短時間で終わるとゲーム表示がちらつく場合は、少し遅らせて表示します。

```js
async function withWaitGame(promise, showDelayMs = 600) {
  let shown = false;
  const timer = setTimeout(() => {
    shown = true;
    showWaitGame();
  }, showDelayMs);

  try {
    return await promise;
  } finally {
    clearTimeout(timer);
    finishWaitGame();
    if (shown) setTimeout(hideWaitGame, 800);
  }
}

async function onGenerateClick() {
  const result = await withWaitGame(fetch("/api/generate", { method: "POST" }).then((r) => r.json()));
  return result;
}
```

### 5. 親サイト側で使うイベント

親サイトからゲームへ送るイベント:

```js
waitgameFrame.contentWindow?.postMessage({ type: "WAIT_DONE" }, "https://toki-0508.github.io");
```

ゲームから親サイトへ送られるイベント:

- `RESIZE`: iframeの高さ調整用
- `SCORE`: 一定スコアごとの通知
- `GAME_OVER`: 爆弾に当たって終了した通知
- `WAIT_DONE_ACK`: 親サイトからの `WAIT_DONE` をゲーム側が受け取った通知

### 6. セキュリティ上の注意

`postMessage` を使うため、親サイト側では必ず `event.origin` を確認してください。

```js
if (event.origin !== "https://toki-0508.github.io") return;
```

`postMessage` の送信先も `*` ではなく、ゲームのoriginを指定してください。

```js
waitgameFrame.contentWindow?.postMessage({ type: "WAIT_DONE" }, "https://toki-0508.github.io");
```

FirebaseのWeb用 `firebaseConfig` は公開される前提の設定です。秘密鍵ではありません。ただしGitHub Secret scanningではGoogle API Keyとして検出されるため、このリポジトリでは `firebase_config.js` をコミットせず、GitHub Pagesのビルド時に `FIREBASE_CONFIG_JSON` から生成します。Storage / Firestore の Security Rules が開放されていると危険なので、Firebase側のRulesは別途確認してください。
