type ConsentCheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export default function ConsentCheckbox({
  checked,
  onChange,
}: ConsentCheckboxProps) {
  return (
    <label className="flex items-start gap-2 text-sm text-zinc-600">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-300 text-red-600 focus:ring-red-500"
        required
      />
      <span>
        ฉันยินยอมให้เปิดเผยตำแหน่งโดยประมาณและความต้องการของฉันแบบสาธารณะ
        (ไม่รวมเบอร์โทรและตำแหน่งแม่นยำ ซึ่งจะเห็นได้เฉพาะทีมกู้ภัยที่ผ่านการยืนยันตัวตนเท่านั้น)
        เพื่อให้ได้รับความช่วยเหลือโดยเร็วที่สุด
      </span>
    </label>
  );
}
