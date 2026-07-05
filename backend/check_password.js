const bcrypt = require('bcryptjs');

const hash = '$2a$12$DjAJqrHDAuTY/oImtcN4M.fYN/ZkWJeGhxfsocqhXXeRzDVuv/zc2';
const passwords = ['admin', 'admin123', 'admin2026', 'AtcHms2026!', 'AtcHms2026', 'Tryhardthis1', 'Dean2026', 'Dean2026!'];

for (let p of passwords) {
  if (bcrypt.compareSync(p, hash)) {
    console.log('✅ Found match:', p);
    process.exit(0);
  }
}
console.log('❌ No match found in list.');
