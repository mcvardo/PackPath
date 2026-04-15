const fs = require('fs');

const filePath = '/sessions/epic-serene-cray/mnt/PackPath/backpacking-planner.jsx';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

let curlyBalance = 0, parenBalance = 0, bracketBalance = 0;
let inMultiComment = false;

// Track up to line 2089 (before return statement of main component)
console.log('=== BALANCE BEFORE RETURN STATEMENT (lines 1-2089) ===\n');

for (let lineNum = 1; lineNum < 2089; lineNum++) {
  const line = lines[lineNum - 1];
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
  
  curlyBalance += lineCurly;
  parenBalance += lineParen;
  bracketBalance += lineBracket;
}

console.log(`Balance up to line 2088: C:${curlyBalance} P:${parenBalance} B:${bracketBalance}\n`);

// Now check the return section in detail
console.log('=== RETURN STATEMENT SECTION (lines 2089-2430) ===\n');

let returnCurly = 0, returnParen = 0, returnBracket = 0;
inMultiComment = false;

for (let lineNum = 2089; lineNum <= 2430; lineNum++) {
  const line = lines[lineNum - 1];
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
  
  returnCurly += lineCurly;
  returnParen += lineParen;
  returnBracket += lineBracket;
}

console.log(`Balance in return section: C:${returnCurly} P:${returnParen} B:${returnBracket}\n`);
console.log(`Expected ending balance: C:${returnCurly} should be 0, P:${returnParen} should be 0\n`);

// The issue: We need 2 closing parens and 2 closing braces
// The return statement section has: C:-1 P:-1 (meaning one extra close)
// Lines before had: C:+3 P:+3
// Total is C:+2 P:+2
// So lines 1-2088 have the extra opens

console.log('\n=== ANALYSIS ===\n');
console.log(`Lines 1-2088 contribute: C:+${curlyBalance} P:+${parenBalance}`);
console.log(`Lines 2089-2430 contribute: C:${returnCurly} P:${returnParen}`);
console.log(`Total imbalance: C:${curlyBalance + returnCurly} P:${parenBalance + returnParen}`);
console.log('\nProblem: There are 2 extra opening braces and 2 extra opening parentheses');
console.log('in lines 1-2088 (the helper functions and setup code).');
console.log('\nLooking for likely culprits...\n');

// Check for unclosed function definitions in helper code
const helperSections = [
  { name: 'flattenAll', start: 836, end: 860 },
  { name: 'estimateHikingTime', start: 859, end: 880 },
  { name: 'getPaceForProfile', start: 867, end: 890 },
  { name: 'planItinerary', start: 884, end: 1130 },
  { name: 'planLoopItinerary', start: 1135, end: 1450 },
  { name: 'getAllCamps', start: 1451, end: 1500 },
  { name: 'estimateElevationAtMile', start: 1560, end: 1600 },
];

for (const section of helperSections) {
  let sectionCurly = 0, sectionParen = 0;
  inMultiComment = false;
  
  for (let lineNum = section.start; lineNum <= section.end; lineNum++) {
    if (lineNum > lines.length) break;
    
    const line = lines[lineNum - 1];
    let i = 0;
    
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
      
      if (char === '{') sectionCurly++;
      else if (char === '}') sectionCurly--;
      else if (char === '(') sectionParen++;
      else if (char === ')') sectionParen--;
      
      i++;
    }
  }
  
  if (sectionCurly !== 0 || sectionParen !== 0) {
    console.log(`${section.name} (lines ${section.start}-${section.end}): C:${sectionCurly} P:${sectionParen}`);
  }
}
