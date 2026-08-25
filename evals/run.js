const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

async function main() {
  const casesPath = path.join(__dirname, 'cases.json');
  const cases = JSON.parse(fs.readFileSync(casesPath, 'utf-8'));

  let passed = 0;
  const failures = [];

  for (const testCase of cases) {
    try {
      const res = await fetch(`${BASE_URL}/normalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: testCase.input })
      });

      const data = await res.json();

      if (data.canonical_title === testCase.expected) {
        passed++;
        console.log(`PASS — "${testCase.input}" -> ${data.canonical_title}`);
      } else {
        failures.push({ ...testCase, got: data.canonical_title });
        console.log(`FAIL — "${testCase.input}" -> got "${data.canonical_title}", expected "${testCase.expected}"`);
      }
    } catch (err) {
      failures.push({ ...testCase, got: `ERROR: ${err.message}` });
      console.log(`ERROR — "${testCase.input}": ${err.message}`);
    }
  }

  console.log(`\n${passed}/${cases.length} passed`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  - "${f.input}": expected "${f.expected}", got "${f.got}"`));
  }
}

main();