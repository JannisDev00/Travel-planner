const INTERESTS = [
  "beach", "relaxation", "culture", "history", "food",
  "nightlife", "adventure", "nature", "wildlife", "shopping",
];

const state = { user: null, selectedInterests: new Set(), lastResult: null };

const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  });
  children.forEach((c) => node.appendChild(c));
  return node;
};

function renderInterestChips() {
  const grid = document.getElementById("interestGrid");
  grid.innerHTML = "";
  INTERESTS.forEach((interest) => {
    const chip = el("div", { class: "interest-chip", text: interest });
    chip.addEventListener("click", () => {
      if (state.selectedInterests.has(interest)) {
        state.selectedInterests.delete(interest);
        chip.classList.remove("selected");
      } else {
        state.selectedInterests.add(interest);
        chip.classList.add("selected");
      }
    });
    grid.appendChild(chip);
  });
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function renderAuthArea() {
  const area = document.getElementById("authArea");
  area.innerHTML = "";
  if (state.user) {
    area.appendChild(el("span", { text: state.user.email }));
    const logoutBtn = el("button", { text: "Log out" });
    logoutBtn.addEventListener("click", async () => {
      await api("/api/auth/logout", { method: "POST" });
      state.user = null;
      renderAuthArea();
      document.getElementById("savedSection").classList.add("hidden");
    });
    area.appendChild(logoutBtn);
  } else {
    const loginBtn = el("button", { text: "Log in / Sign up" });
    loginBtn.addEventListener("click", () => openAuthDialog("login"));
    area.appendChild(loginBtn);
  }
}

function openAuthDialog(mode) {
  const dialog = document.getElementById("authDialog");
  const title = document.getElementById("authTitle");
  const toggle = document.getElementById("authToggle");
  const errorEl = document.getElementById("authError");
  const displayNameField = document.getElementById("displayNameField");
  errorEl.textContent = "";
  dialog.dataset.mode = mode;
  title.textContent = mode === "login" ? "Log in" : "Create an account";
  toggle.textContent = mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in";
  displayNameField.classList.toggle("hidden", mode !== "signup");
  dialog.showModal();
}

function setupAuthDialog() {
  const dialog = document.getElementById("authDialog");
  const form = document.getElementById("authForm");
  const toggle = document.getElementById("authToggle");
  const cancel = document.getElementById("authCancel");
  const errorEl = document.getElementById("authError");

  toggle.addEventListener("click", () => {
    const mode = dialog.dataset.mode === "login" ? "signup" : "login";
    openAuthDialog(mode);
  });

  cancel.addEventListener("click", () => dialog.close());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    const formData = new FormData(form);
    const email = formData.get("email");
    const password = formData.get("password");
    const displayName = formData.get("displayName");
    const mode = dialog.dataset.mode;

    try {
      const data = await api(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(mode === "signup" ? { email, password, displayName } : { email, password }),
      });
      state.user = data;
      renderAuthArea();
      dialog.close();
      form.reset();
      loadSavedPlans();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

function renderPlans(plans, { showSaveButton }) {
  const results = document.getElementById("results");
  results.innerHTML = "";

  plans.forEach((plan) => {
    const reasons = el("div", { class: "reasons", text: plan.reasons.join(" · ") });
    const itineraryList = el("ol");
    plan.itinerary.forEach((day) => {
      itineraryList.appendChild(el("li", { text: `Day ${day.day}: ${day.plan}` }));
    });

    const card = el("div", { class: "plan-card" }, [
      el("h3", { text: `${plan.destination}, ${plan.country}` }),
      el("div", { class: "meta", text: `${plan.description}` }),
      el("div", { class: "meta", text: `Estimated cost: ~$${plan.estimatedTotalCostUSD} total (~$${plan.estimatedDailyCostUSD}/day)` }),
      reasons,
      itineraryList,
    ]);

    if (showSaveButton) {
      const saveBtn = el("button", { class: "primary", text: "Save this plan" });
      const saveError = el("span", { class: "error inline-error" });
      saveBtn.addEventListener("click", async () => {
        saveError.textContent = "";
        try {
          await api("/api/plans", {
            method: "POST",
            body: JSON.stringify({ input: state.lastResult.input, plan }),
          });
          saveBtn.textContent = "Saved!";
          saveBtn.disabled = true;
          loadSavedPlans();
        } catch (err) {
          saveError.textContent = err.message;
        }
      });
      card.appendChild(el("div", { class: "plan-actions" }, [saveBtn, saveError]));
    }

    results.appendChild(card);
  });
}

async function loadSavedPlans() {
  const section = document.getElementById("savedSection");
  const container = document.getElementById("savedPlans");
  if (!state.user) {
    section.classList.add("hidden");
    return;
  }

  const saved = await api("/api/plans");
  section.classList.remove("hidden");
  container.innerHTML = "";

  if (!saved.length) {
    container.appendChild(el("p", { text: "No saved plans yet.", class: "meta" }));
    return;
  }

  saved.forEach((entry) => {
    const label = `${entry.plan.destination} — ${entry.input.length} days, $${entry.input.budgetUSD} (saved ${new Date(entry.createdAt).toLocaleDateString()})`;

    const topRow = el("div", { class: "saved-plan-row" }, [el("span", { text: label })]);
    const delBtn = el("button", { text: "Delete" });
    delBtn.addEventListener("click", async () => {
      await api(`/api/plans/${entry.id}`, { method: "DELETE" });
      loadSavedPlans();
    });
    topRow.appendChild(delBtn);

    const visibilityLabel = el("label", { class: "visibility-toggle" });
    const checkbox = el("input", { type: "checkbox" });
    if (entry.isPublic) checkbox.setAttribute("checked", "checked");
    visibilityLabel.appendChild(checkbox);
    visibilityLabel.appendChild(
      el("span", { text: " Visible to other travelers interested in this destination" })
    );
    const visibilityError = el("span", { class: "error inline-error" });

    const communityPanel = el("div", { class: "community-panel hidden" });
    const communityBtn = el("button", { text: "See who else is interested" });

    async function loadCommunity() {
      communityPanel.classList.remove("hidden");
      communityPanel.innerHTML = "";
      try {
        const data = await api(`/api/community/${encodeURIComponent(entry.destination)}`);
        if (!data.travelers.length) {
          communityPanel.appendChild(el("p", { class: "meta", text: "No one else has opted in yet for this destination." }));
          return;
        }
        data.travelers.forEach((t) => {
          communityPanel.appendChild(
            el("div", { class: "traveler-row", text: `${t.displayName} — ${t.ageRange}, ${t.length} days, ${t.budgetTier} budget, interests: ${t.interests.join(", ")}` })
          );
        });
      } catch (err) {
        communityPanel.appendChild(el("p", { class: "error", text: err.message }));
      }
    }

    communityBtn.addEventListener("click", () => {
      if (!communityPanel.classList.contains("hidden")) {
        communityPanel.classList.add("hidden");
        return;
      }
      loadCommunity();
    });

    checkbox.addEventListener("change", async () => {
      visibilityError.textContent = "";
      try {
        await api(`/api/plans/${entry.id}`, {
          method: "PATCH",
          body: JSON.stringify({ isPublic: checkbox.checked }),
        });
        entry.isPublic = checkbox.checked;
        if (!communityPanel.classList.contains("hidden")) loadCommunity();
      } catch (err) {
        checkbox.checked = !checkbox.checked;
        visibilityError.textContent = err.message;
      }
    });

    const wrapper = el("div", { class: "saved-plan-entry" }, [
      topRow,
      visibilityLabel,
      visibilityError,
      communityBtn,
      communityPanel,
    ]);
    container.appendChild(wrapper);
  });
}

function setupPlanForm() {
  const form = document.getElementById("planForm");
  const errorEl = document.getElementById("formError");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";

    if (!state.selectedInterests.size) {
      errorEl.textContent = "Pick at least one interest.";
      return;
    }

    const formData = new FormData(form);
    const body = {
      age: Number(formData.get("age")),
      gender: formData.get("gender"),
      length: Number(formData.get("length")),
      budgetUSD: Number(formData.get("budgetUSD")),
      interests: Array.from(state.selectedInterests),
    };

    try {
      const data = await api("/api/plan", { method: "POST", body: JSON.stringify(body) });
      state.lastResult = data;
      renderPlans(data.plans, { showSaveButton: !!state.user });
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

async function init() {
  renderInterestChips();
  setupAuthDialog();
  setupPlanForm();

  try {
    const { user } = await api("/api/auth/me");
    state.user = user;
  } catch {
    state.user = null;
  }
  renderAuthArea();
  loadSavedPlans();
}

init();
