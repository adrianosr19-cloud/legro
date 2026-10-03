import { CompareSession } from "@/components/legro/compare-session";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/comparar")({
  component: CompareSession,
});
