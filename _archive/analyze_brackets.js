const fs = require('fs');
const path = require('path');

const filePath = '/sessions/epic-serene-cray/mnt/PackPath/backpacking-planner.jsx';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

let curlyCount = 0;
let parenCount = 0;
let bracketCount = 0;
const issues = [];

function isInString(line, pos, quoteChar) {
  let count = 0;
  for (let i = 0; i < pos; i++) {
    if (line[i] === quoteChar && (i === 0 || line[i - 1] !== '\\')) {
      count++;
    }
  }
  return count % 2 === 1;
}

function isInRegex(line, pos) {
  // Simple heuristic: look for / that appears to start a regex
  let inString = false;
  let stringChar = '';
  for (let i = 0; i < pos; i++) {
    if ((line[i] === '"' || line[i] === "'" || line[i] === '`') && (i === 0 || line[i - 1] !== '\\')) {
      if (!inString) {
        inString = true;
        stringChar = line[i];
      } else if (line[i] === stringChar) {
        inString = false;
      }
    }
  }
  return false; // Simplified for now
}

function processLine(lineNum, line) {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inSingleComment = false;
  let inMultiComment = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    const prevChar = i > 0 ? line[i - 1] : '';

    // Handle comments
    if (!inSingleQuote && !inDoubleQuote && !inBacktick && !inMultiComment) {
      if (char === '/' && nextChar === '/') {
        inSingleComment = true;
      }
      if (char === '/' && nextChar === '*') {
        inMultiComment = true;
      }
    }

    if (inMultiComment && char === '*' && nextChar === '/') {
      inMultiComment = false;
      i++; // skip the /
      continue;
    }

    if (inSingleComment) {
      continue;
    }

    if (inMultiComment) {
      continue;
    }

    // Handle string/template literal escapes
    if (prevChar === '\\') {
      continue;
    }

    // Handle quotes
    if (char === "'" && !inDoubleQuote && !inBacktick) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (char === '"' && !inSingleQuote && !inBacktick) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (char === '`' && !inSingleQuote && !inDoubleQuote) {
      inBacktick = !inBacktick;
      continue;
    }

    // Skip if in any string context
    if (inSingleQuote || inDoubleQuote || inBacktick) {
      continue;
    }

    // Track brackets
    if (char === '{') {
      curlyCount++;
    } else if (char === '}') {
      curlyCount--;
      if (curlyCount < 0) {
        issues.push({
          type: 'extra closing brace',
          line: lineNum,
          char: i,
          context: line.substring(Math.max(0, i - 40), i + 40)
        });
      }
    } else if (char === '(') {
      parenCount++;
    } else if (char === ')') {
      parenCount--;
      if (parenCount < 0) {
        issues.push({
          type: 'extra closing paren',
          line: lineNum,
          char: i,
          context: line.substring(Math.max(0, i - 40), i + 40)
        });
      }
    } else if (char === '[') {
      bracketCount++;
    } else if (char === ']') {
      bracketCount--;
      if (bracketCount < 0) {
        issues.push({
          type: 'extra closing bracket',
          line: lineNum,
          char: i,
          context: line.substring(Math.max(0, i - 40), i + 40)
        });
      }
    }
  }
}

// Process all lines
for (let i = 0; i < lines.length; i++) {
  processLine(i + 1, lines[i]);
}

console.log('=== BRACKET BALANCE ANALYSIS ===\n');
console.log(`Total lines: ${lines.length}`);
console.log(`\nFinal counts:`);
console.log(`  Curly braces:  ${curlyCount} (expected: 0)`);
console.log(`  Parentheses:   ${parenCount} (expected: 0)`);
console.log(`  Square brackets: ${bracketCount} (expected: 0)`);

if (issues.length > 0) {
  console.log(`\n=== ISSUES FOUND (${issues.length}) ===\n`);
  issues.forEach(issue => {
    console.log(`Line ${issue.line}: ${issue.type}`);
    console.log(`  Position: character ${issue.char}`);
    console.log(`  Context: ...${issue.context}...`);
    console.log(`  Full line: ${lines[issue.line - 1]}`);
    console.log();
  });
}

// Find where imbalance starts getting negative
console.log('\n=== TRACKING CUMULATIVE COUNTS ===\n');
let cumCurly = 0, cumParen = 0, cumBracket = 0;
const negativePoints = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  let lineCurly = 0, lineParen = 0, lineBracket = 0;

  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inMultiComment = false;

  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    const nextChar = line[j + 1];
    const prevChar = j > 0 ? line[j - 1] : '';

    if (!inSingleQuote && !inDoubleQuote && !inBacktick && !inMultiComment) {
      if (char === '/' && nextChar === '*') {
        inMultiComment = true;
      }
    }

    if (inMultiComment && char === '*' && nextChar === '/') {
      inMultiComment = false;
      j++;
      continue;
    }

    if (inMultiComment || (char === '/' && nextChar === '/')) {
      continue;
    }

    if (prevChar === '\\') continue;

    if (char === "'" && !inDoubleQuote && !inBacktick) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (char === '"' && !inSingleQuote && !inBacktick) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (char === '`' && !inSingleQuote && !inDoubleQuote) {
      inBacktick = !inBacktick;
      continue;
    }

    if (inSingleQuote || inDoubleQuote || inBacktick) continue;

    if (char === '{') lineCurly++;
    else if (char === '}') lineCurly--;
    else if (char === '(') lineParen++;
    else if (char === ')') lineParen--;
    else if (char === '[') lineBracket++;
    else if (char === ']') lineBracket--;
  }

  cumCurly += lineCurly;
  cumParen += lineParen;
  cumBracket += lineBracket;

  if (cumCurly < 0 || cumParen < 0 || cumBracket < 0) {
    negativePoints.push({
      line: i + 1,
      curly: cumCurly,
      paren: cumParen,
      bracket: cumBracket,
      lineContent: line.substring(0, 80)
    });
  }
}

if (negativePoints.length > 0) {
  console.log('Lines where balance goes NEGATIVE:\n');
  negativePoints.forEach(point => {
    console.log(`Line ${point.line}:`);
    console.log(`  Curly: ${point.curly}, Paren: ${point.paren}, Bracket: ${point.bracket}`);
    console.log(`  Content: ${point.lineContent}`);
    console.log();
  });
}

console.log(`\n=== FINAL IMBALANCE ===`);
console.log(`Curly braces offset: ${curlyCount}`);
console.log(`Parentheses offset: ${parenCount}`);
console.log(`Square brackets offset: ${bracketCount}`);
