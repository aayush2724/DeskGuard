const fs = require('fs');
const path = require('path');

const marketingDir = path.join(__dirname, 'client/marketing');
const indexHtml = fs.readFileSync(path.join(marketingDir, 'index.html'), 'utf8');

// Extract How It Works section
const howSectionMatch = indexHtml.match(/(<!-- HOW IT WORKS — Horizontal scroll timeline -->\s*<section class="how" id="how">[\s\S]*?<\/section>)/);
const howSection = howSectionMatch ? howSectionMatch[1] : '';

// Extract Bookshelf (Features) section
const bookshelfSectionMatch = indexHtml.match(/(<!-- BOOKSHELF -->\s*<section class="bookshelf-section" id="bookshelf">[\s\S]*?<\/section>)/);
const bookshelfSection = bookshelfSectionMatch ? bookshelfSectionMatch[1] : '';

// Rebuild how-it-works.html
let howHtml = fs.readFileSync(path.join(marketingDir, 'how-it-works.html'), 'utf8');
const howNavEnd = howHtml.indexOf('</nav>') + 6;
const howFooterStart = howHtml.indexOf('<section class="mini-cta">');
howHtml = howHtml.substring(0, howNavEnd) + '\n\n' + howSection + '\n\n' + howHtml.substring(howFooterStart);
fs.writeFileSync(path.join(marketingDir, 'how-it-works.html'), howHtml, 'utf8');

// Rebuild features.html
let featuresHtml = fs.readFileSync(path.join(marketingDir, 'features.html'), 'utf8');
const featuresNavEnd = featuresHtml.indexOf('</nav>') + 6;
const featuresFooterStart = featuresHtml.indexOf('<section class="mini-cta">');
featuresHtml = featuresHtml.substring(0, featuresNavEnd) + '\n\n' + bookshelfSection + '\n\n' + featuresHtml.substring(featuresFooterStart);
fs.writeFileSync(path.join(marketingDir, 'features.html'), featuresHtml, 'utf8');

console.log('Pages synced with index.html!');
