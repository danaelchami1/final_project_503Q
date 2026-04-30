const output = document.getElementById("output");
const cartOutput = document.getElementById("cartOutput");
const productsGrid = document.getElementById("productsGrid");
const sessionBadge = document.getElementById("sessionBadge");
const cartCount = document.getElementById("cartCount");

const session = {
  accessToken: "",
  user: null
};

function authHeaders() {
  return session.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {};
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
    throw new Error(JSON.stringify(body));
  }
  return body;
}

function show(data) {
  output.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

function setSession(user, token) {
  session.user = user || null;
  session.accessToken = token || "";
  const label = session.user ? `${session.user.email} (${session.user.role})` : "Guest";
  sessionBadge.textContent = label;
  if (session.user && session.user.id) {
    document.getElementById("userId").value = session.user.id;
  }
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
        <h3>${item.name}</h3>
        <p class="muted">${item.category || "general"}</p>
        <p><strong>$${Number(item.price).toFixed(2)}</strong></p>
        <p>${item.description || ""}</p>
        <button class="quick-add" data-product-id="${item.id}">Add to Cart</button>
      </article>
    `
    )
    .join("");

  document.querySelectorAll(".quick-add").forEach((button) => {
    button.addEventListener("click", async () => {
      const userId = document.getElementById("userId").value;
      const productId = button.dataset.productId;
      try {
        const result = await request(`/api/cart/${encodeURIComponent(userId)}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId, quantity: 1 })
        });
        show({ added: productId, cart: result });
        updateCartCount().catch(() => {});
        switchPage("cart");
      } catch (error) {
        show(error.message);
      }
    });
  });
}

async function updateCartCount() {
  if (!session.user || !session.user.id) {
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

document.querySelectorAll(".nav-btn").forEach((button) => {
  button.addEventListener("click", () => switchPage(button.dataset.page));
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
    show({ message: "Logged in", user: data.user });
  } catch (error) {
    show(error.message);
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  setSession(null, "");
  show("Logged out.");
});

document.getElementById("floatingCartBtn").addEventListener("click", () => {
  switchPage("cart");
});

document.getElementById("whoamiBtn").addEventListener("click", async () => {
  try {
    const data = await request("/api/auth/me");
    setSession(data.user, session.accessToken);
    show(data);
  } catch (error) {
    show(error.message);
  }
});

document.getElementById("productsBtn").addEventListener("click", async () => {
  try {
    const products = await request("/api/products");
    renderProducts(products);
    show({ count: Array.isArray(products) ? products.length : 0 });
  } catch (error) {
    show(error.message);
  }
});

document.getElementById("addCartBtn").addEventListener("click", async () => {
  try {
    const userId = document.getElementById("userId").value;
    const productId = document.getElementById("productId").value;
    const quantity = Number(document.getElementById("quantity").value);
    const data = await request(`/api/cart/${encodeURIComponent(userId)}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, quantity })
    });
    cartOutput.textContent = JSON.stringify(data, null, 2);
    updateCartCount().catch(() => {});
    show("Item added to cart.");
  } catch (error) {
    show(error.message);
  }
});

document.getElementById("viewCartBtn").addEventListener("click", async () => {
  try {
    const userId = document.getElementById("userId").value;
    const data = await request(`/api/cart/${encodeURIComponent(userId)}`);
    cartOutput.textContent = JSON.stringify(data, null, 2);
    updateCartCount().catch(() => {});
    show("Cart refreshed.");
  } catch (error) {
    show(error.message);
  }
});

document.getElementById("clearCartBtn").addEventListener("click", async () => {
  try {
    const userId = document.getElementById("userId").value;
    const data = await request(`/api/cart/${encodeURIComponent(userId)}`, { method: "DELETE" });
    cartOutput.textContent = JSON.stringify(data, null, 2);
    updateCartCount().catch(() => {});
    show("Cart cleared.");
  } catch (error) {
    show(error.message);
  }
});

document.getElementById("checkoutBtn").addEventListener("click", async () => {
  try {
    const data = await request("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    show({ message: "Order placed", order: data });
  } catch (error) {
    show(error.message);
  }
});

document.getElementById("ordersBtn").addEventListener("click", async () => {
  try {
    show(await request("/api/orders"));
  } catch (error) {
    show(error.message);
  }
});

document.getElementById("adminCheckBtn").addEventListener("click", async () => {
  try {
    show(await request("/api/auth/admin-check"));
  } catch (error) {
    show(error.message);
  }
});
