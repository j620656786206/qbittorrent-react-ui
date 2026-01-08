const en = require('./src/locales/en.json');
const zhHant = require('./src/locales/zh-Hant.json');
const zhCN = require('./src/locales/zh-CN.json');
const es = require('./src/locales/es.json');
const de = require('./src/locales/de.json');
const fr = require('./src/locales/fr.json');
const ja = require('./src/locales/ja.json');

const locales = { en, 'zh-Hant': zhHant, 'zh-CN': zhCN, es, de, fr, ja };

// Check structure
function getKeys(obj, prefix = '') {
  let keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const newPrefix = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && !Array.isArray(value)) {
      keys = keys.concat(getKeys(value, newPrefix));
    } else {
      keys.push(newPrefix);
    }
  }
  return keys;
}

const enKeys = getKeys(en);
console.log('✓ Total translation keys in EN:', enKeys.length);

for (const [locale, data] of Object.entries(locales)) {
  const keys = getKeys(data);
  const missing = enKeys.filter(k => !keys.includes(k));
  const extra = keys.filter(k => !enKeys.includes(k));

  console.log(`\n✓ Locale ${locale}:`);
  console.log(`  - Total keys: ${keys.length}`);
  console.log(`  - Missing keys: ${missing.length}`);
  console.log(`  - Extra keys: ${extra.length}`);

  if (missing.length > 0) {
    console.log('  Missing:', missing.slice(0, 5).join(', '));
  }
}

console.log('\n✓ All locale files checked');
