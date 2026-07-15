"use client";

import { SectionScaffold } from "@/components/SectionScaffold";
import { SECTION_BY_ID } from "@/lib/sections";

export default function LandingPage() {
  return <SectionScaffold section={SECTION_BY_ID.get("landing")!} />;
}
