"use strict";
(function () {
  const root = document.getElementById("content");
  let data = null;
  try { data = JSON.parse(sessionStorage.getItem("sbdps_result")); } catch (e) { /* ignore */ }

  if (!data || !Array.isArray(data.predictions) || data.predictions.length === 0) {
    root.replaceChildren(el("p", "No prediction found. Please select symptoms first."));
    const a = el("a", "Check Symptoms", "btn");
    a.href = "symptoms.html";
    root.append(a);
    return;
  }

  const top = data.predictions[0];
  const main = el("div", undefined, "card result-main");
  main.append(
    el("div", "Most likely match (preliminary)", "label"),
    el("div", top.disease, "name"),
    el("p", "This is a possible match based only on the symptoms you selected. It does not confirm that you have this condition."),
  );

  const others = el("div", undefined, "card");
  others.style.marginTop = "1rem";
  others.append(el("h2", "Top predictions"));
  data.predictions.forEach((p) => {
    const row = el("div", undefined, "bar-row");
    const head = el("div", undefined, "bar-head");
    head.append(el("span", p.disease), el("span", pct(p.score)));
    const bar = el("div", undefined, "bar");
    const fill = document.createElement("span");
    fill.style.width = Math.max(1, p.score * 100) + "%";
    bar.append(fill);
    row.append(head, bar);
    others.append(row);
  });
  others.append(el("p", data.score_note || "Scores are model-generated estimates, not calibrated medical probabilities."));

  const sym = el("div", undefined, "card");
  sym.style.marginTop = "1rem";
  sym.append(el("h2", "Symptoms you selected"));
  const chips = el("ul", undefined, "chips");
  (data.symptom_labels || data.selected_symptoms).forEach((s) => {
    const li = el("li", s, "chip");
    li.style.padding = ".2rem .8rem";
    chips.append(li);
  });
  sym.append(chips);

  const note = el("div", undefined, "card");
  note.style.marginTop = "1rem";
  note.append(el("h2", "About this result"),
    el("p", "A Random Forest model compared your selected symptoms with patterns learned from its training dataset. The output is a preliminary machine learning prediction only."));

  const disc = el("div", data.disclaimer, "disclaimer");
  disc.style.marginTop = "1rem";

  const again = el("a", "Check different symptoms", "btn");
  again.href = "symptoms.html";
  const actions = el("div", undefined, "actions");
  actions.append(again);

  root.replaceChildren(main, others, sym, note, disc, actions);
  loadDemoBanner();
})();
