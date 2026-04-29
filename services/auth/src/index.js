const crypto = require("crypto");
const express = require("express");
const { createRemoteJWKSet, jwtVerify } = require("jose");

const app = express();
const port = Number(process.env.PORT) || 3005;
const awsRegion = process.env.AWS_REGION || "us-east-1";
const cognitoUserPoolId = process.env.COGNITO_USER_POOL_ID || "";
const cognitoClientId = process.env.COGNITO_CLIENT_ID || "";
const cognitoCustomersUserPoolId = process.env.COGNITO_CUSTOMERS_USER_POOL_ID || "";
const cognitoCustomersClientId = process.env.COGNITO_CUSTOMERS_CLIENT_ID || "";
const cognitoAdminsUserPoolId = process.env.COGNITO_ADMINS_USER_POOL_ID || "";
const cognitoAdminsClientId = process.env.COGNITO_ADMINS_CLIENT_ID || "";
const cognitoAdminGroup = process.env.COGNITO_ADMIN_GROUP || "admin";
const enableLocalAuth = String(process.env.ENABLE_LOCAL_AUTH || "false") === "true";

app.use(express.json());

// Local fallback for development only.
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

const jwksByIssuer = new Map();

function getCognitoConfigs() {
  const configs = [];

  if (cognitoCustomersUserPoolId && cognitoCustomersClientId) {
    configs.push({
      poolId: cognitoCustomersUserPoolId,
      clientId: cognitoCustomersClientId
    });
  }

  if (cognitoAdminsUserPoolId && cognitoAdminsClientId) {
    configs.push({
      poolId: cognitoAdminsUserPoolId,
      clientId: cognitoAdminsClientId
    });
  }

  if (configs.length === 0 && cognitoUserPoolId && cognitoClientId) {
    configs.push({
      poolId: cognitoUserPoolId,
      clientId: cognitoClientId
    });
  }

  return configs;
}

function isCognitoConfigured() {
  return getCognitoConfigs().length > 0;
}

function getJwksForIssuer(issuer) {
  if (!jwksByIssuer.has(issuer)) {
    jwksByIssuer.set(issuer, createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)));
  }
  return jwksByIssuer.get(issuer);
}

function claimsToSession(payload) {
  const groups = Array.isArray(payload["cognito:groups"]) ? payload["cognito:groups"] : [];
  const role = groups.includes(cognitoAdminGroup) ? "admin" : "customer";

  return {
    id: payload.sub || "unknown",
    email: payload.email || payload.username || "unknown",
    role,
    claims: payload
  };
}

async function verifyCognitoToken(token) {
  const configs = getCognitoConfigs();
  let lastError = null;

  for (const config of configs) {
    const issuer = `https://cognito-idp.${awsRegion}.amazonaws.com/${config.poolId}`;
    try {
      const { payload } = await jwtVerify(token, getJwksForIssuer(issuer), { issuer });
      const aud = payload.aud;
      const clientId = payload.client_id;
      const tokenClientOk = aud === config.clientId || clientId === config.clientId;
      if (!tokenClientOk) {
        throw new Error("Token client mismatch");
      }
      return claimsToSession(payload);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Token verification failed");
}

async function requireAuth(req, res, next) {
  const token = readBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({
      error: "Missing or invalid Authorization header"
    });
  }

  try {
    if (isCognitoConfigured()) {
      req.session = await verifyCognitoToken(token);
      return next();
    }

    if (!enableLocalAuth) {
      return res.status(503).json({
        error: "Auth backend not configured"
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
  } catch (error) {
    return res.status(401).json({
      error: "Invalid or expired token",
      details: error.message
    });
  }
}

function requireAdmin(req, res, next) {
  if (!req.session || req.session.role !== "admin") {
    return res.status(403).json({
      error: "Requires admin role"
    });
  }

  return next();
}

app.get("/health", (_req, res) => {
  res.status(200).json({
    service: "auth",
    status: "ok",
    mode: isCognitoConfigured() ? "cognito" : enableLocalAuth ? "local-dev" : "disabled"
  });
});

app.get("/auth/me", requireAuth, (req, res) => {
  return res.status(200).json({
    user: req.session
  });
});

app.get("/auth/admin-check", requireAuth, requireAdmin, (req, res) => {
  return res.status(200).json({
    ok: true,
    role: req.session.role
  });
});

// Local fallback endpoints
app.post("/auth/register", (req, res) => {
  if (!enableLocalAuth || isCognitoConfigured()) {
    return res.status(503).json({
      error: "Local register disabled in Cognito mode"
    });
  }

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
  if (!enableLocalAuth || isCognitoConfigured()) {
    return res.status(503).json({
      error: "Local login disabled in Cognito mode"
    });
  }

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

app.post("/auth/logout", requireAuth, (req, res) => {
  if (enableLocalAuth && !isCognitoConfigured()) {
    const token = readBearerToken(req.headers.authorization);
    activeTokens.delete(token);
  }

  return res.status(200).json({
    status: "logged_out"
  });
});

app.listen(port, () => {
  console.log(`Auth service is running on port ${port}`);
  console.log(`Using AWS_REGION=${awsRegion}`);
  console.log(`Using COGNITO_USER_POOL_ID=${cognitoUserPoolId || "(not set)"}`);
  console.log(`Using COGNITO_CLIENT_ID=${cognitoClientId || "(not set)"}`);
  console.log(`Using COGNITO_CUSTOMERS_USER_POOL_ID=${cognitoCustomersUserPoolId || "(not set)"}`);
  console.log(`Using COGNITO_CUSTOMERS_CLIENT_ID=${cognitoCustomersClientId || "(not set)"}`);
  console.log(`Using COGNITO_ADMINS_USER_POOL_ID=${cognitoAdminsUserPoolId || "(not set)"}`);
  console.log(`Using COGNITO_ADMINS_CLIENT_ID=${cognitoAdminsClientId || "(not set)"}`);
  console.log(`Using COGNITO_ADMIN_GROUP=${cognitoAdminGroup}`);
  console.log(`Using ENABLE_LOCAL_AUTH=${enableLocalAuth}`);
});
