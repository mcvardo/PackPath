const fs = require('fs');

const filePath = '/sessions/epic-serene-cray/mnt/PackPath/backpacking-planner.jsx';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Proper stateful analyzer tracking across lines
let inMultilineComment = false;
let curlyBalance = 0;
let parenBalance = 0;
let bracketBalance = 0;

const negativeBalancePoints = [];
const extraClosingLines = [];

for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
  const line = lines[lineNum - 1];
  let i = 0;

  while (i < line.length) {
    const char = line[i];
    const nextChar = i + 1 < line.length ? line[i + 1] : '';

    // Handle multiline comments
    if (inMultilineComment) {
      if (char === '*' && nextChar === '/') {
        inMultilineComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    // Start multiline comment
    if (char === '/' && nextChar === '*') {
      inMultilineComment = true;
      i += 2;
      continue;
    }

    // Skip single-line comments
    if (char === '/' && nextChar === '/') {
      break; // Rest of line is comment
    }

    // Skip strings
    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      i++;
      while (i < line.length) {
        if (line[i] === quote && (i === 0 || line[i - 1] !== '\\')) {
          break;
        }
        i++;
      }
      i++;
      continue;
    }

    // Count brackets
    if (char === '{') {
      curlyBalance++;
    } else if (char === '}') {
      curlyBalance--;
      if (curlyBalance < 0 && !negativeBalancePoints.find(p => p.line === lineNum && p.type === 'curly')) {
        negativeBalancePoints.push({
          line: lineNum,
          type: 'curly',
          balance: curlyBalance,
          content: line
        });
      }
    } else if (char === '(') {
      parenBalance++;
    } else if (char === ')') {
      parenBalance--;
      if (parenBalance < 0 && !negativeBalancePoints.find(p => p.line === lineNum && p.type === 'paren')) {
        negativeBalancePoints.push({
          line: lineNum,
          type: 'paren',
          balance: parenBalance,
          content: line
        });
      }
    } else if (char === '[') {
      bracketBalance++;
    } else if (char === ']') {
      bracketBalance--;
      if (bracketBalance < 0 && !negativeBalancePoints.find(p => p.line === lineNum && p.type === 'bracket')) {
        negativeBalancePoints.push({
          line: lineNum,
          type: 'bracket',
          balance: bracketBalance,
          content: line
        });
      }
    }

    i++;
  }
}

console.log('=== COMPREHENSIVE BRACKET ANALYSIS ===\n');
console.log(`Total lines processed: ${lines.length}`);
console.log(`\nFinal Balance:`);
console.log(`  Curly braces: ${curlyBalance} (${curlyBalance > 0 ? 'EXTRA OPENS' : curlyBalance < 0 ? 'EXTRA CLOSES' : 'BALANCED'})`);
console.log(`  Parentheses: ${parenBalance} (${parenBalance > 0 ? 'EXTRA OPENS' : parenBalance < 0 ? 'EXTRA CLOSES' : 'BALANCED'})`);
console.log(`  Square brackets: ${bracketBalance} (${bracketBalance > 0 ? 'EXTRA OPENS' : bracketBalance < 0 ? 'EXTRA CLOSES' : 'BALANCED'})`);

if (negativeBalancePoints.length > 0) {
  console.log(`\n=== CRITICAL: NEGATIVE BALANCE POINTS (${negativeBalancePoints.length}) ===\n`);
  negativeBalancePoints.forEach(point => {
    console.log(`Line ${point.line} [${point.type.toUpperCase()}]: Balance = ${point.balance}`);
    console.log(`  ${point.content}`);
    console.log();
  });
}

// Now let's look for the lines most likely to have issues
// If final balance is +2 curly and +2 paren, there are 2 extra opens somewhere
// The problem is likely at the END of the file or in structural issues

console.log('\n=== SEARCHING FOR ROOT CAUSE ===\n');

// Look at the end of file - last 50 lines
console.log('Last 50 lines of file:\n');
for (let i = Math.max(0, lines.length - 50); i < lines.length; i++) {
  const lineNum = i + 1;
  const line = lines[i];
  // Show lines with bracket content
  if (line.includes('{') || line.includes('}') || line.includes('(') || line.includes(')')) {
    console.log(`${lineNum}: ${line}`);
  }
}

// Calculate cumulative balance at each line for detailed view
console.log('\n\n=== TRACKING BALANCE PER LINE (checking last 100 lines) ===\n');
let tempCurly = 0, tempParen = 0, tempBracket = 0;
inMultilineComment = false;

for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
  const line = lines[lineNum - 1];
  let i = 0;
  let lineCurly = 0, lineParen = 0, lineBracket = 0;

  while (i < line.length) {
    const char = line[i];
    const nextChar = i + 1 < line.length ? line[i + 1] : '';

    if (inMultilineComment) {
      if (char === '*' && nextChar === '/') {
        inMultilineComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inMultilineComment = true;
      i += 2;
      continue;
    }

    if (char === '/' && nextChar === '/') {
      break;
    }

    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      i++;
      while (i < line.length) {
        if (line[i] === quote && (i === 0 || line[i - 1] !== '\\')) {
          break;
        }
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

  tempCurly += lineCurly;
  tempParen += lineParen;
  tempBracket += lineBracket;

  // Show lines in last 100 with bracket changes
  if (lineNum >= lines.length - 100 && (lineCurly !== 0 || lineParen !== 0 || lineBracket !== 0)) {
    console.log(`Line ${lineNum}: C:${lineCurly > 0 ? '+' : ''}${lineCurly} P:${lineParen > 0 ? '+' : ''}${lineParen} B:${lineBracket > 0 ? '+' : ''}${lineBracket}  |  Cum: C:${tempCurly} P:${tempParen} B:${tempBracket}`);
    console.log(`  ${line}`);
  }
}
