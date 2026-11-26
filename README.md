# Eternalgy 到期提醒系统

记录车险、Road Tax、Puspakom、证书、执照的到期日和文件。快到期时自动发 WhatsApp 提醒。

- **网站**：`public/index.html`，部署在 Netlify，不需要 build
- **资料、登入和文件**：Supabase（免费方案，不用绑卡）
- **每天检查**：`netlify/functions/daily-check.mjs`，每天早上 9 点（马来西亚时间）检查一次
- **WhatsApp**：用 CallMeBot（免费，只限个人使用）

## 什么时候发提醒
每一项会在这些时候各提醒一次：
1. 剩 30 天
2. 剩 7 天
3. 到期当天
4. 过期之后每 7 天提醒一次，直到你按了「续期」或「停用」

## 设定步骤
1. 在 Supabase 开一个新项目，到 SQL Editor 贴上并运行 `supabase-setup.sql`（先把最下面的 email 换成你自己的）
2. 到 Supabase → Authentication → Users → Add user，帮自己和员工开账号
3. 在 `public/config.js` 填入 Supabase 的 Project URL 和 Publishable key
4. 把文件放上 GitHub，再到 Netlify 选「Import from GitHub」
5. 在 Netlify 的 Environment variables 加入以下几项：
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY`：Supabase 的 Secret key，**绝对不可以放进 config.js**
   - `CALLMEBOT_PHONE`：例如 `+60123456789`
   - `CALLMEBOT_APIKEY`
6. 测试：到 Netlify → Functions → daily-check，按「Run now」
