/**
 * แปลงข้อความ error ที่มาจาก trigger/constraint ของ Postgres (supabase/migrations/0002_*.sql)
 * ให้เป็นข้อความภาษาไทยที่อ่านง่าย ใช้ร่วมกันทุก route handler ใต้ app/api/pins/**
 */
export function mapPinError(message: string): string {
  if (message.includes("MAX_ACTIVE_PINS_EXCEEDED")) {
    return "คุณมีหมุดที่ยังไม่ปิดครบ 3 หมุดแล้ว กรุณาปิดหมุดเก่าก่อนสร้างใหม่";
  }
  if (message.includes("ACCOUNT_BANNED")) {
    return "บัญชีนี้ถูกระงับการใช้งาน";
  }
  if (message.includes("STATUS_TRANSITION_DENIED")) {
    return "ไม่มีสิทธิ์เปลี่ยนสถานะนี้";
  }
  return "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";
}

export function mapPinErrorStatus(message: string): number {
  if (message.includes("MAX_ACTIVE_PINS_EXCEEDED")) return 409;
  if (message.includes("ACCOUNT_BANNED")) return 403;
  if (message.includes("STATUS_TRANSITION_DENIED")) return 403;
  return 400;
}
