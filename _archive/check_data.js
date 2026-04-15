const fs = require('fs');

const filePath = '/sessions/epic-serene-cray/mnt/PackPath/backpacking-planner.jsx';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

function analyzeRange(name, start, end) {
  let curly = 0, paren = 0;
  let inMultiComment = false;
  
  for (let lineNum = start; lineNum <= end && lineNum <= lines.length; lineNum++) {
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
      
      if (char === '{') curly++;
      else if (char === '}') curly--;
      else if (char === '(') paren++;
      else if (char === ')') paren--;
      
      i++;
    }
  }
  
  return { curly, paren };
}

console.log('=== TOP-LEVEL SECTIONS ===\n');

const data = {
  'imports': [1, 24],
  'TRAIL_DATA': [25, 618],
  'LOOP_TRAILS': [619, 835],
  'functions section': [836, 1832],
  'PackPathApp': [1832, 2430],
};

let total_C = 0, total_P = 0;

for (const [name, [start, end]] of Object.entries(data)) {
  const result = analyzeRange(name, start, end);
  total_C += result.curly;
  total_P += result.paren;
  
  console.log(`${name.padEnd(20)}: C:${result.curly} P:${result.paren}`);
}

console.log(`\nGRAND TOTAL: C:${total_C} P:${total_P}`);
