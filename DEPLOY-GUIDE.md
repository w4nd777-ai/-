# 課程管理系統 — 部署與安全加固指南

## 🔒 Sprint 1：安全加固（必做）

### 第 1 步：套用 Firebase Realtime Database 規則

**為什麼重要**：預設規則 `{"rules":{".read":true,".write":true}}` 等於把整個資料庫公開到網路上。任何人知道你的 databaseURL 就能讀寫全部資料。

**步驟**：
1. 打開 [Firebase Console](https://console.firebase.google.com/)
2. 選 `cms-w4nd777` 專案
3. 左側選單 → **Realtime Database** → **規則** tab
4. 把 `firebase-rules.json` 的內容貼上（覆蓋原本的）
5. 按「**發布**」

**驗證規則生效**：
- 開隱身視窗 → 打開 `https://w4nd777-ai.github.io/-/app-v3.html`
- 進入學生身分
- 開 DevTools → Network → 看 RTDB 連線回應
- 學生身分讀 `/cms-v3/$room/accounts` 應該 401

⚠️ **過渡期注意**：目前系統還沒整合 Firebase Auth，套用嚴格規則後**未登入的學生會讀不到資料**。建議先用「寬鬆版」規則：

```json
{
  "rules": {
    "cms-v3": {
      "$room": {
        ".read": true,
        ".write": true,
        "accounts": { ".read": false, ".write": false }
      }
    }
  }
}
```

至少先保護「老師帳號表」(accounts)。完整 auth 整合後再用嚴格規則。

---

### 第 2 步：升級到 Firebase Blaze 方案（200 人必須）

**為什麼**：免費 Spark 方案上限 **100 同時連線** = 100 人。你 200 人會有一半人連不上。

**步驟**：
1. Firebase Console → 左下角 `Spark 方案` → 升級
2. 綁信用卡（不會主動扣款）
3. 設定預算警示：**美金 5 元**（一般小學校用量大概美金 0~3 元/月）

**Blaze 給你什麼**：
- 同時連線：100 → **200,000**
- 流量：10GB/月 → 10 GB **免費** + 超過 $1/GB
- Storage：1GB → 5GB 免費
- Cloud Functions：2 百萬次 / 月免費

**預期費用估算（200 人 / 月）**：
- 每人每天簽到+10 次互動 = 200 × 10 × 30 = 60,000 ops
- 流量 ≈ 1-2 GB（遠低於 10GB 免費額度）
- **預期帳單：US$0** ✓

---

### 第 3 步：啟用 Firebase Storage（附件上傳必須）

學生上傳作業 / 照片需要 Firebase Storage。

**步驟**：
1. Firebase Console → **Storage** → **開始使用**
2. 模式選「**生產模式**」
3. 位置選 `asia-southeast1`（與 RTDB 同區）
4. **規則** tab 貼上：

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /cms-v3/{room}/attachments/{file=**} {
      allow read: if true;
      allow write: if request.resource.size < 50 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*|application/pdf|text/.*');
    }
  }
}
```

---

## 🚀 Sprint 2：規模化部署

### 啟用 Cloudflare CDN 加速

GitHub Pages 速度普通。包一層 Cloudflare 後：
- 全球 < 50ms TTFB
- 自動 brotli 壓縮（1.2 MB → ~350 KB）
- 免費 DDoS 防護
- 可加 CSP / HSTS headers

**步驟**：
1. 註冊 cloudflare.com（免費方案）
2. 加你的網域（如 `cms.yourschool.tw`）
3. 把 CNAME 指向 `w4nd777-ai.github.io`
4. SSL/TLS 設「**Full (strict)**」

---

### 監控設定：Sentry（免費 5K events/月）

**步驟**：
1. 註冊 sentry.io
2. 新建專案 → 選 JavaScript / Browser
3. 拿到 DSN 字串
4. 在 app-v3.html `<head>` 加：

```html
<script src="https://browser.sentry-cdn.com/7.x/bundle.min.js" crossorigin="anonymous"></script>
<script>
  Sentry.init({
    dsn: 'YOUR_DSN_HERE',
    tracesSampleRate: 0.1,
    environment: location.hostname.includes('github.io') ? 'production' : 'dev',
    beforeSend(event) {
      // 過濾學生密碼等敏感資料
      if(event.message?.includes('password')) return null;
      return event;
    }
  });
</script>
```

之後任何 JS 錯誤會自動回報。

---

## 📊 規模化最佳實踐

### 200 人併發的部署建議

1. **時段錯開**：學生早自習 8:00 一次點名 → 30 人同時用，**最高峰**
2. **班級分流**：低年級 7:50-8:00、高年級 8:00-8:10
3. **教師端用 Wi-Fi**：學生用行動數據時 Firebase 連線品質取決於電信
4. **重要時段監控**：上午 8:00 / 中午 12:30 / 下午 4:00 看 Firebase Console 連線數

### 預期負載

| 時段 | 同時連線 | 每秒 ops |
|---|---|---|
| 早自習簽到 (8:00) | 60-80 | ~5 |
| 上課中 (10:00) | 100-150 | ~1 |
| 午休 (12:30) | 50-80 | ~2 |
| 放學後 (16:30) | 30-50 | ~1 |
| 晚上家長端 (20:00) | 100-150 | ~0.5 |

**結論**：200 人學校升 Blaze 方案，**完全游刃有餘**。

---

## 🔄 災難恢復計劃

### 每日自動備份（建議手動 cron 跑）

1. Firebase Console → Realtime Database → 三個點選「**匯出 JSON**」
2. 每週至少手動匯出一次到 Google Drive
3. 系統內也有「☁️ 備份」頁可下載完整 DB

### 系統掛掉時怎麼辦

1. 學生發現「無法登入」/ 「資料不見」
2. 老師查 Firebase Console → Database 看資料是否還在
3. 若資料還在：登入頁點「🔄 強制清快取重整」（在密碼框底下）
4. 若資料不見：從備份還原 → 設定頁 → 匯入 JSON

---

## 📈 後續規劃

| Sprint | 工時 | 重點 |
|---|---|---|
| Sprint 1 (本週) | 2 天 | Firebase 規則 + Blaze + Storage 啟用 |
| Sprint 2 (下週) | 5 天 | Cloudflare + Sentry + 200 人壓測 |
| Sprint 3 (下下週) | 7 天 | Firebase Auth 整合（client + rules）|
| Sprint 4 (1 個月) | 14 天 | Vite 拆檔重構 + 加 TypeScript |
| Sprint 5 (3 個月) | 21 天 | Vitest 測試 + Playwright E2E |

---

## ❓ 常見問題

**Q：升 Blaze 真的免費嗎？**
A：用量在免費額度內就是 $0。設預算警示 $5 就算超過也只會花 5 元美金。

**Q：要用 Firebase Auth 嗎？**
A：強烈建議。目前任何學生改 localStorage 就能變老師（拿到完整資料）。Sprint 3 會做完整整合。

**Q：能換到其他平台嗎？**
A：可以。資料用 JSON 匯出後可轉到 Supabase、Hasura、自架後端。但 Firebase 是目前最省事的選擇。
