"use client";

import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Segmented } from "@/components/segmented";

/**
 * Chat and Learn sit under one Coach tab. They stay separate routes (the chat is a heavy screen),
 * and this switch under each header moves between them.
 */
export function CoachTabs({ active }: { active: "chat" | "learn" }) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Segmented
      label={t("coach.sections")}
      value={active}
      className="mb-4"
      onSelect={(next) => {
        if (next !== active) router.replace(next === "learn" ? "/learn" : "/coach");
      }}
      options={[
        { value: "chat", label: t("coach.tab_chat") },
        { value: "learn", label: t("nav.learn") },
      ]}
    />
  );
}
