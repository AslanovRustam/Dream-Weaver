"use client";

import { SectionScaffold } from "@/components/SectionScaffold";
import { SECTION_BY_ID } from "@/lib/sections";

export default function PlayablePage() {
  return <SectionScaffold section={SECTION_BY_ID.get("playable")!} />;
}
