const fs = require('fs');

const filePath = '/sessions/epic-serene-cray/mnt/PackPath/backpacking-planner.jsx';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

function analyzeRange(start, end) {
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

const result = analyzeRange(1449, 1728);
console.log(`RouteMap (lines 1449-1728): C:${result.curly} P:${result.paren}`);

// Also check the next function
const result2 = analyzeRange(1733, 1810);
console.log(`generateGPX (lines 1733-1810): C:${result2.curly} P:${result2.paren}`);
