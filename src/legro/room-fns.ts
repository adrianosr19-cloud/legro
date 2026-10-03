import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ChairSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
const CodeSchema = z.string().regex(/^[A-HJ-NP-Z2-9]{8}$/);
const SecretSchema = z.string().min(16).max(128);
const IdSchema = z.string().min(8).max(80);
const PieceSchema = z.string().min(1).max(40);
const PoseSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  z: z.number().int(),
  yaw: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
});
const IntentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pegar"), instanceId: PieceSchema }),
  z.object({ type: z.literal("devolver"), instanceId: PieceSchema }),
  z.object({ type: z.literal("desmontar"), instanceId: PieceSchema }),
  z.object({ type: z.literal("encaixar"), instanceId: PieceSchema, pose: PoseSchema }),
]);

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new Error("Pedido inválido.");
  return result.data;
}

async function api() {
  const { roomApi } = await import("./room-api.server.ts");
  return roomApi();
}

export const createSala = createServerFn({ method: "POST" })
  .validator((data: unknown) => parse(z.object({ chair: ChairSchema }), data))
  .handler(async ({ data }) => {
    const svc = await api();
    return svc.create(data.chair);
  });

export const requestSeat = createServerFn({ method: "POST" })
  .validator((data: unknown) => parse(z.object({ code: CodeSchema, chair: ChairSchema }), data))
  .handler(async ({ data }) => {
    const svc = await api();
    return svc.requestJoin(data.code, data.chair);
  });

export const pollSeat = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    parse(z.object({ code: CodeSchema, requestId: IdSchema, requestSecret: SecretSchema }), data),
  )
  .handler(async ({ data }) => {
    const svc = await api();
    return svc.pollJoin(data.code, data.requestId, data.requestSecret);
  });

export const readSala = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    parse(
      z.object({
        code: CodeSchema,
        seatToken: SecretSchema.nullable(),
        hostSecret: SecretSchema.nullable(),
      }),
      data,
    ),
  )
  .handler(async ({ data }) => {
    const svc = await api();
    return svc.read(data.code, data.seatToken, data.hostSecret);
  });

export const answerSeat = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    parse(
      z.object({
        code: CodeSchema,
        hostSecret: SecretSchema,
        requestId: IdSchema,
        accept: z.boolean(),
      }),
      data,
    ),
  )
  .handler(async ({ data }) => {
    const svc = await api();
    return svc.answer(data.code, data.hostSecret, data.requestId, data.accept);
  });

export const startSala = createServerFn({ method: "POST" })
  .validator((data: unknown) => parse(z.object({ code: CodeSchema, hostSecret: SecretSchema }), data))
  .handler(async ({ data }) => {
    const svc = await api();
    return svc.start(data.code, data.hostSecret);
  });

export const sendIntent = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    parse(
      z.object({
        code: CodeSchema,
        seatToken: SecretSchema,
        baseRevision: z.number().int().nonnegative(),
        intent: IntentSchema,
      }),
      data,
    ),
  )
  .handler(async ({ data }) => {
    const svc = await api();
    return svc.intent(data.code, data.seatToken, {
      baseRevision: data.baseRevision,
      intent: data.intent,
    });
  });

export const askLoan = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    parse(
      z.object({
        code: CodeSchema,
        seatToken: SecretSchema,
        pieceId: PieceSchema,
        expectedHolder: ChairSchema,
      }),
      data,
    ),
  )
  .handler(async ({ data }) => {
    const svc = await api();
    return svc.requestLoan(data.code, data.seatToken, data.pieceId, data.expectedHolder);
  });

export const answerLoan = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    parse(
      z.object({
        code: CodeSchema,
        seatToken: SecretSchema,
        loanId: IdSchema,
        accept: z.boolean(),
      }),
      data,
    ),
  )
  .handler(async ({ data }) => {
    const svc = await api();
    return svc.answerLoan(data.code, data.seatToken, data.loanId, data.accept);
  });

export const returnLoan = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    parse(z.object({ code: CodeSchema, seatToken: SecretSchema, pieceId: PieceSchema }), data),
  )
  .handler(async ({ data }) => {
    const svc = await api();
    return svc.returnLoan(data.code, data.seatToken, data.pieceId);
  });
