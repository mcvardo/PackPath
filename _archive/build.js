const fs = require('fs');

// Read the JSX source
let jsx = fs.readFileSync('backpacking-planner.jsx', 'utf8');

// Strip ES module imports/exports for browser inline use
jsx = jsx.replace(/^import\s+.*?;\s*$/gm, '');
jsx = jsx.replace(/^export\s+default\s+/m, 'const PackPathApp = ');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PackPath - Backpacking Route Planner</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"><\/script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"><\/script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.9/babel.min.js"><\/script>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }</style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect, useMemo, useCallback, useRef } = React;

${jsx}

    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(PackPathApp));
  <\/script>
</body>
</html>`;

fs.writeFileSync('packpath.html', html);
console.log('Built packpath.html:', Math.round(html.length / 1024) + 'KB');
