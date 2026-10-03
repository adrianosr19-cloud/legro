import type { RoomDoc } from "./room-service.ts";

export class RoomCodeTaken extends Error {
  constructor() {
    super("code-taken");
    this.name = "RoomCodeTaken";
  }
}

export type Queryable = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

export type RoomRepo = {
  read(code: string): Promise<{ revision: number; doc: RoomDoc } | null>;
  insert(doc: RoomDoc): Promise<void>;
  /** Uma frase só. Se a revisão mudou, não escreve. */
  compareAndSwap(code: string, expectedRevision: number, doc: RoomDoc): Promise<boolean>;
};

function parseDoc(value: unknown): RoomDoc {
  if (typeof value === "string") return JSON.parse(value) as RoomDoc;
  return value as RoomDoc;
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = "code" in err ? String(err.code) : "";
  const message = "message" in err ? String(err.message) : "";
  return code === "23505" || message.toLowerCase().includes("duplicate") || message.includes("unique");
}

export function createSqlRoomRepo(sql: Queryable): RoomRepo {
  return {
    async read(code) {
      const rows = await sql.query<{ revision: number; document: unknown }>(
        "select revision, document from legro_rooms where code = $1",
        [code],
      );
      const row = rows[0];
      if (!row) return null;
      const doc = structuredClone(parseDoc(row.document));
      doc.roomRevision = row.revision;
      return { revision: row.revision, doc };
    },
    async insert(doc) {
      try {
        await sql.query(
          "insert into legro_rooms (code, revision, document) values ($1, $2, $3::jsonb)",
          [doc.code, doc.roomRevision, JSON.stringify(doc)],
        );
      } catch (err) {
        if (isUniqueViolation(err)) throw new RoomCodeTaken();
        throw err;
      }
    },
    async compareAndSwap(code, expectedRevision, doc) {
      const rows = await sql.query<{ revision: number }>(
        `update legro_rooms
            set revision = $1, document = $2::jsonb, updated_at = now()
          where code = $3 and revision = $4
          returning revision`,
        [doc.roomRevision, JSON.stringify(doc), code, expectedRevision],
      );
      return rows.length === 1;
    },
  };
}
