"use strict";
const API_BASE = "/api";

async function api(path, options) {
  let res;
  try {
    res = await fetch(API_BASE + path, options);
  } catch (e) {
    throw new Error("Cannot reach the server. Make sure the backend is running.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.detail || "Request failed.");
    err.invalid = data.invalid_symptoms;
    throw err;
  }
  return data;
}

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text; // textContent: never parse HTML
  if (className) node.className = className;
  return node;
}

async function loadDemoBanner() {
  const box = document.getElementById("demo-banner");
  if (!box) return;
  try {
    const info = await api("/model-info");
    if (info.dataset && info.dataset.is_demo) {
      box.textContent = "Demonstration mode: the model is trained on a synthetic sample dataset, not real patient data. Results are not medically validated.";
      box.hidden = false;
    }
  } catch (e) { /* banner is optional */ }
}

const pct = (v) => (v * 100).toFixed(1) + "%";

async function loadDashboard() {
  loadDemoBanner();
  const errBox = document.getElementById("dash-error");
  const wrap = document.getElementById("dashboard");
  let info;
  try {
    info = await api("/model-info");
  } catch (e) {
    errBox.textContent = e.message;
    wrap.hidden = true;
    return;
  }
  const stat = (value, label) => {
    const c = el("div", undefined, "card stat");
    c.append(el("div", String(value), "value"), el("div", label, "label"));
    return c;
  };
  document.getElementById("stats").append(
    stat(info.n_diseases, "Diseases in dataset"),
    stat(info.n_symptoms, "Symptom features"),
    stat(info.n_samples, "Dataset rows"),
    stat(info.algorithm, "Algorithm"),
  );
  const m = info.metrics;
  document.getElementById("metrics-note").textContent =
    `Measured on a held-out test set of ${info.n_test} rows (${info.n_train} used for training, random seed ${info.random_state}). Precision, recall and F1 are weighted averages across diseases.`;
  document.getElementById("metrics").append(
    stat(pct(m.accuracy), "Accuracy"),
    stat(pct(m.precision_weighted), "Precision"),
    stat(pct(m.recall_weighted), "Recall"),
    stat(pct(m.f1_weighted), "F1-score"),
  );
  const list = document.getElementById("diseases");
  info.diseases.forEach((d) => list.append(el("li", d, "chip")));
  list.querySelectorAll(".chip").forEach((c) => (c.style.padding = ".2rem .8rem"));
}
