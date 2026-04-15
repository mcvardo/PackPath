const fs = require('fs');

const filePath = '/sessions/epic-serene-cray/mnt/PackPath/backpacking-planner.jsx';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Find lines with unclosed JSX fragments
// Look for patterns like {expr &&  or {routes.map( without proper closing
const jsxIssues = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Look for opening JSX expressions that might not close
  if (line.includes('{') && (line.includes('&&') || line.includes('.map(') || line.includes('.filter(') || line.includes('?'))) {
    // Check if all opens are closed on this line
    let openCount = 0, closeCount = 0;
    let inString = false, stringChar = '';
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if ((char === '"' || char === "'" || char === '`') && (j === 0 || line[j-1] !== '\\')) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }
      
      if (!inString) {
        if (char === '{') openCount++;
        if (char === '}') closeCount++;
        if (char === '(') openCount += 0.1; // Track parens separately for clarity
        if (char === ')') closeCount -= 0.1;
      }
    }
    
    if (openCount > closeCount) {
      jsxIssues.push({
        lineNum: i + 1,
        opens: openCount,
        closes: closeCount,
        content: line,
        imbalance: openCount - closeCount
      });
    }
  }
}

console.log('Lines with potential unclosed JSX expressions:\n');
jsxIssues.forEach(item => {
  if (item.imbalance >= 1) {
    console.log(`Line ${item.lineNum}: Opens=${item.opens}, Closes=${item.closes}, Imbalance=${item.imbalance}`);
    console.log(`  ${item.content}`);
    console.log();
  }
});

// Now look specifically at the return statement section (lines 2089+)
console.log('\n=== DETAILED RETURN SECTION ANALYSIS (lines 2089-2429) ===\n');

let curlyStack = 0, parenStack = 0, bracketStack = 0;
let inMultiComment = false;

for (let lineNum = 2088; lineNum < lines.length; lineNum++) {
  const line = lines[lineNum];
  let i = 0;
  let lineCurly = 0, lineParen = 0, lineBracket = 0;
  
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
    else if (char === '[') lineBracket++;
    else if (char === ']') lineBracket--;
    
    i++;
  }
  
  curlyStack += lineCurly;
  parenStack += lineParen;
  bracketStack += lineBracket;
  
  // Show lines near the end with interesting bracket info
  if (lineNum >= 2350 && (lineCurly !== 0 || lineParen !== 0)) {
    const curlyStr = lineCurly !== 0 ? `C:${lineCurly > 0 ? '+' : ''}${lineCurly}` : '';
    const parenStr = lineParen !== 0 ? `P:${lineParen > 0 ? '+' : ''}${lineParen}` : '';
    const bracketStr = lineBracket !== 0 ? `B:${lineBracket > 0 ? '+' : ''}${lineBracket}` : '';
    console.log(`Line ${lineNum + 1}: ${curlyStr} ${parenStr} ${bracketStr}`.padEnd(30) + `| Cumulative: C:${curlyStack} P:${parenStack} B:${bracketStack}`);
    console.log(`  ${line}`);
  }
}

console.log(`\n\nFinal balances at end of return section: C:${curlyStack} P:${parenStack} B:${bracketStack}`);
