# Family Documents

A simple, phone-friendly place for the family's important documents (Aadhar, PAN, policies, reports…).

- Upload a photo (straight from the camera) or a PDF, give it a name, choose whose it is and its type.
- Names are saved in CAPITALS (`aadhar card` → `AADHAR CARD`).
- Search works across spellings: `aadhar`, `aadhaar` and `adhar` all find the same documents.
- Filter by type (ID Proofs, Bank & Tax, Insurance…) and by person (MOM, DAD…).
- Open, download, share to WhatsApp, edit details or delete.
- Files are stored **privately** in Vercel Blob and can only be opened by someone who has logged in with the family password.

## Deploy on Vercel

1. Push this folder to a GitHub repo and import it at https://vercel.com/new (or run `npx vercel` here).
2. In the Vercel project, go to **Storage → Create → Blob**, choose **Private** access, and connect it to the project. This adds `BLOB_READ_WRITE_TOKEN` automatically.
3. In **Settings → Environment Variables**, add:
   - `FAMILY_PASSWORD`: the password the family will type once on each phone
   - `AUTH_SECRET`: any long random string (for example, the output of `openssl rand -hex 32`)
4. Redeploy. Open the site on each phone, log in once (it stays logged in for a year), then use the browser menu's **Add to Home screen** option so it opens like an app.

## Run locally

```bash
cp .env.example .env.local   # fill in the values (BLOB_READ_WRITE_TOKEN from the Vercel Blob store)
npm install
npm run dev
```

## How documents are stored

There is no database. Each document is one file in Blob, and its details live in its path:

```
docs/<TYPE>/<PERSON>/<NAME>__<ID>.<ext>
e.g. docs/ID/MOM/AADHAR_CARD__3f9c1a…​.jpg
```

You can also browse the same files in the Vercel dashboard under Storage → your Blob store.

## Good to know

- **Storage limits.** Vercel's Hobby plan includes a limited amount of Blob storage. Large phone photos are shrunk on upload (to max 2400px, still sharp enough to read), which keeps most documents under 1 MB.
- **Backups.** Blob files stay until you delete them, but for documents meant to last a lifetime, download a copy every so often (for example from the Vercel dashboard) and keep it somewhere else too.
- **Changing the password.** Change `FAMILY_PASSWORD` in Vercel and redeploy. This logs everyone out.
