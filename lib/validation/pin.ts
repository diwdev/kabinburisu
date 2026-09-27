import { z } from "zod";
import { isValidPhoneNumber } from "libphonenumber-js";
import { THAILAND_BOUNDS } from "@/lib/constants";

/**
 * zod schemas for every server-side entry point under app/api/pins/** —
 * per PLAN.md §8, these run independently of whatever client-side validation
 * PinForm.tsx does, as defense in depth. The DB check constraints (0001_init.sql)
 * are a third, looser layer under all of this.
 */

const thaiPhoneSchema = z
  .string()
  .trim()
  .min(1, "กรุณากรอกเบอร์โทรศัพท์")
  .refine((value) => isValidPhoneNumber(value, "TH"), {
    message: "รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง กรุณากรอกเบอร์มือถือ/บ้านในประเทศไทย",
  });

const latSchema = z
  .number()
  .min(THAILAND_BOUNDS.minLat, "พิกัดละติจูดอยู่นอกประเทศไทย")
  .max(THAILAND_BOUNDS.maxLat, "พิกัดละติจูดอยู่นอกประเทศไทย");

const lngSchema = z
  .number()
  .min(THAILAND_BOUNDS.minLng, "พิกัดลองจิจูดอยู่นอกประเทศไทย")
  .max(THAILAND_BOUNDS.maxLng, "พิกัดลองจิจูดอยู่นอกประเทศไทย");

const pinFieldsSchema = z.object({
  lat: latSchema,
  lng: lngSchema,
  headcount: z
    .number()
    .int("จำนวนคนต้องเป็นจำนวนเต็ม")
    .min(1, "ต้องมีอย่างน้อย 1 คน")
    .max(50, "จำนวนคนต้องไม่เกิน 50 คน"),
  needsFood: z.boolean().default(false),
  needsMedicine: z.boolean().default(false),
  needsMedicalAid: z.boolean().default(false),
  note: z
    .string()
    .trim()
    .max(500, "รายละเอียดต้องไม่เกิน 500 ตัวอักษร")
    .optional()
    .or(z.literal("")),
  phone: thaiPhoneSchema,
  contactName: z
    .string()
    .trim()
    .max(100, "ชื่อผู้ติดต่อต้องไม่เกิน 100 ตัวอักษร")
    .optional()
    .or(z.literal("")),
});

export const CreatePinSchema = pinFieldsSchema.extend({
  consent: z.literal(true, {
    message: "ต้องติ๊กยอมรับเงื่อนไขความเป็นส่วนตัวก่อนส่งข้อมูล",
  }),
});

export const UpdatePinSchema = pinFieldsSchema.partial();

export const StatusChangeSchema = z.object({
  status: z.enum(["active", "stale", "helped", "closed", "suspicious"], {
    message: "สถานะไม่ถูกต้อง",
  }),
});

export type CreatePinInput = z.infer<typeof CreatePinSchema>;
export type UpdatePinInput = z.infer<typeof UpdatePinSchema>;
export type StatusChangeInput = z.infer<typeof StatusChangeSchema>;
