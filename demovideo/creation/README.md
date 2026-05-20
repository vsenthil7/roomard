# creation/

Records the captioned Roomard walkthrough using the isolated Playwright runner.

```powershell
pwsh ./demovideo/creation/run-creation.ps1
```

Steps: (1) pre-flight the `roomard-*` containers, (2) run
`.runner/specs/full-walkthrough.spec.ts` against the live UI on :8180,
(3) transcode the recorded webm -> mp4 and archive both into `demo/`, writing a
pointer to `results/creation/latest.txt` for verification-b.

No per-run seed step: the demo tenant is provisioned once via the db CLI
(see the top-level `demovideo/README.md`). The recording is idempotent against
seeded data.

Requires the isolated runner (first time):

```powershell
cd demovideo/.runner
npm install
.\node_modules\.bin\playwright.cmd install chromium
```
