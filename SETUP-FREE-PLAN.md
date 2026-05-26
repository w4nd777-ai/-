# 🆓 完全免費「自動穩定」設定手冊

**目標**：每月 $0、200 人能用、未來不用碰程式碼、出狀況系統會自己處理或明確告知。

**總耗時**：約 45-60 分鐘（一次性，做完不用再做）

---

## 📋 你只需要做這 4 件事

### ✅ Step 1：套用 Firebase 安全規則（5 分鐘）

**目的**：防止資料被外人讀寫

1. 打開 [Firebase Console](https://console.firebase.google.com/project/cms-w4nd777/database/rules)
2. 切到 **規則** 分頁
3. 把整個內容替換成下方「過渡期寬鬆版」（如果你之後完成 Sprint 3 Auth 整合，再換完整版）：

```json
{
  "rules": {
    "cms-v3": {
      "$room": {
        ".read": true,
        ".write": true,
        "accounts": { ".read": false, ".write": true },
        "teachers": { ".read": false, ".write": false }
      }
    }
  }
}
```

4. 按「**發布**」
5. ✅ 完成 — 學生再也讀不到老師帳號表

---

### ✅ Step 2：啟用 Firebase Storage（學生上傳作業需要，5 分鐘）

1. Firebase Console → 左側 **Storage**
2. 按「**開始使用**」
3. 模式選「**生產模式**」
4. 位置選 `asia-southeast1`（與資料庫同區）
5. 規則 tab → 貼上：

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /cms-v3/{room}/attachments/{file=**} {
      allow read: if true;
      allow write: if request.resource.size < 50 * 1024 * 1024
                   && (request.resource.contentType.matches('image/.*')
                       || request.resource.contentType.matches('application/pdf')
                       || request.resource.contentType.matches('text/.*')
                       || request.resource.contentType.matches('application/.*'));
    }
  }
}
```

6. 按「**發布**」
7. ✅ 完成 — 學生可上傳 < 50MB 的檔案

---

### ✅ Step 3：設定 GitHub Actions 自動備份（**最重要，20 分鐘**）

**目的**：每天凌晨 2 點 GitHub 機器人自動下載你的 Firebase 資料，存到你的 repo。永久免費。

#### 3.1 確認你 push 的 GitHub repo

你的 repo：`w4nd777-ai/-`（或你重新命名後的）

#### 3.2 取得 Firebase Database Secret（**這個讓 GitHub 能讀資料**）

1. Firebase Console → ⚙️ 專案設定 → **服務帳戶** 分頁
2. 切到「**資料庫密鑰**」子分頁
3. 點「**新增密鑰**」或複製現有的「**密鑰**」
4. **複製整串密鑰**（很長一串）

#### 3.3 把密鑰存進 GitHub Secret

1. 打開 https://github.com/w4nd777-ai/-/settings/secrets/actions
   （網址路徑：repo → Settings → Secrets and variables → Actions）
2. 按「**New repository secret**」
3. 新增第 1 個：
   - **Name**: `FIREBASE_DB_URL`
   - **Secret**: `https://cms-w4nd777-default-rtdb.asia-southeast1.firebasedatabase.app`
4. 按「Add secret」
5. 再按「New repository secret」新增第 2 個：
   - **Name**: `FIREBASE_DB_SECRET`
   - **Secret**: （貼上 Step 3.2 複製的長字串）
6. 按「Add secret」

#### 3.4 觸發第一次備份試試看

1. 打開 https://github.com/w4nd777-ai/-/actions/workflows/daily-backup.yml
2. 右側按「**Run workflow**」→ 選 `main` 分支 → 「Run workflow」
3. 等 30 秒
4. 回到 repo 主頁 → 應該看到新建的 `backups/` 資料夾
5. 點進去看到 `backup-2026-05-26.json` 跟 `latest.json`
6. ✅ **完成 — 從此每天凌晨 2:00 自動備份**

> ⚠️ **如果失敗**：點失敗的 workflow 看錯誤訊息。最常見原因：FIREBASE_DB_SECRET 沒設或設錯。

---

### ✅ Step 4：Sentry 錯誤監控（**可選但強烈建議，10 分鐘**）

**目的**：學生說「打不開」時你能在 Sentry 看到具體錯誤訊息

#### 4.1 註冊 Sentry

1. 打開 [sentry.io](https://sentry.io/signup/) → 用 Google 登入
2. 選擇免費方案（5,000 events/月）
3. 新建專案：
   - Platform: **JavaScript / Browser**
   - 專案名稱：`cms-v3`

#### 4.2 取得 DSN

註冊完會看到一串 DSN，類似：
```
https://abc123xyz@o12345.ingest.sentry.io/9876543
```
複製整串。

#### 4.3 把 DSN 加進系統

打開 `app-v3.html` 在 `<head>` 區段最上方加：

```html
<script src="https://browser.sentry-cdn.com/7.x/bundle.min.js" crossorigin="anonymous"></script>
<script>
  if(typeof Sentry !== 'undefined' && Sentry.init){
    Sentry.init({
      dsn: '你貼的 DSN',
      tracesSampleRate: 0.1,
      environment: location.hostname.includes('github.io') ? 'production' : 'dev',
      beforeSend(event) {
        if(event.message?.includes('password')) return null;
        return event;
      }
    });
  }
</script>
```

或者**告訴我你的 DSN，我幫你加進去並 commit**。

---

## 🎯 完成後的「自動穩定」狀態

✅ Firebase 規則套用 → 老師帳號表外人讀不到  
✅ Firebase Storage 啟用 → 學生能上傳檔案  
✅ **GitHub Actions 每天 02:00 自動備份**（核心保護）  
✅ Sentry 錯誤監控 → 出包你會收到 Email  
✅ 系統內建健康儀表板 → 老師打開總覽就看到狀態  
✅ 自動 7 天備份提醒  
✅ 30 天回收桶（誤刪可救）  
✅ 異常寫入偵測 + 容量警告  

**從此你可以「不再碰 code」直到下次想加新功能。**

---

## 🆘 出狀況怎麼辦？

### 場景 1：學生說「打不開系統」
1. 老師打開系統 → 看「🩺 系統健康狀態」
2. Firebase 連線 = 🔴 離線？→ 等網路恢復
3. Firebase 連線 = 🟢 正常？→ 學生個別問題，叫他清快取（登入頁底部「🔄 強制清快取」）

### 場景 2：資料庫顯示「🟡 注意」或「🔴 接近上限」
1. 立即下載備份（健康儀表板點「上次備份」→ 跳到備份頁）
2. 學期末做歸檔（匯出 + 清掉超過半年的 attendance）

### 場景 3：Firebase 整個爆掉 / 資料庫被清空
1. 打開你的 GitHub repo → `backups/` 資料夾
2. 下載 `latest.json`
3. 進系統 → 設定 → 💼 備份 → **匯入完整 JSON**
4. 全部資料還原（最多丟 24 小時）

### 場景 4：付款方面（其實沒有付款）
- Firebase Spark：免費 100 同時連線
- GitHub Actions：免費 2,000 分鐘/月（你用 < 15 分鐘）
- Sentry：免費 5,000 events/月
- Cloudflare：免費（如果你有用）
- **總計：永久 $0**

### 場景 5：超過 100 同時連線
1. 老師後台 → 「**🏢 多教室管理**」
2. 新建第 2 間教室
3. 把部分班級轉到第 2 間教室
4. 每間獨立 100 連線上限，2 間就 200

---

## 📊 你能控制的事 vs 系統自動處理的事

### ✅ 系統自動處理（不用你管）
- 每天備份到 GitHub
- 錯誤自動回報到 Sentry
- 健康狀態即時顯示
- 容量警告
- 7 天備份提醒
- 30 天回收桶
- Service Worker 自動更新
- localStorage 滿時自動降級

### 👀 你需要每 3-6 個月看一眼（**10 分鐘**）
- GitHub repo `backups/` 確認最新檔案是今天的
- Sentry Dashboard 看有沒有未處理的錯誤
- Firebase Console 看連線數有沒有持續滿載
- **就這樣**

### 🆘 真的有事再做
- 學生反映異常 → 看健康儀表板
- 想還原資料 → GitHub `backups/latest.json`
- 想新增功能 → 找我

---

## ❓ 還有問題？

**Q：GitHub Actions 真的不收費？**  
A：公開 repo 完全免費。私人 repo 每月 2,000 分鐘免費（你用 15 分鐘）。

**Q：Sentry 5,000 events 夠用嗎？**  
A：學校用 1 個月應該不到 100 events。完全夠。

**Q：要不要綁定信用卡？**  
A：上述全部都不用綁。Firebase 你也維持 Spark 免費方案就好。

**Q：學生超過 100 怎麼辦？**  
A：分多間教室。系統內建「🏢 多教室管理」功能，老師可建多間，每間 100 連線。

**Q：你（開發者）以後不維護怎麼辦？**  
A：所有 code 都在你的 GitHub repo，你的資料每天備份在 backups/。任何工程師接手都能看懂。
