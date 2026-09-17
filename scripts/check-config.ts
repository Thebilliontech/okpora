import { config, missingConfig } from '../server/config/index';
const missing = missingConfig('all');
console.log('Okpora configuration check (secret values are never printed)');
console.log('Provider:', config.provider);
for (const key of missing) console.log('MISSING:', key);
console.log(
  missing.length
    ? 'Complete PRIVATE_CONFIG/CONFIGURATION_CHECKLIST.md'
    : 'Required environment variables are present. Test their connectivity before launch.',
);
process.exitCode = missing.length ? 1 : 0;
