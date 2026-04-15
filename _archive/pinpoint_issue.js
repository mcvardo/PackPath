const fs = require('fs');

const filePath = '/sessions/epic-serene-cray/mnt/PackPath/backpacking-planner.jsx';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Track cumulative balance and find where it first becomes positive in the wrong direction
let curlyBalance = 0, parenBalance = 0;
let inMultiComment = false;
let lastImbalanceLineC = null, lastImbalanceLineP = null;

console.log('=== FINDING WHERE IMBALANCE ACCUMULATES ===\n');

for (let lineNum = 1; lineNum <= 2088; lineNum++) {
  const line = lines[lineNum - 1];
  let i = 0;
  let lineCurly = 0, lineParen = 0;
  
  while (i < line.length) {
    const char = line[i];
    const nextChar = i + 1 < line.length ? line[i + 1] : '';
    
    if (inMultiComment) {
      if (char === '*' && nextChar === '/') {
        inMultiComment = false;
        i += 2;
      } else {
        i++;
      }
      continue;
    }
    
    if (char === '/' && nextChar === '*') {
      inMultiComment = true;
      i += 2;
      continue;
    }
    
    if (char === '/' && nextChar === '/') break;
    
    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      i++;
      while (i < line.length && !(line[i] === quote && line[i-1] !== '\\')) {
        i++;
      }
      i++;
      continue;
    }
    
    if (char === '{') lineCurly++;
    else if (char === '}') lineCurly--;
    else if (char === '(') lineParen++;
    else if (char === ')') lineParen--;
    
    i++;
  }
  
  curlyBalance += lineCurly;
  parenBalance += lineParen;
  
  // Report when we exceed expected closure
  if (curlyBalance >= 2) {
    if (!lastImbalanceLineC || lineNum >= lastImbalanceLineC) {
      if (lineCurly > 0) {
        console.log(`Line ${lineNum}: Curly balance now +${curlyBalance} (line change: ${lineCurly > 0 ? '+' : ''}${lineCurly})`);
        console.log(`  ${line}`);
        lastImbalanceLineC = lineNum;
      }
    }
  }
  
  if (parenBalance >= 2) {
    if (!lastImbalanceLineP || lineNum >= lastImbalanceLineP) {
      if (lineParen > 0) {
        console.log(`Line ${lineNum}: Paren balance now +${parenBalance} (line change: ${lineParen > 0 ? '+' : ''}${lineParen})`);
        console.log(`  ${line}`);
        lastImbalanceLineP = lineNum;
      }
    }
  }
}

console.log(`\n\nFinal: C:${curlyBalance} P:${parenBalance}`);

// Now look for pattern mismatches - arrow functions that don't close
console.log('\n\n=== LOOKING FOR UNCLOSED ARROW FUNCTIONS ===\n');

for (let lineNum = 1800; lineNum < 2089; lineNum++) {
  const line = lines[lineNum - 1];
  // Look for => but no proper closure
  if (line.includes('=>') && line.includes('{')) {
    // Check if the { is closed on same line
    let braceCount = 0;
    let inStr = false, strChar = '';
    for (let i = 0; i < line.length; i++) {
      if ((line[i] === '"' || line[i] === "'" || line[i] === '`') && line[i-1] !== '\\') {
        if (!inStr) {
          inStr = true;
          strChar = line[i];
        } else if (line[i] === strChar) {
          inStr = false;
        }
      }
      if (!inStr) {
        if (line[i] === '{') braceCount++;
        if (line[i] === '}') braceCount--;
      }
    }
    if (braceCount > 0) {
      console.log(`Line ${lineNum}: Unclosed arrow function (${braceCount} opens)`);
      console.log(`  ${line}`);
    }
  }
}
