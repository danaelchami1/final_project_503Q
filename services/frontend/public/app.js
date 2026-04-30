const toast = document.getElementById("toast");
const cartList = document.getElementById("cartList");
const productsGrid = document.getElementById("productsGrid");
const sessionBadge = document.getElementById("sessionBadge");
const cartCount = document.getElementById("cartCount");

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
  updateCartCount().catch(() => {});
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
    return;
  }
  const data = await request(`/api/cart/${encodeURIComponent(session.user.id)}`);
  renderCart(data);
}

document.querySelectorAll(".nav-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const page = button.dataset.page;
    if ((page === "cart" || page === "checkout") && !session.accessToken) {
      showToast("Please sign in first.", "error");
      switchPage("home");
      return;
    }
    switchPage(page);
  });
});

document.getElementById("loginBtn").addEventListener("click", async () => {
  try {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const data = await request("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    setSession(data.user, data.accessToken);
    showToast("Signed in");
    switchPage("catalog");

    const products = await request("/api/products");
    renderProducts(products);
  } catch (error) {
    showToast(error.message || "Login failed", "error");
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  setSession(null, "");
  renderCart({ items: [] });
  showToast("Signed out");
});

document.getElementById("floatingCartBtn").addEventListener("click", () => {
  if (!session.accessToken) {
    showToast("Please sign in first.", "error");
    switchPage("home");
    return;
  }
  switchPage("cart");
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
    showToast(`Order placed: ${data.orderId}`);
    await updateCartCount();
    await refreshCartView();
  } catch (error) {
    showToast(error.message || "Checkout failed", "error");
  }
});

document.getElementById("ordersBtn").addEventListener("click", async () => {
  if (!requireSignedIn()) {
    return;
  }
  try {
    const orders = await request("/api/orders");
    const count = Array.isArray(orders) ? orders.length : 0;
    showToast(`Loaded ${count} orders (admin only)`);
  } catch (error) {
    showToast(error.message || "Could not load orders", "error");
  }
});

document.getElementById("adminCheckBtn").addEventListener("click", async () => {
  if (!requireSignedIn()) {
    return;
  }
  try {
    await request("/api/auth/admin-check");
    showToast("Admin access OK");
  } catch (error) {
    showToast(error.message || "Admin check failed", "error");
  }
});
