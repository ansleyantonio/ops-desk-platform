import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/recruitment/instructions")({
  server: { handlers: { GET: async ({ request }) => {
    try {
      const { requirePermission } = await import("@/lib/auth.server");
      await requirePermission("teams:manage");
    } catch {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const token = process.env.RECRUITMENT_API_TOKEN;
    if (!token) return Response.json({ error: "Recruitment API is not configured" }, { status: 503 });
    const endpoint = new URL("/api/recruitment/candidates", request.url).toString();
    const text = `OPSDESK RECRUITMENT — CODEX REVIEW SUBMISSION INSTRUCTIONS
================================================================

PURPOSE
After reviewing a candidate's submitted code locally, send the candidate identity,
GitHub repository, test-submission time, score breakdown, review summary, recommendation,
and actionable findings to OpsDesk Recruitment.

ENDPOINT
Method: POST
URL: ${endpoint}
Content-Type: application/json
Authorization: Bearer ${token}

SECURITY
- Treat the bearer token above as a password.
- Do not commit this file or token to Git, paste it into candidate repositories, or include it in logs.
- Do not send source code, secrets, environment files, credentials, protected personal data, or unrelated GitHub profile data.
- Submit only assessment results needed for recruitment.
- The automated score assists a human reviewer; it must not make the final hiring decision.

IDENTITY AND UPDATE RULES
- "name" and "email" are required.
- Email is the stable candidate identifier. Posting the same email updates the existing candidate.
- A new email creates a new candidate.
- If review data is supplied and phase is omitted, OpsDesk moves the candidate to final_interview.
- Dates may be ISO 8601 strings or Unix timestamps in milliseconds. Prefer ISO 8601 UTC.
- githubUrl must be a complete https://github.com/... URL.
- totalScore must be between 0 and 100.

VALID PHASES
- initial_recruitment
- test_sent
- final_interview
- offer_made
- offer_refused
- rejected

JSON PAYLOAD
{
  "name": "Jane Candidate",
  "email": "jane@example.com",
  "position": "Software Engineer",
  "phase": "final_interview",
  "githubUrl": "https://github.com/example/submission",
  "testSubmittedAt": "2026-08-22T10:30:00Z",
  "review": {
    "totalScore": 86,
    "scores": {
      "requirements": 23,
      "correctness": 22,
      "codeQuality": 17,
      "testing": 13,
      "security": 7,
      "documentation": 4
    },
    "summary": "Strong implementation with good test coverage.",
    "recommendation": "Proceed to technical interview",
    "reviewedAt": "2026-08-22T12:00:00Z",
    "findings": [
      {
        "severity": "medium",
        "file": "src/auth.ts",
        "line": 42,
        "summary": "Token expiry is not validated."
      }
    ]
  }
}

FIELD DETAILS
- name: string, 1-160 characters, required.
- email: valid email address, required; used to create/update the candidate.
- position: string, maximum 160 characters, optional.
- phase: one of the four values above, optional.
- githubUrl: valid github.com URL, optional.
- testSubmittedAt: ISO 8601 string or Unix-millisecond number, optional.
- review.totalScore: number from 0 through 100, required when review is included.
- review.scores: object of rubric-name to numeric score, optional. Use consistent rubric names.
- review.summary: concise evidence-based review overview, optional.
- review.recommendation: concise next-step recommendation for human approval, optional.
- review.reviewedAt: ISO 8601 string or Unix-millisecond number, optional; defaults to receipt time.
- review.findings: array, optional.
- finding.severity: string such as critical, high, medium, low, or info.
- finding.file: repository-relative path; never send a local absolute path.
- finding.line: positive integer, optional.
- finding.summary: specific evidence-based finding, required.

CODEX WORKFLOW
1. Review only the candidate submission and the supplied assessment brief/rubric.
2. Run deterministic tests where safe and record the actual results.
3. Separate observed facts from inferences; do not invent passing tests or file references.
4. Calculate totalScore consistently from the agreed rubric.
5. Produce concise findings with repository-relative file and line references when available.
6. Keep the recommendation subject to human review.
7. POST the JSON payload to OpsDesk.
8. Require an HTTP 200 response with {"ok":true}; otherwise report the error and do not claim submission succeeded.
9. For timeouts or HTTP 5xx, retry up to 3 times with a short delay. Do not retry HTTP 400 or 401 until the payload/token is corrected.

CURL EXAMPLE
curl --fail-with-body -X POST '${endpoint}' \\
  -H 'Authorization: Bearer ${token}' \\
  -H 'Content-Type: application/json' \\
  --data @candidate-review.json

PYTHON EXAMPLE (STANDARD LIBRARY)
import json
import urllib.request

endpoint = ${JSON.stringify(endpoint)}
token = ${JSON.stringify(token)}
with open("candidate-review.json", "rb") as payload:
    request = urllib.request.Request(
        endpoint,
        data=payload.read(),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
with urllib.request.urlopen(request, timeout=30) as response:
    result = json.load(response)
    if response.status != 200 or not result.get("ok"):
        raise RuntimeError(f"OpsDesk rejected submission: {result}")
    print("Submitted candidate:", result["candidate"])

RESPONSES
- 200: accepted; response contains {"ok":true,"candidate":{...}}.
- 400: invalid JSON or validation failure; inspect the returned issues and correct the payload.
- 401: missing or incorrect bearer token.
- 500: server/database failure; retain the local review and retry later.

FINAL CHECKLIST
- Candidate email is correct.
- GitHub URL points to the reviewed repository.
- Scores add up according to the agreed rubric and totalScore is 0-100.
- Findings cite real files/lines and contain no secrets.
- Date values include a timezone.
- OpsDesk returned HTTP 200 and ok=true.
`;
    return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": 'attachment; filename="opsdesk-codex-recruitment-instructions.txt"', "Cache-Control": "no-store" } });
  } } },
});
