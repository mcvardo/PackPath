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

console.log('=== FUNCTIONS (lines 836-1832) ===\n');

const funcs = [
  ['flattenAll', 836, 854],
  ['estimateHikingTime', 859, 867],
  ['getPaceForProfile', 867, 884],
  ['planItinerary', 884, 1135],
  ['planLoopItinerary', 1135, 1246],
  ['suggestRoutes', 1246, 1340],
  ['getCoordForMile', 1340, 1379],
  ['getElevForMile', 1379, 1395],
  ['getDayDescription', 1395, 1430],
  ['getDayDifficulty', 1430, 1438],
  ['getDifficultyColor', 1438, 1449],
  ['RouteMap', 1449, 1733],
  ['generateGPX', 1733, 1811],
  ['REGIONS const', 1811, 1824],
  ['SCENERY_OPTS const', 1824, 1832],
];

let total_C = 0, total_P = 0;

for (const [name, start, end] of funcs) {
  const result = analyzeRange(name, start, end);
  total_C += result.curly;
  total_P += result.paren;
  
  const status = (result.curly !== 0 || result.paren !== 0) ? ' ← PROBLEM' : '';
  console.log(`${name.padEnd(25)} (${String(start).padStart(4)}-${String(end).padStart(4)}): C:${result.curly} P:${result.paren}${status}`);
}

console.log(`\nTOTAL: C:${total_C} P:${total_P}`);
