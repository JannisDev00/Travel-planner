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
    const chip = el("div", { class: "interest-chip", text: interest, "data-interest": interest });
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

function formatCityLabel(city) {
  return `${city.name}, ${city.country} (${city.iata})`;
}

function setupCityAutocomplete() {
  const textInput = document.getElementById("originCityText");
  const hiddenInput = document.getElementById("originCityValue");
  const datalist = document.getElementById("originCityOptions");
  let cityLookup = {};
  let debounceTimer;

  textInput.addEventListener("input", () => {
    hiddenInput.value = cityLookup[textInput.value] || "";

    clearTimeout(debounceTimer);
    const q = textInput.value.trim();
    if (q.length < 2) {
      datalist.innerHTML = "";
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        const matches = await api(`/api/cities?q=${encodeURIComponent(q)}`);
        datalist.innerHTML = "";
        cityLookup = {};
        matches.forEach((city) => {
          const label = formatCityLabel(city);
          cityLookup[label] = city.iata;
          datalist.appendChild(el("option", { value: label }));
        });
      } catch {
        // Transient search errors aren't worth surfacing on every keystroke.
      }
    }, 200);
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
    const logoutBtn = el("button", { text: "🧳 Log out" });
    logoutBtn.addEventListener("click", async () => {
      await api("/api/auth/logout", { method: "POST" });
      state.user = null;
      renderAuthArea();
      document.getElementById("savedSection").classList.add("hidden");
    });
    area.appendChild(logoutBtn);
  } else {
    const loginBtn = el("button", { class: "primary", text: "🛂 Log in / Sign up" });
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

// Hostelworld needs a known continent/country path (not a free-text city search,
// which 404s for anything it doesn't already have an exact listing for), so hostel
// links point to the country-level results page rather than the specific city.
const HOSTELWORLD_COUNTRY_PATHS = {
  Thailand: "asia/thailand",
  Indonesia: "asia/indonesia",
  Portugal: "europe/portugal",
  Iceland: "europe/iceland",
  Japan: "asia/japan",
  "South Africa": "africa/south-africa",
  Spain: "europe/spain",
  Switzerland: "europe/switzerland",
  Morocco: "africa/morocco",
  "Costa Rica": "north-america/costa-rica",
  USA: "north-america/usa",
  Maldives: "asia/maldives",
  Vietnam: "asia/vietnam",
  "Czech Republic": "europe/czech-republic",
  "New Zealand": "oceania/new-zealand",
  Italy: "europe/italy",
  Seychelles: "africa/seychelles",
  Hungary: "europe/hungary",
  Kenya: "africa/kenya",
};

const ACCOMMODATION_SITES = {
  hostel: {
    url: (city, country) => {
      const path = HOSTELWORLD_COUNTRY_PATHS[country];
      return path ? `https://www.hostelworld.com/hostels/${path}/` : "https://www.hostelworld.com/";
    },
    text: (city, country) => `Browse hostels in ${country} on Hostelworld`,
  },
  hotel: {
    url: (city) => `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}`,
    text: (city) => `Browse hotels in ${city} on Booking.com`,
  },
  resort: {
    url: (city) => `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(`${city} resort`)}`,
    text: (city) => `Browse resorts in ${city} on Booking.com`,
  },
  apartment: {
    url: (city) => `https://www.airbnb.com/s/${encodeURIComponent(city)}/homes`,
    text: (city) => `Browse apartments in ${city} on Airbnb`,
  },
};

function renderPlans(plans, { showSaveButton, accommodationType }) {
  const results = document.getElementById("results");
  results.innerHTML = "";

  plans.forEach((plan) => {
    const reasons = el("div", { class: "reasons" });
    plan.reasons.forEach((reason) => {
      reasons.appendChild(el("span", { class: "reason-tag", text: reason }));
    });

    const itineraryLabel = el("div", { class: "itinerary-label", text: "Itinerary" });
    const itineraryList = el("ol");
    plan.itinerary.forEach((day) => {
      itineraryList.appendChild(el("li", { text: `Day ${day.day}: ${day.plan}` }));
    });

    const cardChildren = [
      el("h3", { text: `${plan.destination}, ${plan.country}` }),
      el("div", { class: "meta", text: `${plan.description}` }),
      el("div", { class: "cost-badge", text: `~$${plan.estimatedTotalCostUSD} total · ~$${plan.estimatedDailyCostUSD}/day` }),
    ];

    if (plan.flight) {
      const f = plan.flight;
      const stopsText = f.stops === 0 ? "Direct" : `${f.stops} stop`;
      const flightUrl = `https://www.google.com/travel/flights?q=${encodeURIComponent(
        `Flights from ${f.originCity} to ${plan.destination}`
      )}`;
      cardChildren.push(
        el("a", {
          class: "flight-info",
          href: flightUrl,
          target: "_blank",
          rel: "noopener noreferrer",
          text: `${f.originCity} (${f.originIata}) → ${f.destinationIata}: ~$${f.roundTripPriceUSD} round trip · ${stopsText} · ~${f.totalDurationHours}h`,
        })
      );
    }

    const accommodation = ACCOMMODATION_SITES[accommodationType];
    if (accommodation) {
      cardChildren.push(
        el("a", {
          class: "accommodation-info",
          href: accommodation.url(plan.destination, plan.country),
          target: "_blank",
          rel: "noopener noreferrer",
          text: accommodation.text(plan.destination, plan.country),
        })
      );
    }

    cardChildren.push(reasons, itineraryLabel, itineraryList);

    const card = el("div", { class: "plan-card" }, cardChildren);

    if (showSaveButton) {
      const saveBtn = el("button", { class: "primary", text: "📌 Save this plan" });
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
    const delBtn = el("button", { text: "🗑️ Delete" });
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
    const communityBtn = el("button", { text: "🤝 See who else is interested" });

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

    if (!document.getElementById("originCityValue").value) {
      errorEl.textContent = "Pick a valid starting city from the list.";
      return;
    }

    if (!state.selectedInterests.size) {
      errorEl.textContent = "Pick at least one interest.";
      return;
    }

    const formData = new FormData(form);
    const body = {
      originCity: formData.get("originCity"),
      travelMonth: Number(formData.get("travelMonth")),
      age: Number(formData.get("age")),
      gender: formData.get("gender"),
      length: Number(formData.get("length")),
      budgetUSD: Number(formData.get("budgetUSD")),
      interests: Array.from(state.selectedInterests),
    };

    try {
      const data = await api("/api/plan", { method: "POST", body: JSON.stringify(body) });
      state.lastResult = data;
      renderPlans(data.plans, { showSaveButton: !!state.user, accommodationType: formData.get("accommodationType") });
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  document.getElementById("resetFormBtn").addEventListener("click", () => {
    form.reset();
    state.selectedInterests.clear();
    document.querySelectorAll(".interest-chip.selected").forEach((chip) => chip.classList.remove("selected"));
    errorEl.textContent = "";
    state.lastResult = null;
    document.getElementById("results").innerHTML = "";
  });
}

async function init() {
  renderInterestChips();
  setupCityAutocomplete();
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
