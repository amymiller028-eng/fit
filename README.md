# 🐾 Huey's House

Amy, Cory and Huey's home base: one website for the grocery list, nutrition, workouts, money and a wishlist.

## Sections

- **Store needs**: a shared grocery list. Cross items off as you shop, tap **Finish trip** to archive them, and see what you buy most in **History & trends**.
- **Nutrition**: type what you ate ("1/2 cup baked sweet potato") and get calories, protein and fiber from the built-in USDA food database. It tracks daily protein and fiber goals, includes dairy-free plan meals, and flags foods with dairy.
- **Workout calendar**: daily affirmation, a calendar of the program, logging with suggested weights and reps, per-set bodyweight, added exercises, weekly celebrations and monthly wrap-ups.
- **Money** (password protected):
  - **Spend**: log purchases like "4.50 latte" with the card used. Shows day, week and month totals, card spending goals, and a calendar with no-spend days.
  - **Debt goals**: a shrinking bar for each debt, a debt-free date, a monthly game plan, an emergency cushion, scheduled payments, and pay-in-full cards.
- **Wishlist**: things to earn with workouts.

## Your data

Everything is saved in your browser on that device; nothing is sent anywhere. Money data is encrypted with your password (AES-GCM), and if you forget the password it can't be recovered. To move to a new phone, use **Program → Data → Export backup**, then **Import backup**. Money data stays encrypted in the backup.

## Running it

It's a static site with no build step, hosted on GitHub Pages. Serve the folder with any static server to run it locally.

Food data: USDA FoodData Central, SR Legacy (public domain), bundled as `usda-foods.json`.
