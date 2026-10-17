const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("./db");

const router = express.Router();

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function publicUser(user) {
  return { id: user.id, email: user.email, displayName: user.display_name || `Traveler #${user.id}` };
}

router.post("/signup", (req, res) => {
  const { email, password } = req.body || {};
  const displayName = typeof req.body?.displayName === "string" ? req.body.displayName.trim().slice(0, 40) : "";

  if (!email || !password || !isValidEmail(email) || password.length < 8) {
    return res.status(400).json({ error: "Valid email and password (8+ chars) required." });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare("INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)")
    .run(email.toLowerCase(), hash, displayName || null);

  req.session.userId = info.lastInsertRowid;
  res.json(publicUser({ id: info.lastInsertRowid, email: email.toLowerCase(), display_name: displayName || null }));
});

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required." });
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  req.session.userId = user.id;
  res.json(publicUser(user));
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get("/me", (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = db.prepare("SELECT id, email, display_name FROM users WHERE id = ?").get(req.session.userId);
  res.json({ user: user ? publicUser(user) : null });
});

module.exports = router;
