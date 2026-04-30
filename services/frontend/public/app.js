const output = document.getElementById("output");

async function request(path, options = {}) {
  const response = await fetch(path, options);
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

document.getElementById("loginBtn").addEventListener("click", async () => {
  try {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const data = await request("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    show(data);
  } catch (error) {
    show(error.message);
  }
});

document.getElementById("productsBtn").addEventListener("click", async () => {
  try {
    show(await request("/api/products"));
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
    show(data);
  } catch (error) {
    show(error.message);
  }
});

document.getElementById("viewCartBtn").addEventListener("click", async () => {
  try {
    const userId = document.getElementById("userId").value;
    show(await request(`/api/cart/${encodeURIComponent(userId)}`));
  } catch (error) {
    show(error.message);
  }
});

document.getElementById("clearCartBtn").addEventListener("click", async () => {
  try {
    const userId = document.getElementById("userId").value;
    show(await request(`/api/cart/${encodeURIComponent(userId)}`, { method: "DELETE" }));
  } catch (error) {
    show(error.message);
  }
});

document.getElementById("checkoutBtn").addEventListener("click", async () => {
  try {
    const userId = document.getElementById("checkoutUserId").value;
    const email = document.getElementById("checkoutEmail").value;
    const data = await request("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, email })
    });
    show(data);
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
