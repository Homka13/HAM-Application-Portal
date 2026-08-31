import fs from 'fs';

if (fs.existsSync('frontend/dist')) {
  fs.mkdirSync('dist/public', { recursive: true });
  fs.cpSync('frontend/dist', 'dist/public', { recursive: true });
  console.log('Frontend built and copied to dist/public');
}

if (fs.existsSync('dist/index.js')) {
  fs.copyFileSync('dist/index.js', 'index.js');
}

