# Safari Digital Portal

Client portal and admin dashboard for Safari Digital, at `portal.safaridigital.co.tz`.

- **Next.js 16** (App Router) on **Vercel**
- **Supabase** for the database, sign-in (email + password) and, later, file storage
- Every table uses Row Level Security: admins see everything, clients only their own company

## What's in this first version

- Sign in, sign out, forgot password, set a new password
- Two roles: `admin` (Safari Digital) and `client` (tour operators)
- Admin: Overview, Clients list with search, Add client, edit a client (package, onboarding and account status)
- Admin: Settings for tutorial videos (link or upload) and the Meta Business ID / Drive share email shown in onboarding
- Admin: Portal access per client (link an existing sign-in, or create a one-time invite link to send by WhatsApp) and the client's onboarding answers and files
- Admin: Data connections per client (Vercel website project now; Meta ads next)
- Client: Website page with visitors, daily chart, top pages and countries from Vercel Web Analytics
- Client: onboarding wizard (saves as you go; photos and brand files are shared as a Google Drive folder), Overview and Account (change password)
- Database tables for clients, profiles and inquiries (the Inquiries screens come next)

## Setting it up

1. **Database.** In Supabase → SQL Editor, paste and run each file in `supabase/migrations/` in order (`0001_init.sql` to `0004_integrations.sql`).
2. **Turn off public sign-ups.** Supabase → Authentication → Sign In / Providers → turn off "Allow new users to sign up". Accounts are created by Safari Digital only.
3. **Your admin account.** Supabase → Authentication → Users → Add user → Create new user (tick "Auto confirm"). Then run `supabase/make-admin.sql` with your email.
4. **Redirect URLs.** Supabase → Authentication → URL Configuration: set Site URL to `https://portal.safaridigital.co.tz` and add `https://portal.safaridigital.co.tz/**` and `https://*.vercel.app/**` to Redirect URLs (password-reset links need these).
5. **Website analytics.** Create a Vercel access token (Account Settings → Tokens) and add it in this project's Environment Variables as `ANALYTICS_VERCEL_TOKEN`; then pick each client's Vercel project under Data connections on the client page. Web Analytics must be enabled on each client site.
6. **Tutorial videos and client-facing details** (Meta Business ID, Drive share email) are set in the app under Admin → Settings.
7. **Vercel.** Import this repository, add the Supabase integration (it sets `NEXT_PUBLIC_SUPABASE_URL` and the key), and deploy.

## Local development

```bash
cp .env.example .env.local   # fill in the two Supabase values
npm install
npm run dev
```
