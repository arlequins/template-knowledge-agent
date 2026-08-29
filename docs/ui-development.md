# UI Development

The shared `@arlequins/ui` package provides three feedback loops:

- React Testing Library and Vitest for component behavior.
- Storybook for isolated visual development and accessibility checks.
- The application end-to-end suite for complete browser workflows.

## Commands

```bash
pnpm --filter @arlequins/ui test
pnpm storybook
pnpm storybook:build
```

Write tests around accessible roles and user-visible behavior. Keep stories next
to components as `*.stories.tsx`, and include representative states such as
disabled, destructive, loading, and validation states when applicable.

The Storybook accessibility addon reports violations while developing and the
static Storybook build is required by CI. A successful build confirms that every
story can be bundled independently from the Next.js application.

## Visual and browser validation

The browser suite covers the standalone chat, embedded-chat handoff, OIDC
callback, sign-out, and accessibility behavior at desktop and mobile
viewports. Update snapshots only after reviewing both viewport classes:

```bash
pnpm test:e2e -- --update-snapshots
```

The reference chat keeps the interaction model familiar to ChatGPT and
Gemini: `Enter` submits, `Ctrl+Enter` or `Cmd+Enter` inserts a newline, and
the transcript follows the newest message while a streamed response arrives.
Conversation titles can be renamed or archived from the header. The first
question automatically becomes a short title when a conversation still has a
default title, and the sidebar provides a bounded, client-side title search for
long conversation lists. Assistant
messages render a deliberately small, safe Markdown subset (emphasis and
inline code) without injecting HTML; add a full Markdown renderer in a derived
application only after reviewing link, image, and raw-HTML policies.

Product-specific dashboards, lists, and administration screens belong in the
derived repository. Add their stories and end-to-end cases next to the feature
slice that owns them.
