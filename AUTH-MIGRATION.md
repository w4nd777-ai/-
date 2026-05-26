# Firebase Auth 整合計劃（Sprint 3+）

## 目的
解決最大的安全弱點：「任何學生改 localStorage 就能變老師」。

整合後：
- 老師身份由 Firebase 後端驗證（不是 client localStorage）
- RTDB 規則用 `auth.token.role === 'teacher'` 真實判斷
- 即使學生改 localStorage 也讀不到老師資料

---

## 整合分 5 步（每步可獨立 ship，逐步上線）

### Step 1：啟用 Firebase Auth（5 分鐘）
1. Firebase Console → Authentication → 開始使用
2. 啟用「**電子郵件/密碼**」(Sign-in method)
3. 不需要其他設定

### Step 2：把現有老師遷移到 Firebase Auth（半天）

寫一個 admin script（一次性）：

```js
// migrate-teachers.js（在老師端瀏覽器執行一次）
async function migrateTeachersToAuth(){
  for(const acc of App.db.accounts){
    if(!acc.email || acc.firebaseUid) continue;
    try {
      const cred = await firebase.auth().createUserWithEmailAndPassword(
        acc.email, 'TempPassword123!'  // 臨時密碼
      );
      acc.firebaseUid = cred.user.uid;
      // 寄信給老師告知新密碼
      // ...
    } catch(e){
      // already exists → try sign in
      console.log(acc.username, e.message);
    }
  }
  saveDB();
}
```

### Step 3：在 Cloud Functions 設定 custom claims（半天）

```js
// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.setRole = functions.https.onCall(async (data, context) => {
  // 只有現有 teacher 可以叫
  if(!context.auth?.token?.role === 'teacher'){
    throw new functions.https.HttpsError('permission-denied');
  }
  await admin.auth().setCustomUserClaims(data.uid, { role: data.role });
  return { ok:true };
});

// 學生註冊時自動設 student role
exports.onUserCreate = functions.auth.user().onCreate(async (user) => {
  // 預設 student
  await admin.auth().setCustomUserClaims(user.uid, { role: 'student' });
});
```

### Step 4：改寫 login 用 Firebase Auth（1 天）

```js
async function attemptTeacherLogin(){
  const u = i1.value.trim().toLowerCase();
  const pw = i2.value;
  try {
    // 用 username @ school.com 當 email 格式
    const email = u.includes('@') ? u : (u + '@cms-w4nd777.school.local');
    const cred = await firebase.auth().signInWithEmailAndPassword(email, pw);
    // 取 ID token 含 role claim
    const tok = await cred.user.getIdTokenResult();
    if(tok.claims.role !== 'teacher'){
      await firebase.auth().signOut();
      return toast('此帳號非教師角色', 'danger');
    }
    App.session = {
      role:'teacher',
      id: cred.user.uid,
      name: cred.user.displayName || u,
      username: u
    };
    saveSession();
    go('overview');
  } catch(e){
    toast('登入失敗：' + e.code, 'danger');
  }
}

async function studentTapToLogin(studentId){
  const s = findStudent(studentId);
  // 學生用匿名登入 + 自訂 claim 包含 studentId
  await firebase.auth().signInAnonymously();
  // ... 寫 student id 到 user claim 透過 cloud function
  finishStudentLogin(s);
}
```

### Step 5：套用嚴格 RTDB 規則（10 分鐘）

```json
{
  "rules": {
    "cms-v3": {
      "$room": {
        ".read": "auth != null",
        ".write": "auth != null",
        "accounts": {
          ".read": "auth.token.role === 'teacher'",
          ".write": "auth.token.role === 'teacher'"
        },
        "students": {
          "$id": {
            ".write": "auth.token.role === 'teacher' || (auth.token.role === 'student' && auth.token.studentId === $id)"
          }
        }
      }
    }
  }
}
```

---

## 自動備份方案

### A. Cloud Functions 排程備份（推薦，需 Blaze）

```js
exports.dailyBackup = functions.pubsub.schedule('0 2 * * *').timeZone('Asia/Taipei')
  .onRun(async (context) => {
    const db = admin.database();
    const snap = await db.ref('cms-v3').once('value');
    const json = JSON.stringify(snap.val());

    const bucket = admin.storage().bucket();
    const filename = 'backups/cms-v3-' + new Date().toISOString().slice(0,10) + '.json';
    await bucket.file(filename).save(json);

    return null;
  });
```

每天凌晨 2 點自動備份到 Storage，**保留 30 天**自動清掉。

### B. 客戶端排程備份（免費版方案）

```js
// 老師登入時檢查
if(App.session?.role === 'teacher'){
  const last = localStorage.getItem('cms_v3_last_backup');
  if(!last || Date.now() - parseInt(last,10) > 7*24*60*60*1000){
    // 一週備份一次，顯眼提示
    setTimeout(()=> {
      toast('🔔 該備份了！設定 → 💼 備份 → 下載 JSON', 'info', 10000);
    }, 5000);
  }
}
```

---

## 估時

| 步驟 | 工時 | 風險 |
|---|---|---|
| Step 1 | 5 min | 0 |
| Step 2 (遷移老師) | 半天 | 中 — 需通知所有老師重設密碼 |
| Step 3 (Cloud Functions) | 半天 | 低 |
| Step 4 (改寫 login) | 1 天 | 中 — 主流程改動 |
| Step 5 (嚴格規則) | 10 min | 中 — 規則錯了會所有人連不上 |
| 自動備份 (Cloud Func) | 半天 | 低 |
| **合計** | **2.5 天** | |

---

## 漸進式上線建議

**Week 1**：Step 1 + Step 2（背景遷移，不影響現有流程）
**Week 2**：Step 3 + 部分老師試用 Step 4
**Week 3**：全部老師切換到 Step 4 login
**Week 4**：套用 Step 5 嚴格規則

期間 LocalStorage-based auth 保留為 fallback。直到所有老師都成功用新登入，再移除舊邏輯。
