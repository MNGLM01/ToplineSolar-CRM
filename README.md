# Topline Solar CRM

Web app for Topline Solar (rooftop solar EPC, North Bihar). Step 1: leads, follow-ups, roles, referral partners. Step 2: customers, projects, documents, subsidy and loan. Step 3: price list, quotations with branded PDF proposals, money in and out, dues, office expenses and referral commissions (company totals, spend and profit are owner-only and computed in the database). Step 4: owner dashboard, Excel reports with one-click export, and tasks. PDF fonts in `public/pdf` are Inter (SIL Open Font License).

- **Frontend:** React + Vite + Tailwind (brand tokens in `tailwind.config.js`), mobile-first.
- **Backend:** Supabase (Postgres with row-level security, Auth, one Edge Function).
- **Roles:** Owner, Office Manager, Sales Executive, Referral Partner. Access rules are enforced in the database (`supabase/migrations`), not just the UI.
- **Data safety:** every insert/update/delete is written to `audit_log` with old and new values; leads are never hard-deleted (trash, owner-only restore); encrypted nightly backup workflow in `.github/workflows/nightly-backup.yml` (needs the `SUPABASE_DB_URL` and `BACKUP_PASSPHRASE` repository secrets; restore steps are in the file).

## Setup
1. Create a Supabase project and run `supabase/migrations/*.sql` in order.
2. Deploy the edge function `supabase/functions/manage-users`.
3. In Supabase Auth settings, turn off "Allow new users to sign up" (staff accounts are created by the owner).
4. Copy `.env.example` to `.env` and fill in the project URL and anon key.
5. `npm install && npm run dev`. The first person to open the app creates the Owner account.

## Deploy
Import the GitHub repository into Vercel (framework: Vite). Add the two `VITE_` environment variables.
