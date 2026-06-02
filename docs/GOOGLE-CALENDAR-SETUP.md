# Connect your Google Calendar to JARVIS (one-time, ~10 min)

This lets JARVIS **read** your calendar so today's plan shows on the Today screen.
It's **read-only** — JARVIS can never add, change, or delete anything in your calendar.
You only do this once.

Do it on a **computer** (easier than phone). You'll end up with a "Client ID" to paste
into JARVIS.

---

## 1. Make a Google Cloud project
1. Go to **https://console.cloud.google.com/** and sign in with your Google account.
2. Top bar → project dropdown → **New Project**. Name it `JARVIS` → **Create**.
3. Make sure that new project is selected (top bar).

## 2. Turn on the Calendar API
1. Left menu (☰) → **APIs & Services** → **Library**.
2. Search **Google Calendar API** → click it → **Enable**.

## 3. Set up the consent screen
1. **APIs & Services** → **OAuth consent screen**.
2. Choose **External** → **Create**.
3. Fill the required bits: App name `JARVIS`, your email for support + developer contact.
   Skip everything optional → **Save and Continue** through the steps.
4. On the **Test users** step → **Add Users** → add **your own Google email** → Save.
   (Leaving the app in "Testing" is fine — it just means only you can use it.)

## 4. Create the Client ID
1. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**.
2. Application type: **Web application**.
3. Under **Authorised JavaScript origins** → **Add URI** → paste exactly:

   ```
   https://curtainswine-cpu.github.io
   ```

   (No trailing slash, no path — just that.)
4. **Create**. A box pops up with your **Client ID** (ends in `.apps.googleusercontent.com`).
   Copy it.

## 5. Paste it into JARVIS
- Open JARVIS → **Today** → the **📅 Google Calendar** card → **Connect it** → paste the
  Client ID → **Save & connect**.
- A Google sign-in appears. You'll see a "Google hasn't verified this app" notice (because
  it's your own personal app) → **Advanced** → **Continue** → allow read-only access.
- Today's events appear. Tap **see this week** for the days ahead.

> **Privacy:** your calendar data is shown on your device and cached there only. The
> Client ID is safe to store (it's public and locked to the JARVIS web address). You can
> remove access any time at **https://myaccount.google.com/permissions**.

Stuck on any step? Tell me which number and I'll talk you through it.
