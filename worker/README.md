# Cloudflare Worker — Comments Backend

نظام تعليقات بدون قاعدة بيانات تقليدية: Cloudflare Worker + KV Storage.

## ما يفعله

- يستقبل تعليقات من نموذج `aseer.html` عبر `POST /api/comments`.
- يخزّنها في Cloudflare KV.
- يعيدها مرتّبة (الأحدث أولاً) عبر `GET /api/comments?postId=aseer`.
- يحمي من السبام بـ: honeypot field + rate limiting (تعليق واحد لكل IP كل 60 ثانية).
- يدعم حذف التعليقات السيئة عبر `POST /api/admin/delete/:id?token=...`.

## خطوات الإعداد (مرة واحدة)

### 1. إنشاء حساب Cloudflare
- روح [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
- سجّل بإيميلك (مجاناً، لا يحتاج بطاقة).

### 2. تثبيت Wrangler (CLI الخاص بـCloudflare)
في الـPowerShell:
```powershell
npm install -g wrangler
```
(يحتاج Node.js مثبّت. لو ما عندك: حمّله من [nodejs.org](https://nodejs.org).)

### 3. تسجيل الدخول
```powershell
wrangler login
```
سيفتح المتصفح للتأكيد.

### 4. الدخول لمجلد الـWorker
```powershell
cd "C:\Users\ahmad\OneDrive\سطح المكتب\ahmad-abdullah-ali.github.io\worker"
```

### 5. إنشاء KV Namespace
```powershell
wrangler kv namespace create COMMENTS_KV
```
سيطبع شيء مثل:
```
[[kv_namespaces]]
binding = "COMMENTS_KV"
id = "abc123def456..."
```
**انسخ الـid** والصقه في `wrangler.toml` بدل `REPLACE_WITH_YOUR_KV_ID`.

### 6. إنشاء ADMIN_TOKEN (سرّ لحذف التعليقات)
```powershell
wrangler secret put ADMIN_TOKEN
```
سيطلب منك إدخال قيمة. ضع نصاً عشوائياً طويلاً (مثلاً افتح [bitwarden.com/password-generator](https://bitwarden.com/password-generator) واختر 32 حرفاً). **احفظه في مكان آمن** — هذا الـtoken يسمح بحذف أي تعليق.

### 7. نشر الـWorker
```powershell
wrangler deploy
```
سيطبع رابطاً مثل:
```
https://ahmadali-comments.YOUR_USERNAME.workers.dev
```
**انسخ هذا الرابط** — هذا هو الـAPI URL.

### 8. ربط الرابط بالموقع
افتح `aseer.html`، وابحث عن:
```js
const COMMENTS_API = '';
```
استبدله بـ:
```js
const COMMENTS_API = 'https://ahmadali-comments.YOUR_USERNAME.workers.dev/api/comments';
```
احفظ وادفع للـGitHub.

تمام، النظام شغّال.

## (اختياري) دومين مخصّص

لو تبي الـURL يكون `https://comments.ahmadali.net` بدل subdomain من Cloudflare:
1. روح Cloudflare Dashboard → Workers & Pages → ahmadali-comments → Settings → Triggers → Custom Domains.
2. أضف `comments.ahmadali.net`.
3. Cloudflare سيضبط DNS تلقائياً لو الدومين مُدار عندهم. لو الدومين عند مزوّد آخر، اتبع التعليمات لإضافة CNAME.

## حذف تعليق سيئ

افتح PowerShell:
```powershell
curl -X POST "https://YOUR_WORKER_URL/api/admin/delete/COMMENT_ID?token=YOUR_ADMIN_TOKEN"
```
- `COMMENT_ID` هو الـid الذي يظهر في تخزين KV (أو يمكن إيجاده من `wrangler kv key list --namespace-id=...`).
- `YOUR_ADMIN_TOKEN` هو القيمة التي ضبطتها في الخطوة 6.

## التكاليف

كل شيء **مجاني** ضمن حدود Cloudflare Free:
- Workers: 100,000 طلب/يوم مجاناً.
- KV: 100,000 قراءة/يوم + 1,000 كتابة/يوم مجاناً + 1 GB تخزين.

لمدوّنة شخصية، لن تقترب من هذه الحدود إطلاقاً.

## استكشاف الأخطاء

| المشكلة | الحل |
|---|---|
| `wrangler deploy` يفشل بـauth error | شغّل `wrangler login` من جديد |
| الموقع يقول "نظام التعليقات قيد الإعداد" | تأكد أنك حدّثت `COMMENTS_API` في `aseer.html` ودفعت للـGitHub |
| CORS error في الـconsole | تأكد أن دومينك (مثل ahmadali.net) موجود في `ALLOWED_ORIGINS` داخل `index.js` |
| تعليق لا يحفظ | افتح Cloudflare Dashboard → Workers → ahmadali-comments → Logs لرؤية الخطأ |
