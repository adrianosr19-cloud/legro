import { getSql } from "@/lib/db";
import { createSqlRoomRepo } from "./room-repo.ts";
import { createRoomService } from "./room-service.ts";

/** Só o servidor abre o documento. O navegador não recebe o repositório. */
export async function roomApi() {
  const sql = await getSql();
  return createRoomService(createSqlRoomRepo(sql), () => Date.now());
}
