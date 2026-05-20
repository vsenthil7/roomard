# verification-a/ - structural review

Re-runs the demo flow as **24 hard assertions** against the live API gateway
on `:3100`. No video frames are inspected here - this is logic-level checking.
If every assertion passes, the recording shows the right states by construction.

```powershell
pwsh ./demovideo/verification-a/run-verify-a.ps1
#  -> reports/structural-review-{stamp}.txt
```

## The 24 assertions (5 stages)

| Stage | Asserts |
|---|---|
| 0 - pre-flight + sign in | gateway `/health` ok; `/v1/auth/password/login` 200 with `access_token`; principal carries a tenant (A0.1-A0.6) |
| 1 - daily brief (UC-07) | `/v1/auth/me` authorised; `/v1/properties` returns >=1; `briefs/today` reachable + authorised (A1.1-A1.6) |
| 2 - guest lookup (UC-08/11) | `/v1/guests` returns >=1; single guest 200; preferences reachable; **`/v1/guests/:id/trajectory` exists** (A2.1-A2.6) |
| 3 - card capture (UC-01) | capture read authorised for admin; **unauthenticated capture write -> 401** (negative control) (A3.1-A3.3) |
| 4 - exceptions + audit (UC-23/09) | `/v1/exceptions` list 200; prep-cards reachable; `/v1/audit/events` list 200; **audit export -> 401 (MFA step-up required)** (A4.1-A4.8) |

The negative controls (A3.3 capture-write-without-token, A4.7 audit-export-without-MFA)
are genuinely-true refusals - they prove the access controls the video narrates
are enforced at the edge, not just claimed.

Run order: the spec is copied into `.runner/specs/` so it resolves
`@playwright/test`, then executed with `API_BASE_URL=http://localhost:3100`.
