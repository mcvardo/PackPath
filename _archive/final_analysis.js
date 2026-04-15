const fs = require('fs');

const filePath = '/sessions/epic-serene-cray/mnt/PackPath/backpacking-planner.jsx';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Count from component start to end
let curlyStack = [];
let parenStack = [];
let inMultiComment = false;

// Look specifically at the PackPathApp component
const compStart = 1832;  // export default function PackPathApp() {

for (let lineNum = compStart; lineNum <= lines.length; lineNum++) {
  const line = lines[lineNum - 1];
  let i = 0;
  let lineCurly = [];
  let lineParen = [];
  
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
      curlyStack.push(lineNum);
      lineCurly.push(lineNum);
    }
    else if (char === '}') {
      curlyStack.pop();
      lineCurly.push(-lineNum);
    }
    else if (char === '(') {
      parenStack.push(lineNum);
      lineParen.push(lineNum);
    }
    else if (char === ')') {
      parenStack.pop();
      lineParen.push(-lineNum);
    }
    
    i++;
  }
  
  // Show important lines
  if (lineNum >= 2410 && (lineCurly.length > 0 || lineParen.length > 0)) {
    console.log(`Line ${lineNum}: ${line}`);
    console.log(`  Curly: ${lineCurly.map(x => x > 0 ? '+' : '').join('')}  Paren: ${lineParen.map(x => x > 0 ? '+' : '').join('')}`);
    console.log(`  Stack size: C:${curlyStack.length} P:${parenStack.length}`);
  }
}

console.log(`\nFinal stack sizes:`);
console.log(`  Curly: ${curlyStack.length} (unclosed at lines: ${curlyStack.join(', ')})`);
console.log(`  Paren: ${parenStack.length} (unclosed at lines: ${parenStack.join(', ')})`);
