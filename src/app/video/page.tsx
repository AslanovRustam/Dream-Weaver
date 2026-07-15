"use client";

import { SectionScaffold } from "@/components/SectionScaffold";
import { SECTION_BY_ID } from "@/lib/sections";

export default function VideoPage() {
  return <SectionScaffold section={SECTION_BY_ID.get("video")!} />;
}
