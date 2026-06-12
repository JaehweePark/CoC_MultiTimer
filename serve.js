// 윈도우에서 실행하는 로컬 HTTPS 서버 — 아이패드 PWA 알림은 HTTPS에서만 동작
// 사용법: node serve.js  →  표시되는 https://<PC-IP>:8443 주소를 아이패드 사파리에 입력
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const PORT = 8443;
const DIR = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function localIPs() {
  const os = require("os");
  const out = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces) if (i.family === "IPv4" && !i.internal) out.push(i.address);
  }
  return out;
}

// 자체 서명 인증서 생성 (없으면)
const certPath = path.join(DIR, "cert.pem");
const keyPath = path.join(DIR, "key.pem");
let creds = null;
if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  creds = { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) };
} else {
  try {
    execSync(
      `openssl req -x509 -newkey rsa:2048 -nodes -keyout "${keyPath}" -out "${certPath}" -days 3650 -subj "/CN=jangin-hq"`,
      { stdio: "ignore" }
    );
    creds = { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) };
    console.log("자체 서명 인증서를 생성했습니다.");
  } catch (e) {
    console.log("\n⚠ openssl이 없어 HTTPS 인증서를 만들지 못했습니다.");
    console.log("  Git이 설치돼 있으면 Git Bash에서 실행하거나, openssl을 설치하세요.");
    console.log("  대안: 아이패드와 PC를 USB 테더링으로 연결하면 http로도 알림 외 기능은 테스트 가능합니다.\n");
  }
}

const handler = (req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = path.join(DIR, p);
  if (!file.startsWith(DIR) || !fs.existsSync(file)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
};

const ips = localIPs();
if (creds) {
  https.createServer(creds, handler).listen(PORT, () => {
    console.log("\n========================================");
    console.log("  장인 사령부 PWA 서버 실행 중 (HTTPS)");
    console.log("========================================");
    console.log("  아이패드 사파리에서 아래 주소 입력:");
    ips.forEach((ip) => console.log(`    https://${ip}:${PORT}`));
    console.log("\n  ※ '안전하지 않음' 경고가 뜨면");
    console.log("     [고급] → [방문] 을 눌러 진행하세요 (자체 서명 인증서라 정상)");
    console.log("  종료: Ctrl + C");
    console.log("========================================\n");
  });
} else {
  http.createServer(handler).listen(8080, () => {
    console.log("\nHTTP 모드(8080)로 실행 — 알림은 제한됩니다.");
    ips.forEach((ip) => console.log(`  http://${ip}:8080`));
  });
}
