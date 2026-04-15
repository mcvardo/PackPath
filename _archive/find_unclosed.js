const fs = require('fs');

const filePath = '/sessions/epic-serene-cray/mnt/PackPath/backpacking-planner.jsx';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Look for lines with arrow functions or conditionals that might not be closed properly
console.log('=== FINDING POSSIBLE UNCLOSED STRUCTURES ===\n');

// Focus on the component function (lines 1832+)
const targets = [];

for (let lineNum = 1832; lineNum <= 2430; lineNum++) {
  const line = lines[lineNum - 1];
  
  // Pattern 1: Arrow function with opening brace
  if ((line.includes('=>') && line.includes('{') && !line.includes('}'))) {
    let braceCount = 0, parenCount = 0;
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
        if (line[i] === '(') parenCount++;
        if (line[i] === ')') parenCount--;
      }
    }
    
    if (braceCount > 0 || parenCount > 0) {
      targets.push({
        type: 'arrow-unclosed',
        line: lineNum,
        braces: braceCount,
        parens: parenCount,
        content: line.trim().substring(0, 100)
      });
    }
  }
}

if (targets.length > 0) {
  console.log(`Found ${targets.length} potential unclosed arrow functions:\n`);
  targets.forEach(t => {
    console.log(`Line ${t.line}: Braces=${t.braces}, Parens=${t.parens}`);
    console.log(`  ${t.content}`);
  });
} else {
  console.log('No obvious unclosed arrow functions found.');
}

// Look for the place where the 2 extra opens accumulate
console.log('\n\n=== ANALYZING WHERE +2/+2 COMES FROM ===\n');

let running_C = 0, running_P = 0;
let inMultiComment = false;

for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
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
    
    if (char === '{') { curly++; lineCurly++; }
    else if (char === '}') { curly--; lineCurly--; }
    else if (char === '(') { paren++; lineParen++; }
    else if (char === ')') { paren--; lineParen--; }
    
    i++;
  }
  
  running_C += lineCurly;
  running_P += lineParen;
}

// Now look for where we jump past the expected closing levels
console.log('Looking for sections with unclosed pairs...\n');

inMultiComment = false;
let sectionStart = -1;
let sectionCurly = 0, sectionParen = 0;
let maxCurly = 0, maxParen = 0;

for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
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
    
    if (char === '{') { sectionCurly++; lineCurly++; }
    else if (char === '}') { sectionCurly--; lineCurly--; }
    else if (char === '(') { sectionParen++; lineParen++; }
    else if (char === ')') { sectionParen--; lineParen--; }
    
    i++;
  }
  
  if (sectionCurly > maxCurly) maxCurly = sectionCurly;
  if (sectionParen > maxParen) maxParen = sectionParen;
}

console.log(`Maximum running balance: Curly=${maxCurly}, Paren=${maxParen}`);
console.log(`Final balance: Curly=${running_C}, Paren=${running_P}`);
