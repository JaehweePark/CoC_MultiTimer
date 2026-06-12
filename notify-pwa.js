// PWA(iOS 홈 화면 웹앱)용 알림 어댑터 — notify.js와 동일한 syncNotifications 인터페이스
// 네이티브 대신 서비스 워커 + 웹 알림 권한을 사용

let swReg = null;
let permissionAsked = false;
const PENDING_KEY = "jangin-pending-notifs";

export async function initPWA() {
  if (!("serviceWorker" in navigator)) return;
  try {
    swReg = await navigator.serviceWorker.register("./sw.js");
    await navigator.serviceWorker.ready;
    // 재진입 시: 지난번 예약 중 이미 완료됐어야 할 항목을 즉시 알림으로 발화
    const raw = localStorage.getItem(PENDING_KEY);
    if (raw && Notification.permission === "granted") {
      const items = JSON.parse(raw);
      const due = items.filter((i) => i.at <= Date.now());
      if (due.length && swReg.active) {
        swReg.active.postMessage({ type: "FIRE_NOW", items: due.slice(0, 20) });
      }
    }
  } catch (e) {
    console.warn("SW register failed:", e);
  }
}

export async function syncNotifications(items) {
  // 브라우저 알림 미지원이면 조용히 무시
  if (typeof Notification === "undefined" || !swReg) return;
  try {
    if (!permissionAsked && Notification.permission === "default") {
      permissionAsked = true;
      await Notification.requestPermission();
    }
    if (Notification.permission !== "granted") return;

    // 재진입 발화용으로 예약 목록 보관
    localStorage.setItem(PENDING_KEY, JSON.stringify(items.slice(0, 50)));

    const reg = swReg.active || (await navigator.serviceWorker.ready).active;
    if (reg) reg.postMessage({ type: "SCHEDULE", items: items.slice(0, 50) });
  } catch (e) {
    console.warn("notify sync failed:", e);
  }
}
