// 서비스 워커 — PWA 알림 + 오프라인 캐시
// iOS 홈 화면 PWA에서 로컬 예약 알림을 띄우기 위한 핵심 모듈

const CACHE = "cctimer-1.0.11-25";

// 오프라인 동작용 앱 셸. 동일 출처 자원만 설치 시 미리 캐시(원격 CDN은 fetch 시 지연 캐시).
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./notify-pwa.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// HTML(내비게이션)은 네트워크 우선 → 항상 최신. 실패 시 캐시(오프라인).
// 그 외 자원은 stale-while-revalidate(빠름 + 백그라운드 갱신).
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // 구글 API·인증은 SW 미개입(항상 네트워크) — Drive 다운로드가 캐시된 옛 데이터를 돌려주던 문제 방지
  const host = new URL(e.request.url).hostname;
  if (host.endsWith("googleapis.com") || host.endsWith("google.com")) return;
  const isDoc = e.request.mode === "navigate" || e.request.destination === "document";
  if (isDoc) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then((c) => c || caches.match("./index.html")))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request)
        .then((res) => {
          if (res && res.status === 200 && (res.type === "basic" || res.type === "cors")) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// 앱(메인 스레드)이 보내는 메시지로 알림 예약/취소를 관리
// iOS PWA는 백그라운드 타이머가 제한적이라, 예약 목록을 워커에 보관하고
// 앱이 열릴 때마다 동기화 + 지난 알림 즉시 발화 방식으로 보완한다.
let timers = [];

self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "SCHEDULE") {
    // 기존 타이머 전부 제거
    timers.forEach((t) => clearTimeout(t));
    timers = [];
    const now = Date.now();
    for (const item of msg.items) {
      const delay = item.at - now;
      if (delay <= 0) continue;
      // setTimeout은 워커가 살아있는 동안만 유효 → 앱이 포그라운드/최근일 때 보강
      if (delay < 24 * 60 * 60 * 1000) {
        const id = setTimeout(() => {
          self.registration.showNotification(item.title, {
            body: item.body,
            icon: "./icons/icon-192.png",
            badge: "./icons/icon-192.png",
            tag: "upg-" + item.at,
            data: { url: "./" },
          });
        }, delay);
        timers.push(id);
      }
    }
  } else if (msg.type === "FIRE_NOW") {
    // 앱 재진입 시 "이미 끝났어야 할" 알림을 한 번에 발화
    for (const item of msg.items) {
      self.registration.showNotification(item.title, {
        body: item.body,
        icon: "./icons/icon-192.png",
        badge: "./icons/icon-192.png",
        tag: "done-" + item.at,
        data: { url: "./" },
      });
    }
  }
});

// 알림 탭하면 앱으로 포커스
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.focus();
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});
