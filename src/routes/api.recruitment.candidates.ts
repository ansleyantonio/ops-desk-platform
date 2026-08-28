import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const phaseSchema = z.enum(["initial_recruitment", "test_sent", "final_interview", "offer_made", "offer_refused", "rejected"]);
const payloadSchema = z.object({
  name: z.string().min(1).max(160),
  email: z.string().email(),
  position: z.string().max(160).optional(),
  phase: phaseSchema.optional(),
  githubUrl: z.string().url().refine((value) => new URL(value).hostname === "github.com", "Must be a github.com URL").optional(),
  testSubmittedAt: z.union([z.string(), z.number()]).optional(),
  review: z.object({
    totalScore: z.number().min(0).max(100),
    scores: z.record(z.number()).optional(),
    summary: z.string().optional(),
    recommendation: z.string().optional(),
    findings: z.array(z.object({ severity: z.string().optional(), file: z.string().optional(), line: z.number().int().positive().optional(), summary: z.string().min(1) })).optional(),
    reviewedAt: z.union([z.string(), z.number()]).optional(),
  }).optional(),
});

export const Route = createFileRoute("/api/recruitment/candidates")({
  server: { handlers: { POST: async ({ request }) => {
    const configuredToken = process.env.RECRUITMENT_API_TOKEN;
    const suppliedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!configuredToken || suppliedToken !== configuredToken) return Response.json({ error: "Unauthorized" }, { status: 401 });
    try {
      const payload = payloadSchema.parse(await request.json());
      const { upsertRecruitmentReview } = await import("@/lib/recruitment-api.server");
      const candidate = await upsertRecruitmentReview(payload);
      return Response.json({ ok: true, candidate }, { status: 200 });
    } catch (error) {
      if (error instanceof z.ZodError) return Response.json({ error: "Invalid payload", issues: error.issues }, { status: 400 });
      console.error("Recruitment API failed", error);
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  } } },
});
