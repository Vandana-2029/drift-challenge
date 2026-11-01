# Drift: 30/60/90-Day Challenge

Turn your 30, 60 or 90-day goals into a day-by-day plan with AI, then track it and see exactly how missed days push your goals back.

> Built by Claude (Anthropic's AI) for Vandana Kumari, as a generic version of her personal [90-day challenge tracker](https://github.com/Vandana-2029/90-day-challenge). This is not one of her portfolio projects.

## How it works

1. **Sign up** with email and password.
2. **Answer 10 questions:** your goal, 30/60/90-day targets, the areas you'll work on (like DSA, React, English speaking), your level, hours on weekdays and weekends, break days (study every day, Sunday off, Sunday catch-up, or weekends off), what your normal day looks like, and any deadline.
3. **AI builds the plan.** The server sends your answers to Groq, which returns an outline (phases, milestones, weekly tasks). The server then turns it into exact daily tasks that fit your hours and break days, with catch-up, review and rest days built in. If the AI is down or not set up, a built-in template is used instead.
4. **Your dashboard** opens under your account, on every device:
   - **Today:** tick tasks. A Minimum Day option for bad days keeps your streak alive.
   - **Drift:** how many days your big goals have moved because of unfinished work, which areas cause it, and whether you'll still make your deadline.
   - **Big Goals, Days, Applications, Practice, Focus timer, Settings** (re-plan after a break, backups, plan download/import, delete account).

## Tech

- Node.js 22, Express 5, MongoDB with Mongoose
- Email + password accounts (bcrypt hashes, JWT in an httpOnly cookie), rate limiting, strict Content-Security-Policy
- Groq API (`openai/gpt-oss-120b`) with structured JSON output, validated with zod
- Vanilla JavaScript frontend (ES modules, no build step)
- Tests with `node --test` (Groq is mocked)

```
server/   index.js (API), auth.js, store.js (MongoDB or in-memory), ai.js (Groq), planBuilder.js, schema.js
public/   index.html, css/, js/ (views/ = one file per page)
test/     plan builder + API tests
```

## Run it locally

```bash
npm install
npm test
npm start          # http://localhost:3000
```

With no environment variables it runs in **test mode**: data is kept in memory (lost on restart) and plans use the template. To use a real database and AI, copy `.env.example` to `.env`, fill it in, and run `node --env-file=.env server/index.js`.

## Deploy for free on Render

You need three free accounts: GitHub, [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) and [Groq](https://console.groq.com).

**1. Database (MongoDB Atlas M0, free)**
1. Create a free **M0** cluster (pick the Mumbai region if you're in India).
2. *Database Access* → add a database user with a password (letters and numbers only is easiest).
3. *Network Access* → add `0.0.0.0/0` (Render's free plan has no fixed IP).
4. *Connect* → *Drivers* → copy the connection string, put your password in it, and add a database name after `.net/`, e.g. `mongodb+srv://user:PASSWORD@cluster0.xxxxx.mongodb.net/drift?retryWrites=true&w=majority`

**2. AI key (Groq, free)**
1. Log in at console.groq.com → *API Keys* → *Create API Key*. Copy it (it starts with `gsk_`).

**3. Render**
1. Render → *New* → *Blueprint* → pick this repo. It reads `render.yaml`.
2. When asked, paste `MONGODB_URI` and `GROQ_API_KEY`. `JWT_SECRET` is generated for you.
3. Deploy. Check `https://<your-app>.onrender.com/api/health`: it should say `"storage":"mongodb"` and `"ai":true`.

### Free tier limits (good to know)

| Service | Limit |
|---|---|
| Render free web service | Sleeps after 15 minutes idle; the first visit after that takes about a minute |
| MongoDB Atlas M0 | 512 MB storage, no automatic backups; paused if unused for a long time |
| Groq free tier | Rate limited per minute and per day; each account can make 5 AI plans per day here (`PLANS_PER_DAY`) |

Download a backup from Settings once a month.

## Privacy

Passwords are hashed with bcrypt and never stored in plain text. Your answers are sent to Groq only to create your plan. Deleting your account removes your plan and progress from the database.

## License

MIT
