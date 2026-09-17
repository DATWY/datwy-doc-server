const { spawn, execSync } = require('child_process');
const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');

// ── Terminate previous instances and free port 5000 ──
try {
  if (process.platform === 'win32') {
    // 1. Kill other tunnel-runner instances
    execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name = 'node.exe' and CommandLine like '%tunnel-runner%'\\" | Where-Object { $_.ProcessId -ne ${process.pid} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`, { stdio: 'ignore' });
    // 2. Kill cloudflared
    execSync('taskkill /F /IM cloudflared.exe', { stdio: 'ignore' });
    // 3. Free port 5000 if occupied
    execSync('powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"', { stdio: 'ignore' });
  }
} catch (e) {}

// Auto-check node_modules
if (!fs.existsSync(path.join(__dirname, 'node_modules'))) {
  console.log('[*] Lần đầu khởi chạy: Đang tự động cài đặt thư viện cần thiết...');
  try {
    execSync('npm install', { cwd: __dirname, stdio: 'inherit' });
  } catch (e) {
    console.error('Lỗi khi chạy npm install:', e.message);
  }
}

const FIREBASE_RTDB_URL = 'https://chat-wywy-default-rtdb.firebaseio.com/system/downloader_config.json';
const winBinPath = path.join(__dirname, 'bin', 'cloudflared.exe');
const CLOUDFLARED_PATH = fs.existsSync(winBinPath) ? winBinPath : 'cloudflared';

console.log('======================================================================');
console.log('🚀 DATWY DOC DOWNLOADER - BACKEND & CLOUDFLARE SYNC');
console.log('======================================================================\n');

// ── 1. Start Express Server & Wait for Health Check ──
console.log('[1/3] Đang khởi động Express API Server trên cổng 5000...');
const serverProcess = spawn('node', ['index.js'], {
  cwd: __dirname,
  stdio: 'inherit'
});

serverProcess.on('error', err => {
  console.error('[Express Lỗi]', err);
});

serverProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`[Express] Tiến trình dừng với mã lỗi: ${code}`);
  }
});

// Helper: Check local Express health
function waitForLocalServer(maxRetries = 15, delayMs = 600) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.get('http://localhost:5000/api/health', (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          retry();
        }
      });
      req.on('error', () => retry());
      req.setTimeout(1500, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (attempts >= maxRetries) {
        reject(new Error('Express server không phản hồi sau 15 lần thử trên cổng 5000.'));
      } else {
        setTimeout(check, delayMs);
      }
    };

    check();
  });
}

// ── 2. Helper function to update Firebase Realtime Database ──
function updateFirebase(url, status = 'online') {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      apiUrl: url,
      status: status,
      updatedAt: Date.now()
    });

    const req = https.request(FIREBASE_RTDB_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 8000
    }, res => {
      if (res.statusCode === 200) {
        resolve(true);
      } else {
        console.warn(`[Firebase Sync] Phản hồi: ${res.statusCode}`);
        resolve(false);
      }
    });

    req.on('error', err => {
      console.warn('[Firebase Sync Lỗi]:', err.message);
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

// Helper: Verify public HTTPS URL is live and accepting requests
function verifyPublicUrl(url) {
  return new Promise((resolve) => {
    const testUrl = `${url}/api/health`;
    const req = https.get(testUrl, { timeout: 7000 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

// ── 3. Start Cloudflare Tunnel and Monitor ──
async function startTunnelRunner() {
  try {
    await waitForLocalServer();
    console.log('       ✅ Express API Server đã sẵn sàng và đang lắng nghe tại http://localhost:5000!\n');
  } catch (err) {
    console.error(`       ❌ ${err.message}`);
    console.error('       Vui lòng kiểm tra lại xem cổng 5000 có bị ứng dụng khác chặn không.');
    return;
  }

  console.log('[2/3] Đang khởi tạo đường hầm bảo mật Cloudflare Quick Tunnel...');
  
  let tunnelProcess;
  let detectedUrl = null;
  let heartbeatTimer = null;
  let checkPublicTimer = null;
  let isRegistered = false;

  function spawnTunnel() {
    tunnelProcess = spawn(CLOUDFLARED_PATH, [
      'tunnel',
      '--url', 'http://localhost:5000',
      '--protocol', 'http2',
      '--edge-ip-version', '4',
      '--no-prechecks'
    ], {
      cwd: __dirname
    });

    const handleData = async (data) => {
      const output = data.toString();
      
      const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && !detectedUrl) {
        detectedUrl = match[0];
        console.log(`[Cloudflare] Đã phát hiện URL công khai: ${detectedUrl}`);
        console.log('[Cloudflare] Đang chờ đăng ký định tuyến tại Edge...');

        // Start active ping verification
        let pollCount = 0;
        if (checkPublicTimer) clearInterval(checkPublicTimer);
        checkPublicTimer = setInterval(async () => {
          pollCount++;
          const isHealthy = await verifyPublicUrl(detectedUrl);
          if (isHealthy && !isRegistered) {
            isRegistered = true;
            if (checkPublicTimer) { clearInterval(checkPublicTimer); checkPublicTimer = null; }
            onTunnelReady(detectedUrl);
          }
          if (pollCount > 25 && checkPublicTimer) {
            clearInterval(checkPublicTimer);
            checkPublicTimer = null;
          }
        }, 1200);
      }

      if ((output.includes('Registered tunnel connection') || output.includes('Connection') && output.includes('registered')) && !isRegistered) {
        if (detectedUrl) {
          isRegistered = true;
          if (checkPublicTimer) { clearInterval(checkPublicTimer); checkPublicTimer = null; }
          onTunnelReady(detectedUrl);
        }
      }

      if (output.includes('ERR')) {
        console.warn('[Cloudflare Notice]', output.trim());
      }
    };

    tunnelProcess.stderr.on('data', handleData);
    if (tunnelProcess.stdout) {
      tunnelProcess.stdout.on('data', handleData);
    }

    tunnelProcess.on('exit', (code) => {
      console.warn(`[Cloudflare] Tunnel đã ngắt kết nối (Exit code: ${code}). Đang thử kết nối lại sau 3s...`);
      isRegistered = false;
      detectedUrl = null;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      setTimeout(spawnTunnel, 3000);
    });

    tunnelProcess.on('error', err => {
      console.error('[Cloudflare Lỗi]', err);
    });
  }

  async function onTunnelReady(url) {
    console.log('\n======================================================================');
    console.log('🎉 TẠO ĐƯỜNG HẦM THÀNH CÔNG & ĐÃ ĐƯỢC XÁC THỰC HOẠT ĐỘNG:');
    console.log(`🌐 Public URL:    ${url}`);
    console.log(`📍 Local Server:   http://localhost:5000`);
    console.log(`📱 Website Live:   https://iamdatwy.web.app`);
    console.log('======================================================================\n');

    console.log('[3/3] Đang đồng bộ trạng thái lên Firebase Realtime Database...');
    const synced = await updateFirebase(url, 'online');
    if (synced) {
      console.log('       ✅ ĐÃ ĐỒNG BỘ: Web https://iamdatwy.web.app sẽ tự động kết nối Server Online!');
      console.log('       💡 Bạn có thể vào web và tải tài liệu ngay bây giờ.\n');
    }

    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (detectedUrl && isRegistered) {
        updateFirebase(detectedUrl, 'online');
      }
    }, 20000); // 20s heartbeat for extra reliability
  }

  spawnTunnel();

  // Cleanup on exit
  function cleanup() {
    console.log('\n[*] Đang tắt hệ thống và cập nhật trạng thái Offline lên Firebase...');
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (detectedUrl) {
      updateFirebase(detectedUrl, 'offline');
    }
    try { if (tunnelProcess) tunnelProcess.kill(); } catch (e) {}
    try { if (serverProcess) serverProcess.kill(); } catch (e) {}
    setTimeout(() => process.exit(0), 1200);
  }

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Windows-specific close handling
  if (process.platform === 'win32') {
    const rl = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.on('SIGINT', () => {
      process.emit('SIGINT');
    });
  }
}

startTunnelRunner();
