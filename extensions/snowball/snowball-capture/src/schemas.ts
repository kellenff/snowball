import { z } from "zod";

export const MadrCaptureInput = z.object({
  question: z.string().min(1).max(2000),
  options: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().min(1).max(2000),
      }),
    )
    .min(2)
    .max(8),
  chosen: z.string().min(1).max(200),
  context: z.string().max(5000).optional(),
  tags: z.array(z.string().min(1).max(50)).max(10).optional(),
});
export type MadrCaptureInput = z.infer<typeof MadrCaptureInput>;

export const ApprovalPhraseRecordInput = z.object({
  phrase: z.string().min(1).max(2000),
  action: z.string().min(1).max(5000),
  context: z.string().max(5000).optional(),
});
export type ApprovalPhraseRecordInput = z.infer<typeof ApprovalPhraseRecordInput>;

export const ObservationType = z.enum([
  "observation",
  "implementation-choice",
  "hypothesis",
  "constraint",
]);
export const ObservationConfidence = z.enum(["high", "medium", "low"]);

export const ObservationLogInput = z.object({
  content: z.string().min(1).max(5000),
  type: ObservationType,
  confidence: ObservationConfidence,
  rationale: z.string().min(1).max(5000),
  related_files: z.array(z.string().min(1).max(500)).max(50).optional(),
  tags: z.array(z.string().min(1).max(50)).max(10).optional(),
  // Optional overrides (rarely needed; defaults set by the tool)
  session_id: z.string().uuid().optional(),
  timestamp: z.string().datetime().optional(),
});
export type ObservationLogInput = z.infer<typeof ObservationLogInput>;
