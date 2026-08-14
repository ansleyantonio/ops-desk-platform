# UX / UI Implementation Checklist

Targeting the project tracker app in `src/routes` and `src/components`.

## 1. Visual System

- [ ] Keep the layout airy with generous spacing and clear grouping.
- [ ] Use soft rounded cards and elevated surfaces for primary content.
- [ ] Reserve color for meaning: status, priority, warnings, and actions.
- [ ] Standardize surface depth across cards, dialogs, sheets, and panels.
- [ ] Tune empty states to feel intentional, helpful, and on-brand.

## 2. Theme

- [ ] Support light mode and dark mode at launch.
- [ ] Make theme tokens live in the global stylesheet so the whole app shares one system.
- [ ] Verify contrast in both themes for text, borders, chips, and interactive states.

## 3. App Shell

- [ ] Add a persistent left sidebar for primary navigation.
- [ ] Add a contextual top bar for page title, filters, and primary actions.
- [ ] Keep the shell visible across the app without full-page transitions.
- [ ] Make the shell collapse gracefully on smaller screens.

## 4. Command Palette

- [ ] Add `⌘K` command palette access everywhere.
- [ ] Include common actions: new project, search projects, toggle density, go to key views.
- [ ] Ensure the palette is keyboard-first and accessible.

## 5. Interaction Quality

- [ ] Use optimistic updates for create, edit, delete, and status changes.
- [ ] Keep interactions responsive with sub-100ms feedback where possible.
- [ ] Avoid full-page reloads for common actions.
- [ ] Show skeleton loaders for asynchronous or deferred content.
- [ ] Add clear loading, saving, and error affordances.

## 6. Density

- [ ] Add a density toggle with `comfortable` and `compact` modes.
- [ ] Make density affect spacing, list rows, cards, and tables consistently.
- [ ] Persist the user’s density preference locally.

## 7. Mobile Responsiveness

- [ ] Make the dashboard usable on phones and tablets without layout breakage.
- [ ] Prioritize requesters and quick triage flows on small screens.
- [ ] Ensure side panels, dialogs, and tables adapt to narrow widths.

## 8. Accessibility

- [ ] Meet WCAG 2.1 AA expectations for contrast and focus visibility.
- [ ] Verify keyboard navigation across sidebar, dialog, sheet, palette, tabs, and inputs.
- [ ] Add ARIA labels where icons or non-obvious controls need them.
- [ ] Preserve focus order and restore focus after overlays close.
- [ ] Confirm screen-reader labels for destructive actions and state chips.

## 9. Empty States

- [ ] Design empty states for no projects, no search results, no risks, and no timeline data.
- [ ] Include a useful next action in each empty state.
- [ ] Keep empty states visually aligned with the main card system.

## 10. Suggested Build Order

- [ ] 1. Finish the app shell and theme tokens.
- [ ] 2. Add density + command palette plumbing.
- [ ] 3. Refine cards, dialogs, sheets, and tables.
- [ ] 4. Add skeleton loaders and optimistic flows.
- [ ] 5. Audit mobile behavior and accessibility.
- [ ] 6. Polish empty states and microcopy.

## Notes

- Current design work lives in:
  - `src/styles.css`
  - `src/routes/__root.tsx`
  - `src/routes/index.tsx`
  - `src/components/tracker/*`
  - `src/components/ui/*`
- This checklist can be updated as each requirement is implemented.
