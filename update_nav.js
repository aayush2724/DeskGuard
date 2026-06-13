const fs = require('fs');
const path = require('path');

const marketingDir = path.join(__dirname, 'client/marketing');
const pagesDir = path.join(__dirname, 'client/src/pages');

// 1. Remove blog.html and related files
const htmlFiles = fs.readdirSync(marketingDir).filter(f => f.endsWith('.html'));
for (const file of htmlFiles) {
  if (file.startsWith('blog')) {
    fs.unlinkSync(path.join(marketingDir, file));
    console.log(`Deleted ${file}`);
  }
}

// 2. Update all remaining HTML files' navbars
const htmlNavRegex = /<div class="nav-links">([\s\S]*?)<\/div>/;
const newHtmlNav = `<div class="nav-links">
        <a href="how-it-works.html">How it works</a>
        <a href="features.html">Features</a>
        <a href="/live">Live Map</a>
        <a href="/scan">Scan QR</a>
        <a href="/librarian">Librarian</a>
        <a href="docs.html">Docs</a>
        <a href="contact.html" class="nav-cta">Get early access</a>
      </div>`;

for (const file of fs.readdirSync(marketingDir).filter(f => f.endsWith('.html'))) {
  const filePath = path.join(marketingDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.match(htmlNavRegex)) {
    content = content.replace(htmlNavRegex, newHtmlNav);
    fs.writeFileSync(filePath, content);
    console.log(`Updated nav in ${file}`);
  }
}

// 3. Update React pages' navbars
const reactNavRegex = /<div className="nav-links">([\s\S]*?)<\/div>/;
const newReactNav = `<div className="nav-links">
            <a href={import.meta.env.DEV ? "http://localhost:3001/how-it-works.html" : "/how-it-works.html"}>How it works</a>
            <a href={import.meta.env.DEV ? "http://localhost:3001/features.html" : "/features.html"}>Features</a>
            <a href="/live" className={window.location.pathname.startsWith('/live') ? "active" : ""}>Live Map</a>
            <a href="/scan" className={window.location.pathname.startsWith('/scan') ? "active" : ""}>Scan QR</a>
            <a href="/librarian" className={window.location.pathname.startsWith('/librarian') ? "active" : ""}>Librarian</a>
            <a href={import.meta.env.DEV ? "http://localhost:3001/docs.html" : "/docs.html"}>Docs</a>
            <a href={import.meta.env.DEV ? "http://localhost:3001/contact.html" : "/contact.html"} className="nav-cta">Get early access</a>
          </div>`;

for (const file of ['LivePage.jsx', 'ScanPage.jsx', 'LibrarianPage.jsx']) {
  const filePath = path.join(pagesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.match(reactNavRegex)) {
    content = content.replace(reactNavRegex, newReactNav);
    fs.writeFileSync(filePath, content);
    console.log(`Updated nav in ${file}`);
  }
}

console.log('Navbar update complete!');
