/* ---------- Mobile menu ---------- */
const menuButton = document.getElementById("menuButton");
const navLinks = document.getElementById("navLinks");

function setMenu(open) {
  navLinks.classList.toggle("open", open);
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  menuButton.textContent = open ? "✕" : "☰";
}
menuButton.addEventListener("click", function () { setMenu(!navLinks.classList.contains("open")); });
document.querySelectorAll(".nav-links a").forEach(function (link) {
  link.addEventListener("click", function () { setMenu(false); });
});
document.addEventListener("keydown", function (event) { if (event.key === "Escape") setMenu(false); });

/* ---------- Highlight the nav link of the section on screen ---------- */
const sectionLinks = {};
document.querySelectorAll(".nav-links a[href^='#']").forEach(function (link) {
  sectionLinks[link.getAttribute("href").slice(1)] = link;
});
function markActive(id) {
  Object.keys(sectionLinks).forEach(function (key) { sectionLinks[key].classList.toggle("active", key === id); });
}
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) { if (entry.isIntersecting) markActive(entry.target.id); });
  }, { rootMargin: "-45% 0px -50% 0px" });
  Object.keys(sectionLinks).forEach(function (id) {
    const section = document.getElementById(id);
    if (section) observer.observe(section);
  });
}

/* ---------- Success / error popup ---------- */
const toastWrap = document.getElementById("toastWrap");
function showToast(text, type) {
  const toast = document.createElement("div");
  toast.className = "toast " + (type === "error" ? "toast-error" : "toast-success");
  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.textContent = type === "error" ? "!" : "✓";
  const label = document.createElement("span");
  label.textContent = text;
  toast.appendChild(icon);
  toast.appendChild(label);
  toastWrap.appendChild(toast);
  requestAnimationFrame(function () { toast.classList.add("show"); });
  setTimeout(function () {
    toast.classList.remove("show");
    setTimeout(function () { toast.remove(); }, 300);
  }, 3200);
}

/* ---------- Talking to the server (no page reloads, so no auto-scrolling) ---------- */
async function api(method, url, body) {
  const options = { method: method, headers: {}, credentials: "same-origin" };
  if (body) { options.headers["Content-Type"] = "application/json"; options.body = JSON.stringify(body); }
  let response;
  try { response = await fetch(url, options); }
  catch (error) { throw new Error("Cannot reach the server. Is it running?"); }
  if (response.status === 401) { window.location.href = "/auth"; throw new Error("Please log in again."); }
  let data = {};
  try { data = await response.json(); } catch (error) {}
  if (!response.ok || data.ok === false) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ---------- Portfolio items ---------- */
let items = Array.isArray(window.__ITEMS__) ? window.__ITEMS__ : [];

const itemForm = document.getElementById("itemForm");
const itemId = document.getElementById("itemId");
const itemTitle = document.getElementById("itemTitle");
const itemCategory = document.getElementById("itemCategory");
const itemDescription = document.getElementById("itemDescription");
const itemSubmit = document.getElementById("itemSubmit");
const formTitle = document.getElementById("formTitle");
const cancelEdit = document.getElementById("cancelEdit");
const managerItems = document.getElementById("managerItems");
const itemCount = document.getElementById("itemCount");

function renderPortfolio() {
  // Public sections
  document.querySelectorAll("[data-list]").forEach(function (box) {
    const category = box.getAttribute("data-list");
    const matching = items.filter(function (item) { return item.category === category; });
    box.replaceChildren();
    if (!matching.length) {
      box.appendChild(el("p", "empty-note", "No information added yet. Use the portfolio manager below."));
      return;
    }
    matching.forEach(function (item) {
      if (category === "Hobby") {
        box.appendChild(el("span", "hobby-chip", item.title));
      } else {
        const card = el("article", "info-card");
        card.appendChild(el("h3", "", item.title));
        card.appendChild(el("p", "", item.description));
        box.appendChild(card);
      }
    });
  });

  // Manager list
  itemCount.textContent = items.length;
  managerItems.replaceChildren();
  if (!items.length) {
    managerItems.appendChild(el("p", "empty-note", "No saved items yet. Add your first item using the form."));
    return;
  }
  items.forEach(function (item) {
    const row = el("div", "manager-item");
    row.dataset.id = item.id;
    row.appendChild(el("span", "item-meta", item.category.toUpperCase()));
    row.appendChild(document.createElement("br"));
    row.appendChild(el("strong", "", item.title));
    row.appendChild(el("p", "", item.description));
    const actions = el("div", "item-actions");
    const edit = el("button", "edit-btn", "Edit");
    edit.type = "button";
    edit.dataset.action = "edit";
    const del = el("button", "delete-btn", "Delete");
    del.type = "button";
    del.dataset.action = "delete";
    actions.appendChild(edit);
    actions.appendChild(del);
    row.appendChild(actions);
    managerItems.appendChild(row);
  });
}

function resetItemForm() {
  itemForm.reset();
  itemId.value = "";
  formTitle.textContent = "Add a new item";
  itemSubmit.textContent = "Add item";
  cancelEdit.hidden = true;
}

function startEdit(id) {
  const item = items.find(function (entry) { return entry.id === id; });
  if (!item) return;
  itemId.value = item.id;
  itemTitle.value = item.title;
  itemCategory.value = item.category;
  itemDescription.value = item.description;
  formTitle.textContent = "Update item";
  itemSubmit.textContent = "Save changes";
  cancelEdit.hidden = false;
  // Only scroll if the form is off-screen (e.g. on phones); otherwise stay where you are.
  itemForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  itemTitle.focus({ preventScroll: true });
}

itemForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  if (!itemForm.reportValidity()) return;
  const payload = { title: itemTitle.value, category: itemCategory.value, description: itemDescription.value };
  const editing = Boolean(itemId.value);
  itemSubmit.disabled = true;
  try {
    const data = editing
      ? await api("PUT", "/api/items/" + itemId.value, payload)
      : await api("POST", "/api/items", payload);
    items = data.items;
    renderPortfolio();
    resetItemForm();
    showToast(data.message || (editing ? "Updated successfully!" : "Added successfully!"));
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    itemSubmit.disabled = false;
  }
});

cancelEdit.addEventListener("click", function (event) {
  event.preventDefault(); // stay where we are instead of jumping to #manager
  resetItemForm();
});

managerItems.addEventListener("click", async function (event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const row = button.closest(".manager-item");
  const id = row.dataset.id;
  if (button.dataset.action === "edit") return startEdit(id);

  if (!confirm("Delete this item? This cannot be undone.")) return;
  button.disabled = true;
  try {
    const data = await api("DELETE", "/api/items/" + id);
    items = data.items;
    if (itemId.value === id) resetItemForm();
    renderPortfolio();
    showToast(data.message || "Deleted successfully!");
  } catch (error) {
    button.disabled = false;
    showToast(error.message, "error");
  }
});

renderPortfolio();

/* ---------- Contact form (saved to MongoDB "messages") ---------- */
const contactForm = document.getElementById("contactForm");
const contactSubmit = document.getElementById("contactSubmit");

contactForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  if (!contactForm.reportValidity()) return;
  const payload = {
    name: document.getElementById("contactName").value,
    email: document.getElementById("contactEmail").value,
    message: document.getElementById("contactMessage").value
  };
  contactSubmit.disabled = true;
  contactSubmit.textContent = "Sending...";
  try {
    const data = await api("POST", "/api/contact", payload);
    contactForm.reset();
    showToast(data.message || "Message sent successfully!");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    contactSubmit.disabled = false;
    contactSubmit.textContent = "Send message";
  }
});
