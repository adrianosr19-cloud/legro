import { createFileRoute } from "@tanstack/react-router";
import { RoomSession } from "@/components/legro/room-session";

export const Route = createFileRoute("/sala/$code")({
  component: function SalaPage() {
    const { code } = Route.useParams();
    return <RoomSession code={code} />;
  },
});
