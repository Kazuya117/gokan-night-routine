# CLAUDE.md — gokan-night-routine（五感ナイトルーティン）

## これは何か
寝る前にスマホを手放すための PWA（静的サイト・ビルド不要）。三田国際科学学園リベラルアーツの試作版。
公開先は GitHub Pages: https://kazuya117.github.io/gokan-night-routine/ （`main` に push すると反映）。
機能・仕様メモ・まだないものの正本は `README.md`。

## 作業場所（2026-10-21 以降）
- **編集は WSL 側のこの clone（`~/apps/gokan-night-routine`）で行う。** 2026-10-06 の初版 4 commit は Claude Code で作成（Windows 側 Claude Code の履歴には無い）。
- 学校向けの他の試作（`~/sensei-doko`・`~/idea-seeds`）と同じ扱い。push は PR 経由。

## 更新時の約束（README「更新するとき」の要約）
- `app.js` の `VERSION`、`index.html` の `?v=`、`sw.js` の `CACHE`（現在 `gokan-v4`）と `?v=` を**同じ数字に上げる**。上げ忘れると利用者の端末に新版が届かない。
- 記録は端末の localStorage のみ。サーバーも個人情報の送信もない。生徒が使う前提なので、この性質を崩す変更は先に中川さんへ確認する。

## 動かし方（手元）
```bash
python3 -m http.server 8765   # ブラウザで http://localhost:8765/
```
