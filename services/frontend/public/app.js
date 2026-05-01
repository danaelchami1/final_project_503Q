const toast = document.getElementById("toast");
const cartList = document.getElementById("cartList");
const productsGrid = document.getElementById("productsGrid");
const sessionBadge = document.getElementById("sessionBadge");
const cartCount = document.getElementById("cartCount");
const checkoutDrawer = document.getElementById("checkoutDrawer");
const checkoutDrawerBackdrop = document.getElementById("checkoutDrawerBackdrop");
const checkoutSummary = document.getElementById("checkoutSummary");
const thankYouOrderId = document.getElementById("thankYouOrderId");
const thankYouEmail = document.getElementById("thankYouEmail");

const session = {
  accessToken: "",
  user: null
};

let toastTimer = null;

function authHeaders() {
  return session.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {};
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message, variant = "info") {
  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.classList.remove("toast-error");
  if (variant === "error") {
    toast.classList.add("toast-error");
  }

  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

async function request(path, options = {}) {
  const headers = {
    ...(options.headers || {}),
    ...authHeaders()
  };

  const response = await fetch(path, { ...options, headers });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const err = new Error(JSON.stringify(body));
    err.status = response.status;
    throw err;
  }
  return body;
}

function requireSignedIn() {
  if (!session.accessToken || !session.user) {
    showToast("Please sign in on Home first.", "error");
    switchPage("home");
    return false;
  }
  return true;
}

function setSession(user, token) {
  session.user = user || null;
  session.accessToken = token || "";
  const label = session.user ? `${session.user.email} (${session.user.role})` : "Guest";
  sessionBadge.textContent = label;
  updateCheckoutEmailHint();
  updateCartCount().catch(() => {});
}

function updateCheckoutEmailHint() {
  const hint = document.getElementById("checkoutEmailHint");
  if (!hint) {
    return;
  }
  const email = session.user && typeof session.user.email === "string" ? session.user.email : "";
  hint.textContent = email || "- (sign in with an email)";
}

function switchPage(page) {
  document.querySelectorAll(".page").forEach((element) => {
    const isCurrent = element.id === `page-${page}`;
    element.classList.toggle("active", isCurrent);
  });
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  if (page === "cart" && session.accessToken) {
    refreshCartView().catch((error) => showToast(error.message || "Could not load cart", "error"));
  }
}

function closeCheckoutDrawer() {
  checkoutDrawer.classList.add("hidden");
  checkoutDrawerBackdrop.classList.add("hidden");
}

function openCheckoutDrawer() {
  checkoutDrawer.classList.remove("hidden");
  checkoutDrawerBackdrop.classList.remove("hidden");
}

function renderProducts(items) {
  if (!Array.isArray(items) || items.length === 0) {
    productsGrid.innerHTML = "<p class='muted'>No products found.</p>";
    return;
  }

  productsGrid.innerHTML = items
    .map(
      (item) => `
      <article class="product-card">
        <h3>${escapeHtml(item.name)}</h3>
        <p class="muted">${escapeHtml(item.category || "general")}</p>
        <p><strong>$${Number(item.price).toFixed(2)}</strong></p>
        <p>${escapeHtml(item.description || "")}</p>
        <button class="quick-add" data-product-id="${escapeHtml(item.id)}">Add to Cart</button>
      </article>
    `
    )
    .join("");

  document.querySelectorAll(".quick-add").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!requireSignedIn()) {
        return;
      }

      const productId = button.dataset.productId;
      try {
        await request(`/api/cart/${encodeURIComponent(session.user.id)}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId, quantity: 1 })
        });
        showToast("Added to cart");
        await updateCartCount();
        switchPage("cart");
      } catch (error) {
        showToast(error.message || "Could not add to cart", "error");
      }
    });
  });
}

function renderCart(data) {
  if (!cartList) {
    return;
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  if (items.length === 0) {
    cartList.innerHTML = "<div class='cart-row'><div>Your cart is empty.</div></div>";
    return;
  }

  const rows = [
    `<div class="cart-row header"><div>Product</div><div>Qty</div><div></div></div>`
  ];

  for (const item of items) {
    rows.push(
      `<div class="cart-row">
        <div>${escapeHtml(item.productId)}</div>
        <div>${escapeHtml(String(item.quantity))}</div>
        <div></div>
      </div>`
    );
  }

  cartList.innerHTML = rows.join("");
}

async function updateCartCount() {
  if (!session.user || !session.user.id || !session.accessToken) {
    cartCount.textContent = "0";
    return;
  }
  try {
    const data = await request(`/api/cart/${encodeURIComponent(session.user.id)}`);
    const count = Array.isArray(data.items)
      ? data.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
      : 0;
    cartCount.textContent = String(count);
  } catch {
    cartCount.textContent = "0";
  }
}

async function refreshCartView() {
  if (!session.user || !session.user.id) {
    renderCart({ items: [] });
    return { items: [] };
  }
  const data = await request(`/api/cart/${encodeURIComponent(session.user.id)}`);
  renderCart(data);
  return data;
}

function renderCheckoutSummary(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  if (items.length === 0) {
    checkoutSummary.innerHTML = "<p class='muted'>Your cart is empty.</p>";
    return;
  }

  const totalItems = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  checkoutSummary.innerHTML = [
    "<div class='checkout-summary-row checkout-summary-head'><span>Item</span><span>Qty</span></div>",
    ...items.map(
      (item) =>
        `<div class='checkout-summary-row'><span>${escapeHtml(item.productId)}</span><span>${escapeHtml(String(item.quantity || 0))}</span></div>`
    ),
    `<div class='checkout-summary-total'>Total units: ${totalItems}</div>`
  ].join("");
}

document.querySelectorAll(".nav-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const page = button.dataset.page;
    switchPage(page);
    closeCheckoutDrawer();
  });
});

document.getElementById("goLoginBtn").addEventListener("click", () => switchPage("login"));
document.getElementById("goRegisterBtn").addEventListener("click", () => switchPage("register"));
document.getElementById("switchToRegisterBtn").addEventListener("click", () => switchPage("register"));
document.getElementById("switchToLoginBtn").addEventListener("click", () => switchPage("login"));

async function syncSessionFromAuthMe(accessToken) {
  if (!accessToken) {
    return;
  }
  try {
    const me = await request("/api/auth/me");
    if (me && me.user) {
      setSession(me.user, accessToken);
    }
  } catch {
    /* keep login/register payload if /me fails */
  }
}

document.getElementById("loginBtn").addEventListener("click", async () => {
  try {
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;
    const data = await request("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const bearerToken = data.idToken || data.accessToken;
    setSession(data.user, bearerToken);
    switchPage("catalog");
    showToast("Signed in");
    await syncSessionFromAuthMe(bearerToken);

    const products = await request("/api/products");
    renderProducts(products);
  } catch (error) {
    showToast(error.message || "Login failed", "error");
  }
});

document.getElementById("registerBtn").addEventListener("click", async () => {
  try {
    const email = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value;
    if (!email || !password) {
      showToast("Enter email and password (min 6 characters).", "error");
      return;
    }
    const data = await request("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, role: "customer" })
    });
    const bearerToken = data.idToken || data.accessToken;
    if (!bearerToken) {
      showToast("Account created - please log in.", "info");
      return;
    }
    setSession(data.user, bearerToken);
    switchPage("catalog");
    showToast("Account created - you are signed in");
    await syncSessionFromAuthMe(bearerToken);
    const products = await request("/api/products");
    renderProducts(products);
  } catch (error) {
    const msg = error.message || "Sign up failed";
    if (String(msg).includes("503") || msg.toLowerCase().includes("cognito")) {
      showToast("Sign-up here is for local dev only. Use your Cognito sign-up flow in production.", "error");
    } else {
      showToast(msg, "error");
    }
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  setSession(null, "");
  renderCart({ items: [] });
  closeCheckoutDrawer();
  showToast("Signed out");
});

document.getElementById("floatingCartBtn").addEventListener("click", () => {
  if (!session.accessToken) {
    showToast("Please sign in first.", "error");
    switchPage("home");
    return;
  }
  switchPage("cart");
  closeCheckoutDrawer();
});

document.getElementById("productsBtn").addEventListener("click", async () => {
  try {
    const products = await request("/api/products");
    renderProducts(products);
  } catch (error) {
    showToast(error.message || "Could not load products", "error");
  }
});

document.getElementById("addCartBtn").addEventListener("click", async () => {
  if (!requireSignedIn()) {
    return;
  }

  try {
    const productId = document.getElementById("productId").value;
    const quantity = Number(document.getElementById("quantity").value);
    await request(`/api/cart/${encodeURIComponent(session.user.id)}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, quantity })
    });
    showToast("Added to cart");
    await updateCartCount();
    await refreshCartView();
  } catch (error) {
    showToast(error.message || "Could not add item", "error");
  }
});

document.getElementById("viewCartBtn").addEventListener("click", async () => {
  if (!requireSignedIn()) {
    return;
  }
  try {
    await refreshCartView();
    showToast("Cart updated");
  } catch (error) {
    showToast(error.message || "Could not refresh cart", "error");
  }
});

document.getElementById("clearCartBtn").addEventListener("click", async () => {
  if (!requireSignedIn()) {
    return;
  }
  try {
    await request(`/api/cart/${encodeURIComponent(session.user.id)}`, { method: "DELETE" });
    showToast("Cart cleared");
    await updateCartCount();
    await refreshCartView();
  } catch (error) {
    showToast(error.message || "Could not clear cart", "error");
  }
});

document.getElementById("goCheckoutBtn").addEventListener("click", () => {
  if (!requireSignedIn()) {
    return;
  }
  refreshCartView()
    .then((data) => {
      updateCheckoutEmailHint();
      renderCheckoutSummary(data);
      openCheckoutDrawer();
    })
    .catch((error) => showToast(error.message || "Could not load checkout", "error"));
});

document.getElementById("closeCheckoutDrawerBtn").addEventListener("click", closeCheckoutDrawer);
checkoutDrawerBackdrop.addEventListener("click", closeCheckoutDrawer);

document.getElementById("checkoutBtn").addEventListener("click", async () => {
  if (!requireSignedIn()) {
    return;
  }
  try {
    const data = await request("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const orderId = data.orderId || "-";
    const email = session.user?.email || "your email";
    thankYouOrderId.textContent = orderId;
    thankYouEmail.textContent = email;
    showToast(`Order placed: ${orderId}. Invoice will be emailed shortly.`);
    closeCheckoutDrawer();
    switchPage("thank-you");
    await updateCartCount();
    await refreshCartView();
  } catch (error) {
    showToast(error.message || "Checkout failed", "error");
  }
});

document.getElementById("continueShoppingBtn").addEventListener("click", async () => {
  switchPage("catalog");
  try {
    const products = await request("/api/products");
    renderProducts(products);
  } catch (error) {
    showToast(error.message || "Could not load products", "error");
  }
});
