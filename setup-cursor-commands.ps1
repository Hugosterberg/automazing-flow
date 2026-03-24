function Write-Utf8NoBomFile($Path, $Content) {
    $fullPath = Join-Path (Get-Location) $Path
    $dir = Split-Path -Parent $fullPath

    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($fullPath, $Content.TrimStart(), $utf8NoBom)
}

Write-Host "Creating Cursor custom commands..." -ForegroundColor Cyan

Write-Utf8NoBomFile ".cursor\commands\repo-audit.md" @"
Analyze this repository before suggesting any major change.

Goals:
- identify the current architecture and coding patterns
- identify where UI logic, business logic, integration logic, automation logic, and analytics logic currently live
- identify the top 5 files or modules with the highest refactor value
- explain risks and technical debt hotspots
- propose an incremental refactor plan in phases

Important constraints:
- do not change code yet
- preserve the current architecture unless a change is clearly justified
- prefer minimal safe diffs
- avoid proposing a full rewrite
- respect AGENTS.md and existing project rules

Output format:
1. current architecture summary
2. top 5 refactor targets
3. risks
4. phased plan
"@

Write-Utf8NoBomFile ".cursor\commands\refactor-file.md" @"
Review the currently focused file and refactor it safely.

Goals:
- preserve current behavior
- identify the responsibilities inside the file
- extract only what is clearly worth extracting
- reduce complexity
- improve naming and readability
- avoid over-engineering

Important constraints:
- keep diffs small and reviewable
- do not introduce a whole new architecture
- do not rename or move many files unless clearly justified
- reuse existing patterns in the repo
- respect AGENTS.md and existing project rules

Before changing code:
- briefly explain what should stay in the file
- briefly explain what should be extracted
- then implement the smallest safe refactor

After changing code:
- summarize what changed
- mention any risks or follow-up suggestions
"@

Write-Utf8NoBomFile ".cursor\commands\migrate-to-typescript.md" @"
Migrate the current file or selected files from JavaScript to TypeScript safely.

Goals:
- preserve behavior
- choose .ts vs .tsx correctly
- improve type safety without over-engineering
- update imports and references carefully

Important constraints:
- do not rewrite logic unnecessarily
- add useful types where they improve clarity
- avoid overly complex typing
- preserve API contracts and current behavior
- respect AGENTS.md and existing project rules

Execution steps:
1. explain what the file currently does
2. determine whether it should be .ts or .tsx
3. migrate it incrementally
4. fix imports and references
5. summarize what changed
6. explain anything that should remain .js temporarily and why
"@

Write-Utf8NoBomFile ".cursor\commands\clean-integrations.md" @"
Improve integration boundaries in the current area of the codebase.

Goals:
- isolate provider-specific logic
- reduce API-specific logic inside UI files
- normalize external responses where useful
- preserve current behavior

Important constraints:
- do not spread provider-specific logic further
- prefer dedicated helpers, services, or adapter modules
- handle failures, retries, and partial success cases explicitly
- do not hardcode secrets, tokens, or account identifiers
- keep changes incremental and reviewable
- respect AGENTS.md and existing project rules

Before changing code:
- explain what is provider-specific versus app-specific
- explain what should be extracted

Then:
- implement the smallest safe refactor
- summarize what changed
"@

Write-Utf8NoBomFile ".cursor\commands\safe-cleanup.md" @"
Clean up the current file or selected area safely.

Goals:
- remove dead code only if clearly verified unused
- reduce duplication
- improve naming and clarity
- simplify without changing behavior

Important constraints:
- verify references before deleting anything
- do not remove anything uncertain without explaining it first
- preserve behavior
- keep changes minimal and reviewable
- respect AGENTS.md and existing project rules

Before changing code:
- list what appears unused, duplicated, or unnecessarily complex
- identify anything risky

Then:
- perform the safe cleanup
- summarize what was removed or improved
- mention anything intentionally left alone
"@

Write-Host "Done. Cursor commands created successfully." -ForegroundColor Green
Write-Host ""
Write-Host "Created files:" -ForegroundColor Yellow
Write-Host " - .cursor\commands\repo-audit.md"
Write-Host " - .cursor\commands\refactor-file.md"
Write-Host " - .cursor\commands\migrate-to-typescript.md"
Write-Host " - .cursor\commands\clean-integrations.md"
Write-Host " - .cursor\commands\safe-cleanup.md"
Write-Host ""
Write-Host "You can now use them in Cursor with:" -ForegroundColor Cyan
Write-Host " /repo-audit"
Write-Host " /refactor-file"
Write-Host " /migrate-to-typescript"
Write-Host " /clean-integrations"
Write-Host " /safe-cleanup"