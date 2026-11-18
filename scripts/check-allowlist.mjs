import { readFileSync } from 'node:fs';

const envEmails = (process.env.VITE_ALLOWED_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean)
  .sort();
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const match = rules.match(/request\.auth\.token\.email\s+in\s+\[([\s\S]*?)\]/);
const ruleEmails = (match?.[1].match(/'([^']+)'/g) || [])
  .map((quoted) => quoted.slice(1, -1).trim().toLowerCase())
  .sort();

if (envEmails.length === 0) {
  console.error('VITE_ALLOWED_EMAILS is empty. Configure the approved Google accounts before building for deployment.');
  process.exit(1);
}
if (!match || JSON.stringify(envEmails) !== JSON.stringify(ruleEmails)) {
  console.error('The frontend VITE_ALLOWED_EMAILS must exactly match the emails in firestore.rules.');
  console.error(`Frontend: ${envEmails.join(', ') || '(empty)'}`);
  console.error(`Rules:    ${ruleEmails.join(', ') || '(empty)'}`);
  process.exit(1);
}
console.log(`Allowlist configuration matches for ${envEmails.length} account(s).`);
