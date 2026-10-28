"use strict";
const selected = new Map(); // key -> label
let allSymptoms = [];

const listEl = document.getElementById("symptom-list");
const statusEl = document.getElementById("list-status");
const chipsEl = document.getElementById("chips");
const msgEl = document.getElementById("message");
const searchEl = document.getElementById("search");
const predictBtn = document.getElementById("predict-btn");

function renderList() {
  const q = searchEl.value.trim().toLowerCase();
  listEl.querySelectorAll("legend ~ label").forEach((n) => n.remove());
  const shown = allSymptoms.filter((s) => s.label.toLowerCase().includes(q));
  shown.forEach((s) => {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.value = s.key;
    box.checked = selected.has(s.key);
    box.addEventListener("change", () => toggle(s, box.checked));
    label.append(box, document.createTextNode(s.label));
    listEl.append(label);
  });
  statusEl.textContent = shown.length
    ? `Showing ${shown.length} of ${allSymptoms.length} symptoms.`
    : "No symptoms match your search.";
}

function toggle(s, on) {
  on ? selected.set(s.key, s.label) : selected.delete(s.key);
  msgEl.textContent = "";
  renderChips();
}

function renderChips() {
  chipsEl.replaceChildren();
  selected.forEach((label, key) => {
    const li = el("li", undefined, "chip");
    const btn = el("button", "\u00d7");
    btn.type = "button";
    btn.setAttribute("aria-label", "Remove " + label);
    btn.addEventListener("click", () => {
      selected.delete(key);
      renderChips();
      renderList();
    });
    li.append(el("span", label), btn);
    chipsEl.append(li);
  });
  document.getElementById("count").textContent = selected.size;
  document.getElementById("empty-note").hidden = selected.size > 0;
}

async function init() {
  loadDemoBanner();
  try {
    const data = await api("/symptoms");
    allSymptoms = data.symptoms;
    renderList();
  } catch (e) {
    statusEl.textContent = e.message;
    statusEl.className = "error";
    predictBtn.disabled = true;
  }
}

async function submit() {
  if (selected.size === 0) {
    msgEl.textContent = "Please select at least one symptom before predicting.";
    return;
  }
  predictBtn.disabled = true;
  predictBtn.textContent = "Predicting\u2026";
  try {
    const keys = [...selected.keys()];
    const result = await api("/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symptoms: keys }),
    });
    result.symptom_labels = keys.map((k) => selected.get(k));
    sessionStorage.setItem("sbdps_result", JSON.stringify(result)); // browser-only, cleared when tab closes
    window.location.href = "results.html";
  } catch (e) {
    msgEl.textContent = e.message;
    predictBtn.disabled = false;
    predictBtn.textContent = "Predict";
  }
}

searchEl.addEventListener("input", renderList);
predictBtn.addEventListener("click", submit);
document.getElementById("reset-btn").addEventListener("click", () => {
  selected.clear();
  searchEl.value = "";
  msgEl.textContent = "";
  renderChips();
  renderList();
});
renderChips();
init();
