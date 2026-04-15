const fs = require('fs');

const filePath = '/sessions/epic-serene-cray/mnt/PackPath/backpacking-planner.jsx';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Check ALL sections
const sections = [
  { name: 'TRAIL_DATA (const)', start: 25, end: 1400 },
  { name: 'flattenAll', start: 836, end: 860 },
  { name: 'estimateHikingTime', start: 859, end: 867 },
  { name: 'getPaceForProfile', start: 867, end: 884 },
  { name: 'planItinerary', start: 884, end: 1135 },
  { name: 'planLoopItinerary', start: 1135, end: 1251 },
  { name: 'suggestRoutes', start: 1251, end: 1390 },
  { name: 'getCoordForMile', start: 1390, end: 1395 },
  { name: 'getDayDescription', start: 1395, end: 1430 },
  { name: 'getDayDifficulty', start: 1430, end: 1438 },
  { name: 'getDifficultyColor', start: 1438, end: 1449 },
  { name: 'RouteMap', start: 1449, end: 1733 },
  { name: 'generateGPX', start: 1733, end: 1832 },
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
  
  const cStr = result.curly !== 0 ? `C:${result.curly > 0 ? '+' : ''}${result.curly}` : '';
  const pStr = result.paren !== 0 ? `P:${result.paren > 0 ? '+' : ''}${result.paren}` : '';
  const status = (result.curly !== 0 || result.paren !== 0) ? ` ← IMBALANCE` : '';
  
  console.log(`${sec.name.padEnd(25)} (${String(sec.start).padStart(4)}-${String(sec.end).padStart(4)}): ${cStr.padEnd(6)} ${pStr.padEnd(6)}${status}`);
});

console.log(`\n${'TOTAL'.padEnd(25)}: C:${totalC}  P:${totalP}`);
