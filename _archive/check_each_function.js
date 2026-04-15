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

const funcs = [
  ['flattenAll', 836, 852],
  ['estimateHikingTime', 859, 866],
  ['getPaceForProfile', 867, 882],
  ['planItinerary', 884, 1132],
  ['planLoopItinerary', 1135, 1243],
  ['suggestRoutes', 1246, 1337],
  ['getCoordForMile', 1340, 1377],
  ['getElevForMile', 1379, 1393],
  ['getDayDescription', 1395, 1428],
  ['getDayDifficulty', 1430, 1436],
  ['getDifficultyColor', 1438, 1447],
  ['RouteMap', 1449, 1728],
  ['generateGPX', 1733, 1808],
  ['REGIONS', 1811, 1822],
  ['SCENERY_OPTS', 1824, 1830],
];

console.log('=== INDIVIDUAL FUNCTION BALANCES ===\n');

let total_C = 0, total_P = 0;

for (const [name, start, end] of funcs) {
  const result = analyzeRange(start, end);
  total_C += result.curly;
  total_P += result.paren;
  
  const status = (result.curly !== 0 || result.paren !== 0) ? ' ← IMBALANCE' : '';
  console.log(`${name.padEnd(20)} (lines ${String(start).padStart(4)}-${String(end).padStart(4)}): C:${result.curly} P:${result.paren}${status}`);
}

console.log(`\nTOTAL: C:${total_C} P:${total_P}`);
