const fs = require('fs');

const filePath = '/sessions/epic-serene-cray/mnt/PackPath/backpacking-planner.jsx';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

let curly = 0, paren = 0;
let inMultiComment = false;
const lastNegativePoints = [];

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
    
    if (char === '{') {
      curly++;
      lineCurly++;
    }
    else if (char === '}') {
      curly--;
      lineCurly--;
    }
    else if (char === '(') {
      paren++;
      lineParen++;
    }
    else if (char === ')') {
      paren--;
      lineParen--;
    }
    
    i++;
  }
  
  if (curly < 0 || paren < 0) {
    lastNegativePoints.push({
      lineNum,
      curly,
      paren,
      lineCurly,
      lineParen,
      content: line
    });
  }
}

console.log('=== FINAL FILE ANALYSIS ===\n');
console.log(`Total lines: ${lines.length}`);
console.log(`Final balance: Curly=${curly}, Paren=${paren}\n`);

if (lastNegativePoints.length > 0) {
  console.log('=== LINES WHERE BALANCE GOES NEGATIVE ===\n');
  lastNegativePoints.slice(0, 10).forEach(p => {
    console.log(`Line ${p.lineNum}: Curly=${p.curly}, Paren=${p.paren}`);
    console.log(`  Line change: C:${p.lineCurly}, P:${p.lineParen}`);
    console.log(`  ${p.content}`);
    console.log();
  });
}
