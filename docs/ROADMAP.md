# Roadmap

The plan, in the order that keeps it useful at every step. Nothing here is locked —
it's a shared map we can re-draw together.

## ✅ Phase 1 — Useful tonight (done / in progress)
A local app that runs by opening `index.html`. No accounts, data saved in-browser.

- [x] Today dashboard (only what matters now)
- [x] Routines & chores: assign to a person, time of day, daily/weekly/one-off, optional steps
- [x] Money: live **Safe-to-Spend** pulled from the Finances Tracker (published-CSV
      link) + "Open Finances" button. No duplicate logging, no double-counting.
- [x] Calm, accessible, mobile-first design with dark mode
- [ ] Edit/delete a routine (currently add only)
- [ ] "Well done" streaks / gentle encouragement

## 🔜 Phase 2 — Shared between Kirsty & Jack
The big one: same data on both our phones.

- [ ] Move data from localStorage to a hosted database so routines/chores sync between
      Kirsty & Jack (candidates: **Supabase**, or reuse the **Google Sheets** approach the
      finance tracker already uses — Kirsty already has that ecosystem set up)
- [ ] Accounts / a shared "household" both people join
- [ ] Real-time updates (tick a chore on your phone, it ticks on mine)
- [x] Connect the existing **Finances Tracker** (done in Phase 1 — live Safe-to-Spend)
- [ ] Add: meal planning + shopping list, appointments/reminders, bills & admin
- [ ] Install to home screen (PWA) so it feels like a real app + works offline

## 🏡 Phase 3 — Our house: display & automation
For when we have our own place and a wall tablet / hub.

- [ ] "Display mode" — a calm always-on dashboard for a wall tablet
- [ ] Connect to **Home Assistant** (open-source home automation) for lights, heating, etc.
- [ ] Routines can *trigger* the house (e.g. "bedtime" dims lights, locks door)
- [ ] Presence / reminders surfaced on the display
- [ ] Merge with Jack's project into one collaborative codebase

## Open questions to decide together
- Where does the existing finance tracker live, and what data does it already hold?
- Do we want one shared login, or separate logins inside one household?
- Hosting: keep it free/simple, or self-host on a little home server later?
