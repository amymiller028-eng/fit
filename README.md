# 🍑 Glute + Cut Tracker

A personal workout tracker built on my Glute + Cut Plan. It's a calendar: tap a day, tap the workout, and log your weight and reps.

## What it does

- **Calendar view.** Every day shows its planned workout. Days you finish get a check mark.
- **Smart suggestions.** Each exercise shows what you did last time and what to try today:
  - **Legs: heavier.** 5–8 reps. Hit the top of the range on every set and the app adds weight.
  - **Arms: high reps.** 15–20 reps. Add a rep each session. Weight goes up only after 20s on every set.
  - **Cardio: more of it.** A 20-min incline walk after every lift plus a long cardio day. It builds minutes first, then incline, then speed.
  - Each exercise also shows an **8-week goal** and a starting weight for your first session.
- **Weekly celebration.** When you open the app after a week ends, you get confetti and a summary: workouts, cardio minutes, leg volume, arm reps, steps and PRs.
- **Monthly wrap-up.** At the end of each month you see your strength gains per lift and your best week.
- **Daily check-in.** Log steps and body weight.

## Your data

Logs are saved in your browser's local storage on that device. Nothing is sent anywhere. To move to a new phone or keep a backup, use **Program → Data → Export backup**, then **Import backup** on the new device.

## Running it

It's a static site with no build step. Open `index.html`, or serve the folder with any static server. It's hosted on GitHub Pages.

## Changing the program

All exercises, sets, rep ranges and weight steps live in [`program.js`](program.js). The weekly schedule can also be changed in the app under **Program**.
