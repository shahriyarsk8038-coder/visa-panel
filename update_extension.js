const fs = require('fs');
const path = require('path');

const targetExtensionDir = path.join(__dirname, '../new extension');

console.log("=================================================");
console.log("🛠️ Extension License Auto-Updater Tool");
console.log("=================================================");

let inputDir = process.argv[2];

if (!inputDir || !fs.existsSync(inputDir)) {
  console.log("\n❌ Usage: Drag & drop the developer extension folder onto 'update_extension.bat'");
  process.exit(1);
}

// Smart detection: Find the folder that actually contains 'manifest.json'
function findManifestFolder(startDir) {
  if (fs.existsSync(path.join(startDir, 'manifest.json'))) {
    return startDir;
  }
  const files = fs.readdirSync(startDir);
  for (const file of files) {
    const fullPath = path.join(startDir, file);
    if (fs.statSync(fullPath).isDirectory() && file !== '__MACOSX' && file !== 'node_modules') {
      const found = findManifestFolder(fullPath);
      if (found) return found;
    }
  }
  return null;
}

const sourceFolder = findManifestFolder(inputDir);

if (!sourceFolder) {
  console.log(`\n❌ Error: Could not find 'manifest.json' inside:\n   ${inputDir}`);
  console.log("Please make sure you drop a valid Chrome Extension folder.");
  process.exit(1);
}

console.log(`\n🔍 Auto-detected extension folder:\n   ${sourceFolder}`);
console.log(`\nUpdating target folder:\n   ${targetExtensionDir}\n`);

// Recursive copy
function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(childItemName => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Copy new developer files over target
copyRecursiveSync(sourceFolder, targetExtensionDir);
console.log("✅ New developer files copied successfully.");

// Re-inject Security Files
console.log("\nRe-injecting Security Guard & Auth System...");
const guardFiles = ['auth_guard.js', 'auth_content_guard.js', 'popup_auth.js'];

guardFiles.forEach(file => {
  const srcFile = path.join(__dirname, 'auth_templates', file);
  const destFile = path.join(targetExtensionDir, file);
  if (fs.existsSync(srcFile)) {
    fs.copyFileSync(srcFile, destFile);
    console.log(`   + Re-injected ${file}`);
  }
});

// Update manifest.json
const manifestPath = path.join(targetExtensionDir, 'manifest.json');
if (fs.existsSync(manifestPath)) {
  let manifestStr = fs.readFileSync(manifestPath, 'utf8');
  try {
    let manifest = JSON.parse(manifestStr);
    if (manifest.content_scripts && manifest.content_scripts.length > 0) {
      manifest.content_scripts.forEach(cs => {
        if (!cs.js.includes('auth_content_guard.js')) {
          cs.js.unshift('auth_content_guard.js');
        }
      });
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    console.log("   + Updated manifest.json with auth_content_guard.js");
  } catch (e) {
    console.error("   ⚠️ Warning: Could not parse manifest.json", e);
  }
}

// Update popup.html
const popupPath = path.join(targetExtensionDir, 'popup.html');
if (fs.existsSync(popupPath)) {
  let popupHtml = fs.readFileSync(popupPath, 'utf8');
  if (!popupHtml.includes('popup_auth.js')) {
    popupHtml = popupHtml.replace('</body>', '  <script src="popup_auth.js"></script>\n</body>');
    fs.writeFileSync(popupPath, popupHtml, 'utf8');
    console.log("   + Updated popup.html with popup_auth.js script tag");
  }
}

console.log("\n=================================================");
console.log("🎉 SUCCESS! Your extension is fully updated & secured!");
console.log("   Now go to chrome://extensions and click Reload 🔄");
console.log("=================================================\n");
