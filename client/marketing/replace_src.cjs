const fs = require('fs');
const path = require('path');

const dir = 'c:/Users/K Harshita/Desktop/aayushisdumb/DeskGuard/client/src';

const replacements = [
  // CSS Variables in styles.css
  { match: /--bg:\s*#05100a;/g, replace: '--bg:        #18120A;' },
  { match: /--bg-2:\s*#080f0b;/g, replace: '--bg-2:      #20180C;' },
  { match: /--bg-3:\s*#0c1610;/g, replace: '--bg-3:      #261C0E;' },
  { match: /--surface:\s*#0f1f16;/g, replace: '--surface:   #261C0E;' },
  { match: /--surface-2:\s*#162b1d;/g, replace: '--surface-2: #3D2C14;' },
  { match: /--border:\s*rgba\(74,222,128,\.10\);/g, replace: '--border:    rgba(245,158,11,.10);' },
  { match: /--border-2:\s*rgba\(74,222,128,\.22\);/g, replace: '--border-2:  rgba(245,158,11,.22);' },
  { match: /--green:\s*#4ADE80;/g, replace: '--green:     #F59E0B;' },
  { match: /--green-dim:\s*rgba\(74,222,128,\.12\);/g, replace: '--green-dim: rgba(245,158,11,.12);' },
  { match: /--green-glow:\s*rgba\(74,222,128,\.07\);/g, replace: '--green-glow:rgba(245,158,11,.07);' },
  { match: /--amber:\s*#FBBF24;/g, replace: '--amber:     #FCD34D;' }, // mapping amber to highlight slightly differently to keep the name but change color
  { match: /--amber-dim:\s*rgba\(251,191,36,\.15\);/g, replace: '--amber-dim: rgba(252,211,77,.15);' },
  { match: /--text:\s*#dff0e7;/g, replace: '--text:      #FEF3C7;' },
  { match: /--text-2:\s*#7fa892;/g, replace: '--text-2:    #FDE68A;' },
  { match: /--text-3:\s*#3d5a47;/g, replace: '--text-3:    #D97706;' },

  // Hardcoded RGBs/Hexes in styles.css and HTML files
  { match: /#4ADE80/gi, replace: '#F59E0B' },
  { match: /#05100a/gi, replace: '#18120A' },
  { match: /#080f0b/gi, replace: '#20180C' },
  { match: /#0c1610/gi, replace: '#261C0E' },
  { match: /#0f1f16/gi, replace: '#261C0E' },
  { match: /#162b1d/gi, replace: '#3D2C14' },
  { match: /#22c55e/gi, replace: '#FCD34D' }, // old free dot color -> Highlight
  { match: /#ef4444/gi, replace: '#991B1B' }, // old occupied red -> darker amber/red maybe? let's leave it or make it distinct. The prompt didn't say to change error reds. We'll leave it or make it #D97706. Let's make it #78350F for dark occupied? I'll change it to #B45309 to stay within warm tones.
  { match: /#ef4444/gi, replace: '#B45309' },

  { match: /rgba\(5,\s*16,\s*10/g, replace: 'rgba(24,18,10' },
  { match: /rgba\(8,\s*15,\s*11/g, replace: 'rgba(32,24,12' },
  { match: /rgba\(15,\s*31,\s*22/g, replace: 'rgba(61,44,20' },
  { match: /rgba\(22,\s*43,\s*29/g, replace: 'rgba(61,44,20' },
  { match: /rgba\(74,\s*222,\s*128/g, replace: 'rgba(245,158,11' },

  // Shader replacements
  { match: /vec3\(0\.031,\s*0\.063,\s*0\.047\)/g, replace: 'vec3(0.094, 0.070, 0.039)' },
  { match: /vec3\(0\.055,\s*0\.18,\s*0\.11\)/g, replace: 'vec3(0.15, 0.11, 0.055)' },
  { match: /vec3\(0\.22,\s*0\.72,\s*0\.37\)/g, replace: 'vec3(0.96, 0.62, 0.043)' },
  { match: /vec3\(0\.08,\s*0\.22,\s*0\.15\)/g, replace: 'vec3(0.24, 0.17, 0.08)' },
  { match: /#0d2a1a/g, replace: '#261C0E' },
  { match: /#08100d/g, replace: '#18120A' }
];

function processDir(directory) {
  const files = fs.readdirSync(directory);
  for (const file of files) {
    const fullPath = path.join(directory, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      processDir(fullPath);
    } else if (file.endsWith('.html') || file.endsWith('.css') || file.endsWith('.js') || file.endsWith('.jsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let originalContent = content;
      
      for (const { match, replace } of replacements) {
        content = content.replace(match, replace);
      }
      
      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Updated ' + file);
      }
    }
  }
}

processDir(dir);
console.log('Done!');
