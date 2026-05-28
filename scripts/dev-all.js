const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');

// Background process: mqtt-listener (equivalent to "start /b")
const logOut = fs.openSync(path.join(ROOT, 'mqtt-listener.dev.log'), 'w');
const logErr = fs.openSync(path.join(ROOT, 'mqtt-listener.dev.err'), 'w');

spawn('npm', ['--prefix', 'mqtt-listener', 'run', 'dev'], {
  cwd: ROOT,
  stdio: ['ignore', logOut, logErr],
  shell: true,
  detached: true,
}).unref();

// Foreground process: dev:web (equivalent to "npm run dev:web")
spawn('npm', ['run', 'dev:web'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true,
});
