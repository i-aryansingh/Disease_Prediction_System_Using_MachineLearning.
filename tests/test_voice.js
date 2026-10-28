// Run: node tests/test_voice.js   (tests the voice command parser only; no microphone needed)
const assert = require("assert");
const { parseCommand } = require("../frontend/js/voice.js");
const S = [
  { key: "high_fever", label: "High Fever" }, { key: "cough", label: "Cough" },
  { key: "sore_throat", label: "Sore Throat" },
];
let r = parseCommand("Select high fever.", S);
assert.equal(r.type, "select"); assert.deepEqual(r.matched.map(s => s.key), ["high_fever"]);
r = parseCommand("add cough and sore throat", S);
assert.deepEqual(r.matched.map(s => s.key), ["cough", "sore_throat"]);
r = parseCommand("select cough, unicorn", S);
assert.deepEqual(r.unmatched, ["unicorn"]);
assert.equal(parseCommand("remove cough", S).type, "remove");
assert.equal(parseCommand("search fev", S).query, "fev");
assert.equal(parseCommand("Predict", S).type, "predict");
assert.equal(parseCommand("check symptoms", S).type, "symptoms");
assert.equal(parseCommand("stop listening", S).type, "stop");
assert.equal(parseCommand("tell me a joke", S).type, "unknown");
assert.equal(parseCommand("   ", S).type, "none");
console.log("voice parser: all tests passed");
