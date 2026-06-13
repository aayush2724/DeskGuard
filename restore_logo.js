const fs = require('fs');
const path = require('path');

const marketingDir = path.join(__dirname, 'client/marketing');
const pagesDir = path.join(__dirname, 'client/src/pages');

// The replacement blocks
const headerLogoHTML = `<a href="index.html" class="logo">
        <span class="logo-icon">
          <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
            <rect x="1" y="1" width="8" height="8" rx="1.5" fill="#4ADE80"/>
            <rect x="13" y="1" width="8" height="8" rx="1.5" fill="#4ADE80" opacity="0.4"/>
            <rect x="1" y="13" width="8" height="8" rx="1.5" fill="#4ADE80" opacity="0.4"/>
            <rect x="13" y="13" width="8" height="8" rx="1.5" fill="#4ADE80" opacity="0.7"/>
          </svg>
        </span>
        DeskGuard
      </a>`;

const footerLogoHTML = `<span class="logo">
          <svg width="16" height="16" viewBox="0 0 22 22" fill="none"><rect x="1" y="1" width="8" height="8" rx="1.5" fill="#4ADE80"/><rect x="13" y="1" width="8" height="8" rx="1.5" fill="#4ADE80" opacity="0.4"/><rect x="1" y="13" width="8" height="8" rx="1.5" fill="#4ADE80" opacity="0.4"/><rect x="13" y="13" width="8" height="8" rx="1.5" fill="#4ADE80" opacity="0.7"/></svg>
          DeskGuard
        </span>`;

const reactLogoJSX = `<a href={import.meta.env.DEV ? "http://localhost:3001/" : "/"} className="nav-logo">
            <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
              <rect x="1" y="1" width="8" height="8" rx="1.5" fill="#4ADE80"/>
              <rect x="13" y="1" width="8" height="8" rx="1.5" fill="#4ADE80" opacity="0.4"/>
              <rect x="1" y="13" width="8" height="8" rx="1.5" fill="#4ADE80" opacity="0.4"/>
              <rect x="13" y="13" width="8" height="8" rx="1.5" fill="#4ADE80" opacity="0.7"/>
            </svg>
            DeskGuard
          </a>`;

// Replace in HTML files
const htmlFiles = fs.readdirSync(marketingDir).filter(f => f.endsWith('.html'));
for (const file of htmlFiles) {
  const filePath = path.join(marketingDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Header
  content = content.replace(/<a href="index\.html" class="logo">\s*<img src="logo\.png" alt="DeskGuard Logo" style="height: 40px;" \/>\s*<\/a>/, headerLogoHTML);
  // Footer
  content = content.replace(/<span class="logo">\s*<img src="logo\.png" alt="DeskGuard Logo" style="height: 28px;" \/>\s*<\/span>/, footerLogoHTML);

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Restored logo in ${file}`);
  }
}

// Replace in React files
const reactFiles = ['LivePage.jsx', 'ScanPage.jsx', 'LibrarianPage.jsx'];
for (const file of reactFiles) {
  const filePath = path.join(pagesDir, file);
  if (!fs.existsSync(filePath)) continue;
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  content = content.replace(/<a href=\{import\.meta\.env\.DEV \? "http:\/\/localhost:3001\/" : "\/"\} className="nav-logo">\s*<img src="\/logo\.png" alt="DeskGuard Logo" style=\{\{ height: '40px' \}\}\s*\/>\s*<\/a>/, reactLogoJSX);

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Restored logo in ${file}`);
  }
}

console.log('Logo restoration complete!');
