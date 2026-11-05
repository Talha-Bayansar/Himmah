import { CommunityError, uuid } from "../community/contracts.ts";
export type OrganizationSettings = {
  name: string;
  description: string;
  email: string;
  phone: string;
  timezone: string;
  defaultLanguage: "en" | "nl" | "tr" | null;
  quietEnabled: boolean;
  quietStart: number;
  quietEnd: number;
  version: number;
};
export type SettingsInput = Omit<
  OrganizationSettings,
  "version" | "defaultLanguage"
> & { defaultLanguage: "en" | "nl" | "tr"; version: number; key: string };
export function minuteTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
export function timeMinute(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return NaN;
  const [h, m] = value.split(":").map(Number);
  return h! < 24 && m! < 60 ? h! * 60 + m! : NaN;
}
export function settingsInput(raw: Record<string, unknown>): SettingsInput {
  const fail = () => {
    throw new CommunityError("invalid_input");
  };
  const string = (key: string, max: number, multiline = false) => {
    const v = raw[key];
    if (
      typeof v !== "string" ||
      v.length > max ||
      (multiline
        ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u
        : /[\u0000-\u001f\u007f]/u
      ).test(v)
    )
      return fail();
    return v.trim();
  };
  const name = string("name", 100),
    description = string("description", 1000, true),
    email = string("email", 254),
    phone = string("phone", 64),
    timezone = string("timezone", 80);
  if (
    name.length < 2 ||
    (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
    (phone && !/^\+[1-9][\d ()-]{5,63}$/.test(phone)) ||
    (phone && !/^\+[1-9]\d{6,14}$/.test(phone.replace(/[ ()-]/g, "")))
  )
    return fail();
  try {
    if (!timezone) return fail();
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    return fail();
  }
  if (
    !["en", "nl", "tr"].includes(String(raw.defaultLanguage)) ||
    typeof raw.quietEnabled !== "boolean" ||
    ![raw.quietStart, raw.quietEnd].every(
      (v) => Number.isInteger(v) && Number(v) >= 0 && Number(v) < 1440,
    ) ||
    (raw.quietEnabled && raw.quietStart === raw.quietEnd) ||
    !Number.isSafeInteger(raw.version) ||
    Number(raw.version) < 0 ||
    Number(raw.version) > 2147483646
  )
    return fail();
  return {
    name,
    description,
    email,
    phone,
    timezone,
    defaultLanguage: raw.defaultLanguage as "en" | "nl" | "tr",
    quietEnabled: raw.quietEnabled,
    quietStart: Number(raw.quietStart),
    quietEnd: Number(raw.quietEnd),
    version: Number(raw.version),
    key: uuid(raw.key),
  };
}
