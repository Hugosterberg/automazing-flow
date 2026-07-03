# PR: Expand social media + content automation workflows

## Suggested title
`feat(social): add actionable social/content automation workflows and weekly plan generation`

## Summary
This PR upgrades the Social Media module from mostly static guidance to actionable workflow automation.

### What was added
- A new **Automation Workflows** section in `src/pages/SocialMedia.tsx`.
- Toggleable automation playbooks for:
  - weekly content repurposing
  - caption/hashtag optimization
  - engagement follow-up
  - weekly insights digest
- Workflow state persistence via local storage (`automazing-social-workflows`).
- One-click **"Skapa automationsvecka"** action that writes automated tasks to Calendar storage (`automazing-calendar-events`).
- A visual **content pipeline framework** (Research -> Production -> Distribution -> Follow-up).
- A rewritten `README.md` with real project documentation and roadmap.

## Why
- Helps users quickly identify what they can automate in social/content operations.
- Bridges strategy and execution by converting selected workflows into calendar tasks.
- Adds practical guidance for scaling content production with less manual coordination.

## Validation checklist
- [ ] App loads and Social Media page renders.
- [ ] Workflow toggles persist after page refresh.
- [ ] "Skapa automationsvecka" creates automated tasks visible in Calendar.
- [ ] Existing account analysis and image variant generation still function.
- [ ] Build completes successfully.

## Future plans
### Short term
- Native platform publishing (Instagram/TikTok/YouTube).
- Per-profile saved workflow templates.
- AI recommendations for best post timing and format.

### Mid term
- Campaign-level planner for multi-channel rollouts.
- Automated A/B testing for hooks, captions, and thumbnails.
- Team workflows with approval steps.

### Long term
- KPI-goal-driven autonomous campaign loops.
- Cross-module attribution (Social + Mail + E-commerce).
- Predictive performance scoring before publishing.
