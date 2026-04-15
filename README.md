# webgame prototype

降ってくるキャラクターを爆弾を避けながら集めるミニゲーム（プロトタイプ）です。

## 事前準備（画像）

`img/character1.png` 〜 `img/character9.png` を配置してください。

## ローカルで開く

（簡単）`index.html` をブラウザで開くだけでも動きます。

レア画像（Firebase Storage）取得の確認をしたい場合は、ローカルサーバで開くのがおすすめです。

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

ブラウザで `http://127.0.0.1:8080/` を開きます。

## 調整ポイント

- 出現確率・ポイント: `game.js` の `LOCAL_CHARACTERS` / `RARE_CHARACTER`
- 速度・生成間隔など: `game.js` の `CONFIG`

