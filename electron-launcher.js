const { spawn } = require('child_process');
const path = require('path');

// Launch Electron with the main file
const electron = require('electron');
const electronPath = electron;

console.log('Starting Electron application...');

const child = spawn(electronPath, [path.join(__dirname, 'main.js')], {
  stdio: 'inherit',
  windowsHide: false
});

child.on('close', (code) => {
  console.log(`Electron process exited with code ${code}`);
  process.exit(code);
});