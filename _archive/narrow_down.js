const fs = require('fs');

const filePath = '/sessions/epic-serene-cray/mnt/PackPath/backpacking-planner.jsx';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Check sections sequentially
const sections = [
  { name: 'planItinerary', start: 884, end: 1130 },
  { name: 'planLoopItinerary', start: 1135, end: 1450 },
  { name: 'getDayDescription', start: 1395, end: 1430 },
  { name: 'getDayDifficulty', start: 1430, end: 1448 },
  { name: 'getDifficultyColor', start: 1438, end: 1449 },
  { name: 'RouteMap', start: 1449, end: 1720 },
  { name: 'generateGPX', start: 1733, end: 1830 },
  { name: 'PackPathApp', start: 1832, end: 2088 },
];

function analyzeSection(name, start, end) {
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

console.log('=== BALANCE BY SECTION ===\n');

let totalC = 0, totalP = 0;

sections.forEach(sec => {
  const result = analyzeSection(sec.name, sec.start, sec.end);
  totalC += result.curly;
  totalP += result.paren;
  
  if (result.curly !== 0 || result.paren !== 0) {
    console.log(`${sec.name.padEnd(20)} (lines ${sec.start}-${sec.end}): C:${result.curly > 0 ? '+' : ''}${result.curly}  P:${result.paren > 0 ? '+' : ''}${result.paren}`);
  }
});

console.log(`\nRunning total: C:${totalC}  P:${totalP}`);
