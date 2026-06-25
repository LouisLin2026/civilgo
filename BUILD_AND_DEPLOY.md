# CivilGo V5 Alpha — 建置與部署

## 架構（V4.6 build-time 整合）
教材原始檔放在 `ContentPack/`、`QuestionBank/`、`EssayBank/`（資料來源，不重寫）。
`tools/build_loader.js` 在「上傳前」自動掃描這些資料夾，正規化欄位，產出**根目錄**三個 runtime 檔：
`courses.json` / `questions.json` / `essays.json`。
瀏覽器只讀根目錄三個 JSON → 不受 GitHub 壓平資料夾影響、離線可用。

## 重新產生 runtime 資料
```
node tools/build_loader.js
```
- 自動掃描，不寫死課程數；新增 Day56–90、Day91+ 只要丟進 ContentPack 再跑一次即可。
- 以「內容形狀」分類（lesson / question / essay），不需重新命名既有檔。
- 會印出課程數、題數、缺漏天數與警告。

## 自我測試（可選）
```
node tools/smoke_test.js     # 無頭煙霧測試，驗證各頁面與功能
```

## 部署到 GitHub Pages（louislin2026.github.io/civilgo/）
**只上傳「根目錄扁平檔」到 repo 根層**（與 index.html 同層）：
```
index.html  app.js  style.css
courses.json  questions.json  essays.json
service-worker.js  manifest.json
icon-192.png  icon-512.png  icon-maskable-512.png
```
ContentPack/ 等原始資料夾可一併放進 repo 備份，但**不影響線上**（不會被瀏覽器讀取）。

更新後在手機/桌面瀏覽器 Ctrl+F5（或設定→清除網站資料、移除舊 Service Worker）以取得最新版。
Service Worker 為 `civilgo-v3`，對 .json 採 network-first，內容會自動更新。

## 目前內容狀態（誠實標註）
- 課程：Day1–55（地方自治 1–30、行政學 31–55）。Day56–90（政治學/公共管理）原始教材尚未提供，Loader 會在報告中列出缺漏，補入後自動顯示。
- 題庫：40 題（地方自治）。架構目標 2000，其餘待補。
- 申論：105 篇（55 篇當日課程綁定 + 50 篇題庫）。
- `must`（必考旗標）由 importance≥5 推導，屬規則，非捏造統計。
