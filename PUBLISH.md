# 一時公開（注文先に見せる用）

このゲームは静的ファイルなので、ローカル起動 + ngrok で「一時的にインターネット公開」できます。

## 1) 画像を配置

`webgame/img/character1.png` 〜 `webgame/img/character9.png` を置く  
（拡張子を `.jpg` にする場合は `webgame/game.js` の `LOCAL_CHARACTERS` の `src` を合わせてください）

## 2) 公開（ngrok）

`webgame/` ディレクトリで:

```bash
chmod +x ./publish_ngrok.sh
./publish_ngrok.sh
```

成功すると `https://xxxx.ngrok-free.app/` のようなURLが出ます。

停止は `Ctrl+C`。

## 2b) 恒久公開（GitHub Pages）

GitHub Pages にするとURLが固定になります。

手順（概要）:
1. `webgame/` をリポジトリとしてpush
2. GitHubの `Settings → Pages` で `main` ブランチ `/ (root)` を選ぶ

このフォルダには自動化スクリプトも置いてあります:

```bash
./publish_pages.sh owner/repo
```

## 3) 送付文テンプレ

件名: ミニゲーム試作（プロトタイプ）共有

本文:
```
お世話になっております。沢田世帯です。
ミニゲームのプロトタイプを一時公開しました。

URL:
（ここにURLを貼る）

PC/スマホどちらでも動きます。
ご確認のうえ、改善点があればお知らせください。
```
