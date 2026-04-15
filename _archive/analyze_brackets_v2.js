const fs = require('fs');

const filePath = '/sessions/epic-serene-cray/mnt/PackPath/backpacking-planner.jsx';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// More robust bracket counter with proper string/comment handling
function analyzeLine(line) {
  const tokens = {
    curly: { open: 0, close: 0 },
    paren: { open: 0, close: 0 },
    bracket: { open: 0, close: 0 }
  };

  let i = 0;
  while (i < line.length) {
    const char = line[i];
    const nextChar = line[i + 1];
    const prevChar = i > 0 ? line[i - 1] : '';

    // Skip comments
    if (char === '/' && nextChar === '/') {
      break; // Rest of line is comment
    }
    if (char === '/' && nextChar === '*') {
      // Find end of block comment on this line
      let j = i + 2;
      while (j < line.length - 1) {
        if (line[j] === '*' && line[j + 1] === '/') {
          i = j + 1;
          break;
        }
        j++;
      }
      i++;
      continue;
    }

    // Skip strings
    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      i++;
      while (i < line.length) {
        if (line[i] === quote && line[i - 1] !== '\\') {
          break;
        }
        i++;
      }
      i++;
      continue;
    }

    // Count brackets
    if (char === '{') tokens.curly.open++;
    else if (char === '}') tokens.curly.close++;
    else if (char === '(') tokens.paren.open++;
    else if (char === ')') tokens.paren.close++;
    else if (char === '[') tokens.bracket.open++;
    else if (char === ']') tokens.bracket.close++;

    i++;
  }

  return tokens;
}

// Build cumulative counts
let cumCurlyOpen = 0, cumCurlyClose = 0;
let cumParenOpen = 0, cumParenClose = 0;
let cumBracketOpen = 0, cumBracketClose = 0;

const problematicLines = [];

for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
  const tokens = analyzeLine(lines[lineNum - 1]);

  cumCurlyOpen += tokens.curly.open;
  cumCurlyClose += tokens.curly.close;
  cumParenOpen += tokens.paren.open;
  cumParenClose += tokens.paren.close;
  cumBracketOpen += tokens.bracket.open;
  cumBracketClose += tokens.bracket.close;

  const curlyBalance = cumCurlyOpen - cumCurlyClose;
  const parenBalance = cumParenOpen - cumParenClose;
  const bracketBalance = cumBracketOpen - cumBracketClose;

  // Track when close exceeds open
  if (tokens.curly.close > tokens.curly.open ||
      tokens.paren.close > tokens.paren.open ||
      tokens.bracket.close > tokens.bracket.open) {
    problematicLines.push({
      line: lineNum,
      content: lines[lineNum - 1],
      tokens,
      balances: { curlyBalance, parenBalance, bracketBalance }
    });
  }
}

console.log('=== ANALYSIS RESULTS ===\n');
console.log(`Total lines: ${lines.length}`);
console.log(`\nFinal Cumulative Counts:`);
console.log(`  Curly braces:     Opens: ${cumCurlyOpen}, Closes: ${cumCurlyClose}, Balance: ${cumCurlyOpen - cumCurlyClose}`);
console.log(`  Parentheses:      Opens: ${cumParenOpen}, Closes: ${cumParenClose}, Balance: ${cumParenOpen - cumParenClose}`);
console.log(`  Square brackets:  Opens: ${cumBracketOpen}, Closes: ${cumBracketClose}, Balance: ${cumBracketOpen - cumBracketClose}`);

if (problematicLines.length > 0) {
  console.log(`\n=== LINES WITH MISMATCHED BRACKETS (${problematicLines.length} total) ===\n`);

  // Show first 20 problematic lines
  problematicLines.slice(0, 20).forEach(item => {
    console.log(`Line ${item.line}:`);
    if (item.tokens.curly.close > item.tokens.curly.open) {
      console.log(`  Curly: ${item.tokens.curly.close} closes > ${item.tokens.curly.open} opens`);
    }
    if (item.tokens.paren.close > item.tokens.paren.open) {
      console.log(`  Paren: ${item.tokens.paren.close} closes > ${item.tokens.paren.open} opens`);
    }
    if (item.tokens.bracket.close > item.tokens.bracket.open) {
      console.log(`  Bracket: ${item.tokens.bracket.close} closes > ${item.tokens.bracket.open} opens`);
    }
    console.log(`  Content: ${item.content.substring(0, 100)}`);
    console.log();
  });

  if (problematicLines.length > 20) {
    console.log(`... and ${problematicLines.length - 20} more problematic lines\n`);
  }
}

// Show first 10 lines with imbalanced closing brackets
console.log('\n=== LINES WHERE CLOSING > OPENING (First 10) ===\n');
let count = 0;
for (const item of problematicLines) {
  if (count >= 10) break;
  if (item.tokens.curly.close > 0 || item.tokens.paren.close > 0 || item.tokens.bracket.close > 0) {
    console.log(`Line ${item.line}: ${item.content}`);
    count++;
  }
}
