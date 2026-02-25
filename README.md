# automazing flow

Automazing Flow is a modular automation workspace for creators and teams.  
The current app includes social media management, content planning, calendar automation, and account-level AI analysis.

## What you can automate right now

### Social media
- Connect Instagram, TikTok, and YouTube accounts through OAuth.
- Analyze account content with AI-powered profile summaries.
- Generate AI image variants for visual experiments.
- Track core social KPIs in a unified dashboard.
- Schedule social posts manually.

### Content creation (newly expanded)
- Activate predefined **social/content automation workflows** directly in the Social Media page.
- Save workflow selections in local storage so your setup persists.
- Generate an **automated weekly execution plan** and send it to the built-in Calendar module with one click.
- Use a structured content pipeline (Research -> Production -> Distribution -> Follow-up) as an automation framework.

## Social/content automations added in this update

The Social Media page now includes workflow templates you can toggle on/off:

1. **Repurpose weekly hero content**  
   Turn one long-form asset into short-form variants for multiple platforms.
2. **Caption + hashtag optimizer**  
   Generate platform-ready copy options and hashtag packs.
3. **Engagement follow-up workflow**  
   Surface high-intent comments/questions and route follow-up tasks.
4. **Weekly insight digest**  
   Build a recurring performance summary and next-week test plan.

## Future plans

### Short term
- Direct publishing integrations (Instagram/TikTok/YouTube) for true auto-posting.
- Saved automation templates per profile/team.
- Better AI suggestions for posting time and content format.

### Mid term
- Cross-platform campaign builder (single plan -> multi-channel output).
- Automatic A/B testing for captions/hooks/thumbnails.
- Team collaboration workflows (approval gates, role-based task routing).

### Long term
- End-to-end autonomous campaigns with budget goals and KPI targets.
- Unified attribution across Social + Mail + E-commerce modules.
- Predictive content scoring before publication.

## Local development

### Requirements
- Node.js 18+
- npm

### Setup
```bash
npm install
npm run dev
```

### Useful scripts
```bash
npm run dev         # frontend dev server
npm run dev:server  # backend OAuth/API server
npm run build       # production build
npm run test        # vitest tests
npm run lint        # eslint
```

## Tech stack

- Vite
- React + TypeScript
- Tailwind CSS
- shadcn/ui
- Framer Motion
- Express (OAuth + integration endpoints)
