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
const catalogSearch = document.getElementById("catalogSearch");
const catalogCategory = document.getElementById("catalogCategory");
const catalogCategoryChips = document.getElementById("catalogCategoryChips");
const catalogSummary = document.getElementById("catalogSummary");

const session = {
  accessToken: "",
  user: null
};

let toastTimer = null;
let allProducts = [];

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

  if (page === "catalog") {
    loadCatalogData().catch((error) => showToast(error.message || "Could not load products", "error"));
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
      } catch (error) {
        showToast(error.message || "Could not add to cart", "error");
      }
    });
  });
}

function renderCatalogFilters(items) {
  const categories = Array.from(
    new Set(
      (Array.isArray(items) ? items : [])
        .map((item) => String(item.category || "").trim().toLowerCase())
        .filter(Boolean)
    )
  ).sort();

  catalogCategory.innerHTML = '<option value="">All categories</option>';
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    catalogCategory.appendChild(option);
  }

  const selected = String(catalogCategory.value || "").toLowerCase();
  const chips = ['<button type="button" class="catalog-chip active" data-category="">All</button>'];
  for (const category of categories) {
    const activeClass = selected === category ? " active" : "";
    chips.push(
      `<button type="button" class="catalog-chip${activeClass}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`
    );
  }
  catalogCategoryChips.innerHTML = chips.join("");

  catalogCategoryChips.querySelectorAll(".catalog-chip").forEach((button) => {
    button.addEventListener("click", () => {
      catalogCategory.value = button.dataset.category || "";
      applyCatalogFilters();
    });
  });
}

function applyCatalogFilters() {
  const query = String(catalogSearch.value || "").trim().toLowerCase();
  const category = String(catalogCategory.value || "").trim().toLowerCase();

  const filtered = allProducts.filter((item) => {
    const haystack = [item.id, item.name, item.category, item.description].join(" ").toLowerCase();
    const matchQuery = !query || haystack.includes(query);
    const matchCategory = !category || String(item.category || "").toLowerCase() === category;
    return matchQuery && matchCategory;
  });

  renderProducts(filtered);
  catalogSummary.textContent = `Showing ${filtered.length} of ${allProducts.length} products`;

  catalogCategoryChips.querySelectorAll(".catalog-chip").forEach((button) => {
    const isActive = String(button.dataset.category || "") === String(catalogCategory.value || "");
    button.classList.toggle("active", isActive);
  });
}

async function loadCatalogData() {
  const products = await request("/api/products");
  allProducts = Array.isArray(products) ? products : [];
  renderCatalogFilters(allProducts);
  applyCatalogFilters();
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
    `<div class="cart-row header"><div>Item</div><div>Qty</div><div>Price</div><div>Actions</div></div>`
  ];

  const byId = new Map((allProducts || []).map((product) => [String(product.id), product]));

  for (const item of items) {
    const product = byId.get(String(item.productId));
    const displayName = product?.name || item.productId;
    const unitPrice = Number(product?.price || 0);
    rows.push(
      `<div class="cart-row">
        <div>${escapeHtml(displayName)}</div>
        <div class="cart-qty-stepper">
          <button class="ghost-btn cart-qty-btn" type="button" data-cart-dec="${escapeHtml(item.productId)}">-</button>
          <span class="cart-qty-value" data-cart-qty-value="${escapeHtml(item.productId)}">${escapeHtml(String(item.quantity))}</span>
          <button class="ghost-btn cart-qty-btn" type="button" data-cart-inc="${escapeHtml(item.productId)}">+</button>
        </div>
        <div>${formatMoney(unitPrice)}</div>
        <div class="cart-actions">
          <button class="danger-btn" type="button" data-cart-remove="${escapeHtml(item.productId)}">Remove</button>
        </div>
      </div>`
    );
  }

  cartList.innerHTML = rows.join("");
  cartList.querySelectorAll("[data-cart-inc]").forEach((button) => {
    button.addEventListener("click", () => changeCartItemQuantity(button.dataset.cartInc, 1));
  });
  cartList.querySelectorAll("[data-cart-dec]").forEach((button) => {
    button.addEventListener("click", () => changeCartItemQuantity(button.dataset.cartDec, -1));
  });
  cartList.querySelectorAll("[data-cart-remove]").forEach((button) => {
    button.addEventListener("click", () => removeCartItem(button.dataset.cartRemove));
  });
}

async function removeCartItem(productId) {
  if (!requireSignedIn()) {
    return;
  }
  try {
    await request(`/api/cart/${encodeURIComponent(session.user.id)}/items/${encodeURIComponent(productId)}`, {
      method: "DELETE"
    });
    showToast("Item removed");
    await updateCartCount();
    await refreshCartView();
  } catch (error) {
    showToast(error.message || "Could not remove item", "error");
  }
}

async function setCartItemQuantity(productId, quantity) {
  if (!requireSignedIn()) {
    return;
  }
  if (!Number.isInteger(quantity) || quantity < 0) {
    showToast("Quantity must be a non-negative integer", "error");
    return;
  }
  try {
    await request(`/api/cart/${encodeURIComponent(session.user.id)}/items/${encodeURIComponent(productId)}`, {
      method: "DELETE"
    });
    if (quantity > 0) {
      await request(`/api/cart/${encodeURIComponent(session.user.id)}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity })
      });
      showToast("Quantity updated");
    } else {
      showToast("Item removed");
    }
    await updateCartCount();
    await refreshCartView();
  } catch (error) {
    showToast(error.message || "Could not update quantity", "error");
  }
}

async function changeCartItemQuantity(productId, delta) {
  const valueEl = document.querySelector(`[data-cart-qty-value="${String(productId).replace(/"/g, '\\"')}"]`);
  const current = Number(valueEl?.textContent || 0);
  const next = current + Number(delta || 0);
  await setCartItemQuantity(productId, next < 0 ? 0 : next);
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
  await ensureProductsLoaded();
  const data = await request(`/api/cart/${encodeURIComponent(session.user.id)}`);
  renderCart(data);
  return data;
}

async function ensureProductsLoaded() {
  if (Array.isArray(allProducts) && allProducts.length > 0) {
    return allProducts;
  }
  try {
    const products = await request("/api/products");
    allProducts = Array.isArray(products) ? products : [];
  } catch {
    allProducts = [];
  }
  return allProducts;
}

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function renderCheckoutSummary(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  if (items.length === 0) {
    checkoutSummary.innerHTML = "<p class='muted'>Your cart is empty.</p>";
    return;
  }

  const byId = new Map((allProducts || []).map((product) => [String(product.id), product]));
  const detailedItems = items.map((item) => {
    const quantity = Number(item.quantity || 0);
    const product = byId.get(String(item.productId));
    const name = product?.name || item.productId;
    const unitPrice = Number(product?.price || 0);
    const lineTotal = unitPrice * quantity;
    return {
      name,
      quantity,
      unitPrice,
      lineTotal
    };
  });

  const grandTotal = detailedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  checkoutSummary.innerHTML = [
    "<div class='checkout-summary-row checkout-summary-head'><span>Item</span><span>Qty</span><span>Price</span><span>Total</span></div>",
    ...detailedItems.map(
      (item) =>
        `<div class='checkout-summary-row'><span>${escapeHtml(item.name)}</span><span>${escapeHtml(String(item.quantity))}</span><span>${formatMoney(item.unitPrice)}</span><span>${formatMoney(item.lineTotal)}</span></div>`
    ),
    `<div class='checkout-summary-total'>Grand total: ${formatMoney(grandTotal)}</div>`
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
    await loadCatalogData();
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
    await loadCatalogData();
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

catalogSearch.addEventListener("input", applyCatalogFilters);
catalogCategory.addEventListener("change", applyCatalogFilters);
document.getElementById("clearCatalogFiltersBtn").addEventListener("click", () => {
  catalogSearch.value = "";
  catalogCategory.value = "";
  applyCatalogFilters();
});

document.getElementById("refreshCatalogBtn").addEventListener("click", async () => {
  try {
    await loadCatalogData();
    showToast("Catalog refreshed");
  } catch (error) {
    showToast(error.message || "Could not refresh catalog", "error");
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
  Promise.all([refreshCartView(), ensureProductsLoaded()])
    .then((data) => {
      const cartData = Array.isArray(data) ? data[0] : data;
      updateCheckoutEmailHint();
      renderCheckoutSummary(cartData);
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
    await loadCatalogData();
  } catch (error) {
    showToast(error.message || "Could not load products", "error");
  }
});
