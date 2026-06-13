const fs = require('fs');
const path = require('path');

const marketingDir = path.join(__dirname, 'client/marketing');
const pagesDir = path.join(__dirname, 'client/src/pages');

// 1. Update HTML files
const htmlFiles = fs.readdirSync(marketingDir).filter(f => f.endsWith('.html'));
for (const file of htmlFiles) {
  const filePath = path.join(marketingDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // For index.html, we can use just #how and #bookshelf to allow smooth scrolling without reload,
  // but index.html#how also works fine. Let's use index.html#how everywhere for simplicity, 
  // or just #how if it's index.html.
  if (file === 'index.html') {
    content = content.replace(/href="how-it-works\.html"/g, 'href="#how"');
    content = content.replace(/href="features\.html"/g, 'href="#bookshelf"');
  } else {
    content = content.replace(/href="how-it-works\.html"/g, 'href="index.html#how"');
    content = content.replace(/href="features\.html"/g, 'href="index.html#bookshelf"');
  }

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated links in ${file}`);
  }
}

// 2. Update React JSX files
for (const file of ['LivePage.jsx', 'ScanPage.jsx', 'LibrarianPage.jsx']) {
  const filePath = path.join(pagesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  content = content.replace(/"http:\/\/localhost:3001\/how-it-works\.html"/g, '"http://localhost:3001/#how"');
  content = content.replace(/"\/how-it-works\.html"/g, '"/#how"');

  content = content.replace(/"http:\/\/localhost:3001\/features\.html"/g, '"http://localhost:3001/#bookshelf"');
  content = content.replace(/"\/features\.html"/g, '"/#bookshelf"');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated links in ${file}`);
  }
}

// 3. Delete how-it-works.html and features.html since they are no longer needed
if (fs.existsSync(path.join(marketingDir, 'how-it-works.html'))) {
  fs.unlinkSync(path.join(marketingDir, 'how-it-works.html'));
  console.log('Deleted how-it-works.html');
}
if (fs.existsSync(path.join(marketingDir, 'features.html'))) {
  fs.unlinkSync(path.join(marketingDir, 'features.html'));
  console.log('Deleted features.html');
}

console.log('Anchor update complete!');
