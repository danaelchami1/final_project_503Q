const crypto = require("crypto");
const express = require("express");
const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");
const {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  SignUpCommand,
  AdminConfirmSignUpCommand,
  AdminUpdateUserAttributesCommand
} = require("@aws-sdk/client-cognito-identity-provider");
const { createRemoteJWKSet, jwtVerify } = require("jose");

const app = express();
const port = Number(process.env.PORT) || 3005;
const awsRegion = process.env.AWS_REGION || "us-east-1";
let cognitoUserPoolId = process.env.COGNITO_USER_POOL_ID || "";
let cognitoClientId = process.env.COGNITO_CLIENT_ID || "";
let cognitoCustomersUserPoolId = process.env.COGNITO_CUSTOMERS_USER_POOL_ID || "";
let cognitoCustomersClientId = process.env.COGNITO_CUSTOMERS_CLIENT_ID || "";
let cognitoAdminsUserPoolId = process.env.COGNITO_ADMINS_USER_POOL_ID || "";
let cognitoAdminsClientId = process.env.COGNITO_ADMINS_CLIENT_ID || "";
let cognitoAdminGroup = process.env.COGNITO_ADMIN_GROUP || "admin";
const enableLocalAuth = String(process.env.ENABLE_LOCAL_AUTH || "false") === "true";
const useAwsSsmAuthConfig = String(process.env.USE_AWS_SSM_AUTH_CONFIG || "false") === "true";
const authSsmCustomersPoolIdParam =
  process.env.AUTH_SSM_CUSTOMERS_POOL_ID_PARAM || "/shopcloud/dev/auth/cognito/customers_pool_id";
const authSsmCustomersClientIdParam =
  process.env.AUTH_SSM_CUSTOMERS_CLIENT_ID_PARAM || "/shopcloud/dev/auth/cognito/customers_client_id";
const authSsmAdminsPoolIdParam =
  process.env.AUTH_SSM_ADMINS_POOL_ID_PARAM || "/shopcloud/dev/auth/cognito/admins_pool_id";
const authSsmAdminsClientIdParam =
  process.env.AUTH_SSM_ADMINS_CLIENT_ID_PARAM || "/shopcloud/dev/auth/cognito/admins_client_id";
const authSsmAdminGroupParam = process.env.AUTH_SSM_ADMIN_GROUP_PARAM || "";

app.use(express.json());

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function getDevUserPassword(envKey, fallback) {
  return hashPassword(process.env[envKey] || fallback);
}

// Local fallback for development only.
const users = [
  {
    id: "u1",
    email: "customer@example.com",
    passwordHash: getDevUserPassword("LOCAL_AUTH_CUSTOMER_PASSWORD", "change-me-customer"),
    role: "customer"
  },
  {
    id: "a1",
    email: "admin@example.com",
    passwordHash: getDevUserPassword("LOCAL_AUTH_ADMIN_PASSWORD", "change-me-admin"),
    role: "admin"
  }
];
const activeTokens = new Map();
let ssmClient = null;
let cognitoIdpClient = null;

function getCognitoIdpClient() {
  if (!cognitoIdpClient) {
    cognitoIdpClient = new CognitoIdentityProviderClient({ region: awsRegion });
  }
  return cognitoIdpClient;
}

function getSsmClient() {
  if (!ssmClient) {
    ssmClient = new SSMClient({ region: awsRegion });
  }
  return ssmClient;
}

async function getSsmParameter(name) {
  if (!name) {
    return "";
  }
  const response = await getSsmClient().send(
    new GetParameterCommand({
      Name: name
    })
  );
  return response.Parameter?.Value || "";
}

async function loadAuthConfigFromSsm() {
  if (!useAwsSsmAuthConfig) {
    return;
  }

  const customersPoolId = await getSsmParameter(authSsmCustomersPoolIdParam);
  const customersClientId = await getSsmParameter(authSsmCustomersClientIdParam);
  const adminsPoolId = await getSsmParameter(authSsmAdminsPoolIdParam);
  const adminsClientId = await getSsmParameter(authSsmAdminsClientIdParam);
  const adminGroup = authSsmAdminGroupParam ? await getSsmParameter(authSsmAdminGroupParam) : "";

  cognitoCustomersUserPoolId = customersPoolId || cognitoCustomersUserPoolId;
  cognitoCustomersClientId = customersClientId || cognitoCustomersClientId;
  cognitoAdminsUserPoolId = adminsPoolId || cognitoAdminsUserPoolId;
  cognitoAdminsClientId = adminsClientId || cognitoAdminsClientId;
  cognitoAdminGroup = adminGroup || cognitoAdminGroup;
}

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

function isCognitoConfigured() {
  return getCognitoConfigs().length > 0;
}

function isAuthBackendReady() {
  return isCognitoConfigured() || enableLocalAuth;
}

function getCognitoConfigs() {
  const configs = [];

  if (cognitoUserPoolId && cognitoClientId) {
    configs.push({
      poolId: cognitoUserPoolId,
      clientId: cognitoClientId,
      source: "legacy"
    });
  }

  if (cognitoCustomersUserPoolId && cognitoCustomersClientId) {
    configs.push({
      poolId: cognitoCustomersUserPoolId,
      clientId: cognitoCustomersClientId,
      source: "customers"
    });
  }

  if (cognitoAdminsUserPoolId && cognitoAdminsClientId) {
    configs.push({
      poolId: cognitoAdminsUserPoolId,
      clientId: cognitoAdminsClientId,
      source: "admins"
    });
  }

  return configs;
}

const jwksByIssuer = new Map();

function getJwksForIssuer(issuer) {
  if (!jwksByIssuer.has(issuer)) {
    jwksByIssuer.set(issuer, createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)));
  }
  return jwksByIssuer.get(issuer);
}

function extractEmailFromCognitoPayload(payload) {
  const candidates = [
    payload.email,
    payload.preferred_username,
    payload.username,
    payload["cognito:username"]
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim() && value.includes("@")) {
      return value.trim();
    }
  }
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "unknown";
}

function claimsToSession(payload) {
  const groups = Array.isArray(payload["cognito:groups"]) ? payload["cognito:groups"] : [];
  const role = groups.includes(cognitoAdminGroup) ? "admin" : "customer";

  return {
    id: payload.sub || "unknown",
    email: extractEmailFromCognitoPayload(payload),
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
      const { payload } = await jwtVerify(token, getJwksForIssuer(issuer), {
        issuer
      });

      const aud = payload.aud;
      const tokenClientId = payload.client_id;
      const tokenClientOk = aud === config.clientId || tokenClientId === config.clientId;
      if (!tokenClientOk) {
        throw new Error(`Token client mismatch for ${config.source} config`);
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
  const mode = isCognitoConfigured() ? "cognito" : enableLocalAuth ? "local-dev" : "disabled";
  const ready = isAuthBackendReady();
  res.status(ready ? 200 : 503).json({
    service: "auth",
    status: ready ? "ok" : "degraded",
    mode
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

/**
 * Admins pool: password + TOTP (MFA ON). VPN provides certificate; Cognito provides MFA at sign-in.
 * Used by internal admin UI via admin-service proxy (same-origin).
 */
app.post("/auth/cognito-admin/login", async (req, res) => {
  try {
    await loadAuthConfigFromSsm();
  } catch {
    /* use cached env */
  }

  const clientId = cognitoAdminsClientId;
  if (!clientId) {
    return res.status(503).json({
      error: "Admins Cognito app client is not configured"
    });
  }

  const { email, password } = req.body || {};
  if (!email || typeof email !== "string" || !password || typeof password !== "string") {
    return res.status(400).json({
      error: "email and password are required"
    });
  }

  try {
    const out = await getCognitoIdpClient().send(
      new InitiateAuthCommand({
        ClientId: clientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: email.trim(),
          PASSWORD: password
        }
      })
    );

    if (out.AuthenticationResult?.AccessToken) {
      return res.status(200).json({
        accessToken: out.AuthenticationResult.AccessToken,
        idToken: out.AuthenticationResult.IdToken,
        tokenType: out.AuthenticationResult.TokenType || "Bearer",
        expiresIn: out.AuthenticationResult.ExpiresIn
      });
    }

    if (out.ChallengeName && out.Session) {
      return res.status(200).json({
        challenge: out.ChallengeName,
        session: out.Session,
        challengeParameters: out.ChallengeParameters || {}
      });
    }

    return res.status(401).json({
      error: "Unexpected Cognito response"
    });
  } catch (error) {
    return res.status(401).json({
      error: "Login failed",
      message: error.message || String(error)
    });
  }
});

app.post("/auth/cognito-admin/respond-mfa", async (req, res) => {
  try {
    await loadAuthConfigFromSsm();
  } catch {
    /* use cached env */
  }

  const clientId = cognitoAdminsClientId;
  if (!clientId) {
    return res.status(503).json({
      error: "Admins Cognito app client is not configured"
    });
  }

  const { email, session, mfaCode, challengeName } = req.body || {};
  if (!email || !session || !mfaCode) {
    return res.status(400).json({
      error: "email, session, and mfaCode are required"
    });
  }

  const challenge = challengeName || "SOFTWARE_TOKEN_MFA";

  try {
    const out = await getCognitoIdpClient().send(
      new RespondToAuthChallengeCommand({
        ClientId: clientId,
        ChallengeName: challenge,
        Session: session,
        ChallengeResponses: {
          USERNAME: String(email).trim(),
          SOFTWARE_TOKEN_MFA_CODE: String(mfaCode).trim()
        }
      })
    );

    if (out.AuthenticationResult?.AccessToken) {
      return res.status(200).json({
        accessToken: out.AuthenticationResult.AccessToken,
        idToken: out.AuthenticationResult.IdToken,
        tokenType: out.AuthenticationResult.TokenType || "Bearer",
        expiresIn: out.AuthenticationResult.ExpiresIn
      });
    }

    if (out.ChallengeName && out.Session) {
      return res.status(200).json({
        challenge: out.ChallengeName,
        session: out.Session,
        challengeParameters: out.ChallengeParameters || {}
      });
    }

    return res.status(401).json({
      error: "Unexpected Cognito response"
    });
  } catch (error) {
    return res.status(401).json({
      error: "MFA verification failed",
      message: error.message || String(error)
    });
  }
});

// Local fallback endpoints
app.post("/auth/register", async (req, res) => {
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

  if (isCognitoConfigured()) {
    const clientId = cognitoCustomersClientId;
    const poolId = cognitoCustomersUserPoolId;
    if (!clientId) {
      return res.status(503).json({
        error: "Customers Cognito app client is not configured"
      });
    }

    const normalizedEmail = email.trim();

    try {
      const signUpOut = await getCognitoIdpClient().send(
        new SignUpCommand({
          ClientId: clientId,
          Username: normalizedEmail,
          Password: password,
          UserAttributes: [
            { Name: "email", Value: normalizedEmail }
          ]
        })
      );

      // Standard UX: allow immediate login after signup.
      if (!signUpOut.UserConfirmed && poolId) {
        const adminUsername = signUpOut.UserSub || normalizedEmail;
        try {
          await getCognitoIdpClient().send(
            new AdminConfirmSignUpCommand({
              UserPoolId: poolId,
              Username: adminUsername
            })
          );
          await getCognitoIdpClient().send(
            new AdminUpdateUserAttributesCommand({
              UserPoolId: poolId,
              Username: adminUsername,
              UserAttributes: [{ Name: "email_verified", Value: "true" }]
            })
          );
        } catch (confirmError) {
          return res.status(400).json({
            error: "Register failed",
            message: confirmError.message || String(confirmError)
          });
        }
      }

      try {
        const authOut = await getCognitoIdpClient().send(
          new InitiateAuthCommand({
            ClientId: clientId,
            AuthFlow: "USER_PASSWORD_AUTH",
            AuthParameters: {
              USERNAME: normalizedEmail,
              PASSWORD: password
            }
          })
        );

        if (authOut.AuthenticationResult?.AccessToken) {
          return res.status(201).json({
            status: "registered",
            userSub: signUpOut.UserSub || null,
            userConfirmed: true,
            accessToken: authOut.AuthenticationResult.AccessToken,
            idToken: authOut.AuthenticationResult.IdToken,
            tokenType: authOut.AuthenticationResult.TokenType || "Bearer",
            expiresIn: authOut.AuthenticationResult.ExpiresIn
          });
        }
      } catch {
        // If auto-login fails unexpectedly, still return successful registration.
      }

      return res.status(201).json({
        status: "registered",
        userSub: signUpOut.UserSub || null,
        userConfirmed: true,
        message: "Account created successfully."
      });
    } catch (error) {
      const message = error.message || String(error);
      const isDuplicate = String(error.name || "").includes("UsernameExists");
      return res.status(isDuplicate ? 409 : 400).json({
        error: isDuplicate ? "User already exists" : "Register failed",
        message
      });
    }
  }

  if (!enableLocalAuth) {
    return res.status(503).json({
      error: "Local register is disabled"
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
    passwordHash: hashPassword(password),
    role: selectedRole
  };
  users.push(newUser);

  const token = createToken();
  const sessionPayload = sanitizeUser(newUser);
  activeTokens.set(token, sessionPayload);

  return res.status(201).json({
    user: sessionPayload,
    accessToken: token,
    tokenType: "Bearer"
  });
});

app.post("/auth/login", (req, res) => {
  const { email, password } = req.body || {};

  if (isCognitoConfigured()) {
    const clientId = cognitoCustomersClientId;
    if (!clientId) {
      return res.status(503).json({
        error: "Customers Cognito app client is not configured"
      });
    }

    return getCognitoIdpClient()
      .send(
        new InitiateAuthCommand({
          ClientId: clientId,
          AuthFlow: "USER_PASSWORD_AUTH",
          AuthParameters: {
            USERNAME: String(email || "").trim(),
            PASSWORD: String(password || "")
          }
        })
      )
      .then((out) => {
        if (out.AuthenticationResult?.AccessToken) {
          return res.status(200).json({
            accessToken: out.AuthenticationResult.AccessToken,
            idToken: out.AuthenticationResult.IdToken,
            tokenType: out.AuthenticationResult.TokenType || "Bearer",
            expiresIn: out.AuthenticationResult.ExpiresIn
          });
        }

        return res.status(401).json({
          error: "Login failed",
          message: "Unexpected Cognito response"
        });
      })
      .catch((error) => {
        return res.status(401).json({
          error: "Login failed",
          message: error.message || String(error)
        });
      });
  }

  if (!enableLocalAuth) {
    return res.status(503).json({
      error: "Local login is disabled"
    });
  }

  const user = users.find(
    (entry) =>
      entry.email.toLowerCase() === String(email || "").toLowerCase() &&
      entry.passwordHash === hashPassword(password)
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
  loadAuthConfigFromSsm()
    .catch((error) => {
      console.error(`Auth SSM config load failed, continuing with env config: ${error.message}`);
    })
    .finally(() => {
      console.log(`Auth service is running on port ${port}`);
      console.log(`Using AWS_REGION=${awsRegion}`);
      console.log(`Using COGNITO_USER_POOL_ID=${cognitoUserPoolId || "(not set)"}`);
      console.log(`Using COGNITO_CLIENT_ID=${cognitoClientId || "(not set)"}`);
      console.log(`Using COGNITO_CUSTOMERS_USER_POOL_ID=${cognitoCustomersUserPoolId || "(not set)"}`);
      console.log(`Using COGNITO_CUSTOMERS_CLIENT_ID=${cognitoCustomersClientId || "(not set)"}`);
      console.log(`Using COGNITO_ADMINS_USER_POOL_ID=${cognitoAdminsUserPoolId || "(not set)"}`);
      console.log(`Using COGNITO_ADMINS_CLIENT_ID=${cognitoAdminsClientId || "(not set)"}`);
      console.log(`Using COGNITO_ADMIN_GROUP=${cognitoAdminGroup}`);
      console.log(`Using USE_AWS_SSM_AUTH_CONFIG=${useAwsSsmAuthConfig}`);
      console.log(`Using ENABLE_LOCAL_AUTH=${enableLocalAuth}`);
    });
});
