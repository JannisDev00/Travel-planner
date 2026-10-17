const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");

const db = require("./db");
const authRouter = require("./auth");
const { generatePlans, budgetTierFromDaily } = require("./recommend");
const { cities } = require("./flights");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(
  session({
    name: "travel_sid",
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 24 * 7 },
  })
);

app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/api/auth", authRouter);

const VALID_INTERESTS = [
  "beach", "relaxation", "culture", "history", "food",
  "nightlife", "adventure", "nature", "wildlife", "shopping",
];

const VALID_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function validatePlanInput(body) {
  const age = Number(body.age);
  const length = Number(body.length);
  const budgetUSD = Number(body.budgetUSD);
  const travelMonth = Number(body.travelMonth);
  const gender = typeof body.gender === "string" ? body.gender.slice(0, 40) : "unspecified";
  const originCity = typeof body.originCity === "string" ? body.originCity.trim() : "";
  const interests = Array.isArray(body.interests)
    ? body.interests.filter((i) => VALID_INTERESTS.includes(i))
    : [];

  if (!Number.isFinite(age) || age < 1 || age > 120) return { error: "Age must be between 1 and 120." };
  if (!Number.isFinite(length) || length < 1 || length > 60) return { error: "Trip length must be between 1 and 60 days." };
  if (!Number.isFinite(budgetUSD) || budgetUSD < 10 || budgetUSD > 1000000) return { error: "Budget must be a reasonable positive amount." };
  if (!interests.length) return { error: "Pick at least one interest." };
  if (!originCity || !cities.some((c) => c.name === originCity)) return { error: "Pick a valid starting city." };
  if (!VALID_MONTHS.includes(travelMonth)) return { error: "Pick a travel month." };

  return { value: { age, length, budgetUSD, gender, interests, originCity, travelMonth } };
}

app.get("/api/cities", (req, res) => {
  res.json(
    cities
      .map((c) => ({ name: c.name, country: c.country }))
      .sort((a, b) => a.name.localeCompare(b.name))
  );
});

app.post("/api/plan", (req, res) => {
  const { error, value } = validatePlanInput(req.body || {});
  if (error) return res.status(400).json({ error });

  const plans = generatePlans(value);
  res.json({ input: value, plans });
});

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Login required." });
  next();
}

function ageRange(age) {
  const decade = Math.floor(age / 10) * 10;
  return `${decade}s`;
}

function isValidSavedPlan(plan) {
  return (
    plan &&
    typeof plan.destination === "string" &&
    typeof plan.country === "string" &&
    typeof plan.description === "string" &&
    Array.isArray(plan.itinerary) &&
    Number.isFinite(plan.estimatedDailyCostUSD) &&
    Number.isFinite(plan.estimatedTotalCostUSD)
  );
}

app.post("/api/plans", requireAuth, (req, res) => {
  const { input, plan } = req.body || {};
  const { error, value: validInput } = validatePlanInput(input || {});
  if (error) return res.status(400).json({ error });
  if (!isValidSavedPlan(plan)) return res.status(400).json({ error: "Invalid plan." });

  const info = db
    .prepare(
      "INSERT INTO saved_plans (user_id, destination, input_json, plan_json, is_public) VALUES (?, ?, ?, ?, 0)"
    )
    .run(req.session.userId, plan.destination, JSON.stringify(validInput), JSON.stringify(plan));

  res.json({ id: info.lastInsertRowid });
});

app.get("/api/plans", requireAuth, (req, res) => {
  const rows = db
    .prepare(
      "SELECT id, destination, input_json, plan_json, is_public, created_at FROM saved_plans WHERE user_id = ? ORDER BY created_at DESC"
    )
    .all(req.session.userId);

  res.json(
    rows.map((r) => ({
      id: r.id,
      destination: r.destination,
      isPublic: !!r.is_public,
      createdAt: r.created_at,
      input: JSON.parse(r.input_json),
      plan: JSON.parse(r.plan_json),
    }))
  );
});

app.patch("/api/plans/:id", requireAuth, (req, res) => {
  const isPublic = !!(req.body || {}).isPublic;
  const info = db
    .prepare("UPDATE saved_plans SET is_public = ? WHERE id = ? AND user_id = ?")
    .run(isPublic ? 1 : 0, req.params.id, req.session.userId);

  if (info.changes === 0) return res.status(404).json({ error: "Saved plan not found." });
  res.json({ ok: true, isPublic });
});

app.delete("/api/plans/:id", requireAuth, (req, res) => {
  db.prepare("DELETE FROM saved_plans WHERE id = ? AND user_id = ?").run(req.params.id, req.session.userId);
  res.json({ ok: true });
});

// Mutual opt-in: you can only see who else is interested in a destination
// if you've made your own interest in that destination visible too.
app.get("/api/community/:destination", requireAuth, (req, res) => {
  const destination = req.params.destination;

  const ownPublicPlan = db
    .prepare("SELECT id FROM saved_plans WHERE user_id = ? AND destination = ? AND is_public = 1")
    .get(req.session.userId, destination);

  if (!ownPublicPlan) {
    return res.status(403).json({
      error: "Make your own saved plan for this destination visible to see who else is interested.",
    });
  }

  const rows = db
    .prepare(
      `SELECT sp.input_json, sp.created_at, u.id as user_id, u.display_name
       FROM saved_plans sp
       JOIN users u ON u.id = sp.user_id
       WHERE sp.destination = ? AND sp.is_public = 1 AND sp.user_id != ?
       ORDER BY sp.created_at DESC`
    )
    .all(destination, req.session.userId);

  const seenUsers = new Set();
  const travelers = [];
  for (const row of rows) {
    if (seenUsers.has(row.user_id)) continue;
    seenUsers.add(row.user_id);

    const input = JSON.parse(row.input_json);
    const dailyBudget = input.budgetUSD / input.length;
    travelers.push({
      displayName: row.display_name || `Traveler #${row.user_id}`,
      ageRange: ageRange(input.age),
      length: input.length,
      interests: input.interests,
      budgetTier: budgetTierFromDaily(dailyBudget),
      savedAt: row.created_at,
    });
  }

  res.json({ destination, travelers });
});

app.listen(PORT, () => {
  console.log(`Travel planner running at http://localhost:${PORT}`);
});
