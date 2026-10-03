import { createFileRoute } from "@tanstack/react-router";
import { LabSession } from "@/components/legro/lab-session";

export const Route = createFileRoute("/laboratorio")({ component: LabSession });
