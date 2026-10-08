const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, '..', 'src', 'client', 'pages');
const manifestLink = '  <link rel="manifest" href="/manifest.webmanifest">\n  <meta name="theme-color" content="#c96e6e">\n  <meta name="apple-mobile-web-app-capable" content="yes">\n  <meta name="apple-mobile-web-app-status-bar-style" content="default">\n  <meta name="apple-mobile-web-app-title" content="Housewife Diary">\n  <link rel="apple-touch-icon" href="/icons/icon-192.png">\n';

const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.html'));

files.forEach(file => {
  const filePath = path.join(pagesDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Check if manifest link already exists
  if (!content.includes('manifest.webmanifest')) {
    // Insert after <title> tag
    content = content.replace(
      '</title>',
      '</title>\n' + manifestLink
    );
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Updated ${file}`);
  } else {
    console.log(`Skipped ${file} (already has manifest)`);
  }
});

console.log('Done updating all pages with manifest link');