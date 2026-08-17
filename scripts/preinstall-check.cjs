const fs = require('fs');
const path = require('path');

const lockFiles = ['package-lock.json', 'yarn.lock'];
for (const file of lockFiles) {
  const filePath = path.join(__dirname, '..', file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`Removed stray ${file}`);
  }
}

const userAgent = process.env.npm_config_user_agent || '';
if (!userAgent.startsWith('pnpm')) {
  console.error('Use pnpm instead');
  process.exit(1);
}
