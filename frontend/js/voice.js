"use strict";
/* Voice commands (Web Speech API). A fixed command grammar: symptoms are matched
   by EXACT name against the structured list. No free-text/NLP symptom extraction. */

const VOICE_HELP =
  'Say: "select fever", "select fever and cough", "remove fever", "search headache", ' +
  '"clear search", "reset", "predict", "read symptoms", "read result", "go home", ' +
  '"check symptoms", "open dashboard", "stop listening".';

function cleanSpeech(raw) {
  return String(raw).toLowerCase().replace(/[.!?;:]/g, " ").replace(/\s+/g, " ").trim().replace(/^,+|,+$/g, "").trim();
}

function matchSymptomPhrase(phrase, symptoms) {
  console.log("Fever matches in symptom data:", symptoms.filter(s =>
  JSON.stringify(s).toLowerCase().includes("fever")
));
  const lookup = new Map();
  symptoms.forEach((s) => {
    lookup.set(s.label.toLowerCase(), s);
    lookup.set(s.key.replace(/_/g, " "), s);
  });
  const whole = lookup.get(phrase);
  if (whole) return { matched: [whole], unmatched: [] }; // try whole phrase first
  const matched = [], unmatched = [];
  phrase.split(/\s*(?:,|\band\b)\s*/).filter(Boolean).forEach((p) => {
    const s = lookup.get(p.trim());
    s ? matched.push(s) : unmatched.push(p.trim());
  });
  return { matched, unmatched };
}

const EXACT_COMMANDS = {
  reset: ["reset", "clear all", "clear everything", "start over"],
  predict: ["predict", "submit", "get prediction", "show prediction", "show result", "show results"],
  stop: ["stop listening", "stop voice", "turn off voice"],
  home: ["go home", "open home", "home page"],
  symptoms: ["check symptoms", "open symptoms", "go to symptoms"],
  dashboard: ["open dashboard", "go to dashboard", "show dashboard"],
  read: ["read result", "read results", "read symptoms", "read selected symptoms"],
  clearSearch: ["clear search"],
  help: ["help", "what can i say"],
};

function parseCommand(raw, symptoms) {
  const t = cleanSpeech(raw);
  if (!t) return { type: "none" };
  for (const [type, phrases] of Object.entries(EXACT_COMMANDS)) {
    if (phrases.includes(t)) return { type };
  }
  let m = t.match(/^(?:select|add|choose)\s+(.+)$/);
  if (m) return { type: "select", ...matchSymptomPhrase(m[1], symptoms) };
  m = t.match(/^(?:remove|deselect|unselect|delete)\s+(.+)$/);
  if (m) return { type: "remove", ...matchSymptomPhrase(m[1], symptoms) };
  m = t.match(/^search(?:\s+for)?\s+(.+)$/);
  if (m) return { type: "search", query: m[1] };
  return { type: "unknown", heard: t };
}

if (typeof module !== "undefined") module.exports = { parseCommand, cleanSpeech };

(function () {
  if (typeof document === "undefined") return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const bar = document.querySelector(".navbar .container");
  if (!bar) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn secondary voice-btn";
  btn.setAttribute("aria-pressed", "false");
  btn.textContent = "\uD83C\uDFA4 Voice";
  const status = document.createElement("div");
  status.id = "voice-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.hidden = true;
  bar.append(btn);
  bar.parentElement.after(status);

  const say = (msg) => { status.hidden = false; status.textContent = msg; };

  if (!SR) {
    btn.disabled = true;
    btn.title = "Voice commands need a browser with speech recognition (e.g. Chrome or Edge).";
    return;
  }

  const rec = new SR();
  rec.lang = "en-IN";
  rec.continuous = true;
  rec.interimResults = false;
  let active = false, speaking = false;

  function setActive(on) {
    active = on;
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = on ? "\uD83C\uDFA4 Listening\u2026 (click to stop)" : "\uD83C\uDFA4 Voice";
    if (on) {
      try { rec.start(); } catch (e) { /* already started */ }
      say("Listening. Audio is processed by your browser's speech service. Say \"help\" for commands.");
    } else {
      try { rec.stop(); } catch (e) { /* not started */ }
      say("Voice commands off.");
    }
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) { say(text); return; }
    speaking = true;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-IN";
    u.onend = u.onerror = () => { speaking = false; };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    say(text);
  }

  const onSymptomsPage = () => typeof selected !== "undefined" && document.getElementById("symptom-list");

  function readResult() {
    let d = null;
    try { d = JSON.parse(sessionStorage.getItem("sbdps_result")); } catch (e) { /* ignore */ }
    if (onSymptomsPage()) {
      const names = [...selected.values()];
      return speak(names.length ? "Selected symptoms: " + names.join(", ") + "." : "No symptoms selected.");
    }
    if (!d || !d.predictions || !d.predictions.length) return speak("There is no result to read yet.");
    const [top, ...rest] = d.predictions.map((p) => p.disease);
    speak("Most likely match: " + top + "." + (rest.length ? " Other possibilities: " + rest.join(", ") + "." : "") +
      " This is a preliminary prediction, not a diagnosis. Please consult a qualified healthcare professional.");
  }

  function handle(raw) {
    const symptoms = typeof allSymptoms !== "undefined" ? allSymptoms : [];
    const cmd = parseCommand(raw, symptoms);
    const heard = "Heard: \u201C" + cleanSpeech(raw) + "\u201D. ";
    switch (cmd.type) {
      case "none": return;
      case "stop": return setActive(false);
      case "help": return say(VOICE_HELP);
      case "home": return void (location.href = "index.html");
      case "symptoms": return void (location.href = "symptoms.html");
      case "dashboard": return void (location.href = "dashboard.html");
      case "read": return readResult();
      case "unknown": return say(heard + "Command not recognised. Say \"help\" for options.");
    }
    if (!onSymptomsPage()) return say(heard + "That command works on the Check Symptoms page.");
    switch (cmd.type) {
      case "select":
      case "remove": {
        const on = cmd.type === "select";
        cmd.matched.forEach((s) => toggle(s, on));
        renderList();
        const parts = [];
        if (cmd.matched.length) parts.push((on ? "Selected " : "Removed ") + cmd.matched.map((s) => s.label).join(", ") + ".");
        if (cmd.unmatched.length) parts.push("Not in the symptom list: " + cmd.unmatched.join(", ") + ".");
        return say(heard + parts.join(" "));
      }
      case "search":
        searchEl.value = cmd.query;
        renderList();
        return say(heard + "Filtered the list.");
      case "clearSearch":
        searchEl.value = "";
        renderList();
        return say(heard + "Search cleared.");
      case "reset":
        document.getElementById("reset-btn").click();
        return say(heard + "Form reset.");
      case "predict":
        say(heard + (selected.size ? "Predicting\u2026" : "Please select at least one symptom first."));
        return submit();
    }
  }

  rec.onresult = (e) => {
    if (speaking) return;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) handle(e.results[i][0].transcript);
    }
  };
  rec.onend = () => { if (active) { try { rec.start(); } catch (e) { /* ignore */ } } };
  rec.onerror = (e) => {
    if (e.error === "no-speech" || e.error === "aborted") return;
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      setActive(false);
      return say("Microphone permission was denied. Allow microphone access in your browser to use voice commands.");
    }
    if (e.error === "network") {
      setActive(false);
      return say("Voice recognition needs an internet connection in this browser.");
    }
    say("Voice error: " + e.error);
  };
  btn.addEventListener("click", () => setActive(!active));
})();
