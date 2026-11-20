const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.join(__dirname, '..');
const output = path.join(root, '_site');

async function buildPagesSite() {
  await fs.rm(output, { recursive: true, force: true });
  await fs.cp(path.join(root, 'public'), output, { recursive: true });
  await fs.mkdir(path.join(output, 'data'), { recursive: true });
  await Promise.all(['posts.json', 'comments.json'].map((file) =>
    fs.copyFile(path.join(root, 'data', file), path.join(output, 'data', file))
  ));
  await fs.writeFile(
    path.join(output, 'js', 'site-config.js'),
    'window.APP_CONFIG = { staticMode: true };\n',
    'utf8'
  );
}

buildPagesSite().catch((error) => {
  console.error('Unable to build the GitHub Pages site:', error);
  process.exitCode = 1;
});
