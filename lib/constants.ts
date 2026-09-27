/**
 * ค่าเริ่มต้นของแผนที่: จุดศูนย์กลางอำเภอกบินทร์บุรี จ.ปราจีนบุรี
 * (ค่านี้แทนที่พิกัด "ตัวเมืองปราจีนบุรี" ที่เป็นตัวอย่างใน PLAN.md §4 —
 * ยืนยันแล้วว่าให้ใช้กบินทร์บุรีเป็นจุดโฟกัสหลักของเครื่องมือนี้)
 */
export const MAP_CENTER = { lat: 13.99147, lng: 101.71488 };
export const DEFAULT_ZOOM = 12;

/** กรอบพิกัดคร่าวๆ ของประเทศไทย ใช้ตรวจสอบ input ค้นหาจากพิกัด (§4) */
export const THAILAND_BOUNDS = {
  minLat: 5.5,
  maxLat: 20.5,
  minLng: 97,
  maxLng: 105.7,
};

export const PIN_STATUS_COLORS: Record<string, string> = {
  active: "#dc2626", // แดง — ยังรอความช่วยเหลือ
  stale: "#6b7280", // เทา — หมดอายุ/ยังไม่ยืนยันซ้ำ
  helped: "#16a34a", // เขียว — ช่วยเหลือแล้ว
  closed: "#9ca3af",
  suspicious: "#f59e0b",
};

export const MAX_ACTIVE_PINS_PER_ACCOUNT = 3;
export const PIN_STALE_HOURS = 48;
export const PHONE_PURGE_DAYS = 7;
