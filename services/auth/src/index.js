const crypto = require("crypto");
const express = require("express");

const app = express();
const port = Number(process.env.PORT) || 3005;

app.use(express.json());

// MVP-only in-memory users. Replace with Cognito or database later.
const users = [
  {
    id: "u1",
    email: "customer@example.com",
    password: "customer123",
    role: "customer"
  },
  {
    id: "a1",
    email: "admin@example.com",
    password: "admin123",
    role: "admin"
  }
];

const activeTokens = new Map();

function createToken() {
  return crypto.randomBytes(24).toString("hex");
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role
  };
}

function readBearerToken(authorizationHeader) {
  if (!authorizationHeader || typeof authorizationHeader !== "string") {
    return null;
  }

  const [prefix, token] = authorizationHeader.split(" ");
  if (prefix !== "Bearer" || !token) {
    return null;
  }

  return token;
}

function requireAuth(req, res, next) {
  const token = readBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({
      error: "Missing or invalid Authorization header"
    });
  }

  const session = activeTokens.get(token);
  if (!session) {
    return res.status(401).json({
      error: "Invalid or expired token"
    });
  }

  req.session = session;
  return next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session || req.session.role !== role) {
      return res.status(403).json({
        error: `Requires ${role} role`
      });
    }

    return next();
  };
}

app.get("/health", (_req, res) => {
  res.status(200).json({
    service: "auth",
    status: "ok"
  });
});

app.post("/auth/register", (req, res) => {
  const { email, password, role } = req.body || {};

  if (!email || typeof email !== "string") {
    return res.status(400).json({
      error: "email is required and must be a string"
    });
  }

  if (!password || typeof password !== "string" || password.length < 6) {
    return res.status(400).json({
      error: "password is required and must be at least 6 characters"
    });
  }

  const selectedRole = role === "admin" ? "admin" : "customer";

  if (users.some((user) => user.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({
      error: "User already exists"
    });
  }

  const newUser = {
    id: `u-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    email,
    password,
    role: selectedRole
  };

  users.push(newUser);

  return res.status(201).json({
    user: sanitizeUser(newUser)
  });
});

app.post("/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = users.find(
    (entry) =>
      entry.email.toLowerCase() === String(email || "").toLowerCase() &&
      entry.password === password
  );

  if (!user) {
    return res.status(401).json({
      error: "Invalid credentials"
    });
  }

  const token = createToken();
  const session = sanitizeUser(user);
  activeTokens.set(token, session);

  return res.status(200).json({
    accessToken: token,
    tokenType: "Bearer",
    user: session
  });
});

app.get("/auth/me", requireAuth, (req, res) => {
  return res.status(200).json({
    user: req.session
  });
});

app.post("/auth/logout", requireAuth, (req, res) => {
  const token = readBearerToken(req.headers.authorization);
  activeTokens.delete(token);

  return res.status(200).json({
    status: "logged_out"
  });
});

app.get("/auth/admin-check", requireAuth, requireRole("admin"), (req, res) => {
  return res.status(200).json({
    ok: true,
    role: req.session.role
  });
});

app.listen(port, () => {
  console.log(`Auth service is running on port ${port}`);
});
