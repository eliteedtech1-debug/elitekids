#!/usr/bin/env node
/**
 * EliteKids persistent dev daemon — starts backend + frontend as child
 * processes that survive the parent shell. Kill with: pkill -f elitekids
 */

const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BACKEND = __dirname;
const FRONTEND = path.join(ROOT, 'frontend');

const children = [];

function start(label, cmd, args, cwd, env = {}) {
  const fullEnv = { ...process.env, ...env };
  const proc = spawn(cmd, args, { cwd, env: fullEnv, stdio: 'ignore', detached: true });
  children.push({ label, proc });
  proc.unref();
  console.log(`  🚀 ${label} started (PID ${proc.pid})`);
  return proc;
}

// Kill any existing instances
try { require('child_process').execSync('pkill -f "elite-kids/backend.*index.js" 2>/dev/null || true'); } catch {}
try { require('child_process').execSync('pkill -f "elite-kids/frontend.*vite" 2>/dev/null || true'); } catch {}

console.log('\n  Starting EliteKids dev servers...\n');

start('Backend API', 'node', ['src/index.js'], BACKEND, { NODE_ENV: 'development' });
start('Frontend Vite', 'npx', ['vite', '--host', '--port', '34601'], FRONTEND, { VITE_API_URL: 'http://localhost:34600' });

setTimeout(() => {
  console.log('');
  console.log('════════════════════════════════════════════════');
  console.log('  ✅ EliteKids Dev Daemon Running');
  console.log('');
  console.log('  Frontend: http://localhost:34601/login');
  console.log('  Backend:  http://localhost:34600');
  console.log('');
  console.log('  Parent:   hhfh@hhf.com / test1234');
  console.log('  Student:  213232/1/0029 / test1234');
  console.log('  Admin:    admin@kids.test / Admin@123');
  console.log('');
  console.log('  Stop:  pkill -f "elite-kids"');
  console.log('════════════════════════════════════════════════');
  process.exit(0);
}, 2000);
