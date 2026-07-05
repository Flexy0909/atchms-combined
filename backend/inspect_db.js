const fs = require('fs');

try {
  const pkg = JSON.parse(fs.readFileSync('/var/www/atchms-api/package.json', 'utf8'));
  console.log('package.json dependencies:', pkg.dependencies);
} catch (err) {
  console.error('Error:', err.message);
}
