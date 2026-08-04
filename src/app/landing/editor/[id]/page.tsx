"use client";

import { useParams } from "next/navigation";

import { LandingEditor } from "@/components/LandingEditor";

export default function LandingEditorPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";
  return <LandingEditor id={id} />;
}
