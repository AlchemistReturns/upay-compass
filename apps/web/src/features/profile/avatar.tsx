import { User } from "lucide-react";
import { cn } from "@/lib/utils";

/** Up to two initials from the name (first letter of the first two words); none without a name. */
export function initials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => Array.from(w)[0] ?? "")
    .join("")
    .toUpperCase();
}

/** Stored as digits without the plus ("8801700000001"); shown as "+880 1700-000001". */
export function formatPhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const m = digits.match(/^880(\d{4})(\d{6})$/);
  return m ? `+880 ${m[1]}-${m[2]}` : phone ? `+${digits}` : "";
}

/** Navy circle with the user's initials, or a person icon when no name is set. Decorative. */
export function Avatar({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  const text = initials(name);
  return (
    <span
      aria-hidden
      className={cn(
        "bg-brand-ink grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white ring-2 ring-white/80",
        className,
      )}
    >
      {text || <User className="size-[45%]" />}
    </span>
  );
}
