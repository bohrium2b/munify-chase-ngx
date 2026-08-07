# Plan: Editable Proposers & Seconders for Resolutions & Amendments

## Goal

Allow chairs to edit proposers and assign/edit seconders on both resolution papers and amendments. Provide a modern, reusable modal UI using only Font Awesome free icons.

---

## 1. Schema Changes

**File:** `src/api/db/schema.ts`

Add nullable `seconderCommitteeMemberId` columns:

- `resolution_paper`: `seconderCommitteeMemberId: text().references(() => committeeMember.id, { onDelete: 'set null' })`
- `amendment`: `seconderCommitteeMemberId: text().references(() => committeeMember.id, { onDelete: 'set null' })`

**Migration:** Generate via `bun run db:migrate` after editing the schema.

**File:** `src/api/db/relations.ts`

Add relations:

- `resolutionPaper.seconderCommitteeMember`: optional one-to-one to `committeeMember`
- `amendment.seconderCommitteeMember`: optional one-to-one to `committeeMember`

---

## 2. Backend Mutations

### 2a. Extend `updateResolutionPaper`

**File:** `src/api/handlers/resolutionPaper.ts`

Add optional args: `creatorCommitteeMemberId: t.arg.id()`, `seconderCommitteeMemberId: t.arg.id()`.

In the resolver, before the existing meta-update block (around line 222):

- If either arg is passed, verify the caller is a chair (`isTeamInConference`); otherwise throw `GraphQLError`.
- Validate each provided `committeeMemberId` exists in the paper's committee.
- Add the fields to the `metaUpdate` object so they are persisted together with `title`/`documentNumber`.

```ts
const metaUpdate: Partial<typeof schema.resolutionPaper.$inferInsert> = {};
if (args.title != null) metaUpdate.title = args.title;
if (args.documentNumber != null) metaUpdate.documentNumber = args.documentNumber;
if (args.creatorCommitteeMemberId != null) {
	metaUpdate.creatorCommitteeMemberId = args.creatorCommitteeMemberId;
}
if (args.seconderCommitteeMemberId != null) {
	metaUpdate.seconderCommitteeMemberId = args.seconderCommitteeMemberId;
}
if (Object.keys(metaUpdate).length > 0) {
	await db.update(schema.resolutionPaper).set(metaUpdate).where(updateFilter.sql.where);
}
```

**Security note:** The existing `updateResolutionPaper` ability also allows non-chair paper authors to update WORKING_PAPERs. The resolver must explicitly gate `creatorCommitteeMemberId` and `seconderCommitteeMemberId` to chairs only, otherwise a paper author could escalate privileges by passing those args.

### 2b. Add `updateAmendment` mutation

**File:** `src/api/handlers/amendment.ts`

New mutation:

```ts
updateAmendment: t.drizzleField({
	type: ref,
	args: {
		id: t.arg.id({ required: true }),
		proposerCommitteeMemberId: t.arg.id(),
		seconderCommitteeMemberId: t.arg.id(),
		newContent: t.arg.string(),
		targetClauseId: t.arg.string(),
		targetOperativeIndex: t.arg.int(),
		targetPosition: t.arg.int()
	},
	resolve: async (query, _root, args, ctx) => {
		// 1. Load amendment + paper + committee.
		// 2. If proposer/seconder args present: require chair.
		// 3. If content/target args present and caller is not chair:
		//      require status === 'PENDING' && isAmendmentProposer(ctx).
		// 4. Validate member belongs to same committee.
		// 5. Build partial update object and apply via eq(schema.amendment.id, args.id).
		// 6. pubsub.updated(args.id)
		// 7. Return updated amendment via read ability.
	}
});
```

This also fills the existing gap where PENDING proposers have no mutation to edit their amendment content/targets.

The existing `abilityBuilder.amendment.allow(['update', 'delete'])` already covers chairs and PENDING proposers; the resolver enforces field-level gating.

**GraphQL client note:** The `src/lib/api/rumbleClient/schema.ts` and `client.ts` files are auto-generated from handler definitions. After adding the new mutation, they will be regenerated automatically at build/startup. Do not edit them manually.

**Sponsor table note:** Changing `proposerCommitteeMemberId` does NOT automatically update the `amendmentSponsor` join table. The proposer and sponsors are conceptually separate. The chair can add/remove sponsors separately via existing `addAmendmentSponsor` / `removeAmendmentSponsor` mutations. The same applies to `paperSponsor` for papers.

---

## 3. Database Performance

### Schema

- Adding two nullable `text` FK columns with `onDelete: 'set null'` is O(1) in PostgreSQL 12+ (no table rewrite).
- PostgreSQL automatically creates an index on the FK column, so JOINs and updates are fast.
- No additional indexes or migrations beyond the column addition are needed.

### Query Performance

- The existing `papers` liveQuery already JOINs `committeeMember` for `creatorCommitteeMember`. Adding `seconderCommitteeMember` to the same query adds one more LEFT JOIN — negligible cost.
- The existing `amendments` liveQuery already JOINs `committeeMember` for `proposer`. Adding `seconderCommitteeMember` is the same.
- There is no N+1 risk because we are extending existing batched queries, not adding new per-item queries.

### Mutation Performance

- `updateResolutionPaper` and the new `updateAmendment` are single-row UPDATEs with indexed WHERE clauses (`id = ?`) — O(1).
- The meta-update block in `updateResolutionPaper` already batches `title`, `documentNumber`, and the new fields into one UPDATE statement.
- Pubsub notifications are async and do not block the mutation response.

### Client-Side Caching

- urql's `cacheExchange` normalizes and caches all GraphQL query results by query+variables.
- The extended `papers` and `amendments` liveQueries will cache `seconderCommitteeMember` alongside existing fields.
- The `committeeMembers` query used by the modal is cached after the first load; subsequent modal opens are instant (no re-fetch).
- The projector (`PresentationResolutionPreview.svelte`) queries its own `papers` and `amendments` independently; these are cached separately from `PaperPage.svelte` queries, which is correct because they are different queries.

### Pre-loading

- The projector page (`(presentation)/+page.svelte`) already pre-loads committee + paper data before mounting the preview component.
- `PresentationResolutionPreview.svelte` creates its own Y.js client and queries on mount; no additional pre-loading is needed.
- The modal does NOT pre-load `committeeMembers` — it loads them only when opened. This is acceptable because the query is small and cached after first use. If desired, `PaperPage.svelte` could pre-load them, but it's not required for perceived performance.

---

## 4. Frontend — Reusable Modal Component

**New file:** `src/lib/components/resolutions/EditProposerSeconderModal.svelte`

### Pattern

Use `<dialog class="modal" {open}>` (Pattern A, same as `AmendmentComposer.svelte`), with a `<form method="dialog" class="modal-backdrop">` for ESC/backdrop close.

### Props

```ts
interface Props {
	open: boolean;
	type: 'paper' | 'amendment';
	id: string;
	committeeId: string;
	currentProposer: {
		id: string;
		representation: { name: string; alpha2Code: string; faIcon?: string | null; type?: string };
	} | null;
	currentSeconder: {
		id: string;
		representation: { name: string; alpha2Code: string; faIcon?: string | null; type?: string };
	} | null;
	onClose: () => void;
}
```

### Behaviour

- Query `committeeMembers` for the committee (same Fuse.js + `getTranslatedCountryNameFromAlpha3Code` pattern as `AmendmentSponsorPanel.svelte`).
- Two `Combobox` pickers with clear buttons (chip pattern, same as `AmendmentComposer.svelte`):
  - **Proposer** (`fa-user` label): seeded from `currentProposer`. Chair can clear or pick another member.
  - **Seconder** (`fa-user-plus` label): seeded from `currentSeconder`. Chair can clear or pick another member.
- Inline validation: if proposer === seconder (and not null), show an error message below the seconder picker and disable save.
- Save button:
  - Paper → `client.mutate.updateResolutionPaper({ id, creatorCommitteeMemberId, seconderCommitteeMemberId })`
  - Amendment → `client.mutate.updateAmendment({ id, proposerCommitteeMemberId, seconderCommitteeMemberId })`
- Toast on success/error, close on success.

### Icons (FA free only)

- Proposer label: `fa-user`
- Seconder label: `fa-user-plus`
- Clear button: `fa-xmark`
- Spinner: `fa-spinner fa-spin`

---

## 5. Frontend — Integration Points

### 5a. `PaperPage.svelte`

**Display:** Show proposer and seconder as small chips in the header title area, between the title line and the agenda-item line (around line 806). Use `Flag` components for visual consistency with amendment cards.

```svelte
{#if paper.creatorCommitteeMember || paper.seconderCommitteeMember}
	<div class="flex items-center gap-2 text-xs">
		{#if paper.creatorCommitteeMember}
			<span class="badge badge-ghost gap-1">
				<Flag representation={paper.creatorCommitteeMember.representation} size="xs" />
				{getTranslatedCountryNameFromAlpha3Code(
					paper.creatorCommitteeMember.representation.alpha3Code
				) ?? paper.creatorCommitteeMember.representation.name}
			</span>
		{/if}
		{#if paper.seconderCommitteeMember}
			<span class="badge badge-ghost gap-1">
				<Flag representation={paper.seconderCommitteeMember.representation} size="xs" />
				{getTranslatedCountryNameFromAlpha3Code(
					paper.seconderCommitteeMember.representation.alpha3Code
				) ?? paper.seconderCommitteeMember.representation.name}
			</span>
		{/if}
	</div>
{/if}
```

**Edit button (chair-only):** In the header action area, right after the sponsors/details button (around line 900):

```svelte
{#if team}
	<button
		class="btn btn-ghost btn-sm"
		title={m.editProposerAndSeconder()}
		onclick={() => (proposerSeconderOpen = true)}
	>
		<i class="fas fa-user-pen"></i>
	</button>
{/if}
```

**State:**

```ts
let proposerSeconderOpen = $state(false);
```

**Modal:**

```svelte
{#if proposerSeconderOpen && paper && committee}
	<EditProposerSeconderModal
		bind:open={proposerSeconderOpen}
		type="paper"
		id={paper.id}
		committeeId={committee.id}
		currentProposer={paper.creatorCommitteeMember}
		currentSeconder={paper.seconderCommitteeMember}
		onClose={() => (proposerSeconderOpen = false)}
	/>
{/if}
```

**Live query:** In the `papers` query (line 106), add `faIcon` to `creatorCommitteeMember` and add `seconderCommitteeMember` with the same shape:

```ts
creatorCommitteeMember: {
  id: true,
  representation: { id: true, name: true, alpha3Code: true, faIcon: true }
},
seconderCommitteeMember: {
  id: true,
  representation: { id: true, name: true, alpha3Code: true, faIcon: true }
},
```

### 5b. `AmendmentList.svelte`

**Display:** In each amendment card, show the seconder next to the proposer (around line 498-520).

```svelte
<div class="text-base-content/70 mt-2 flex items-center gap-2 text-xs">
	<Flag representation={a.proposer?.representation} size="xs" />
	<span>
		{getTranslatedCountryNameFromAlpha3Code(a.proposer?.representation?.alpha3Code) ??
			a.proposer?.representation?.name ??
			m.unknown()}
	</span>
	{#if a.seconderCommitteeMember}
		<span class="text-base-content/30">·</span>
		<Flag representation={a.seconderCommitteeMember.representation} size="xs" />
		<span>
			{getTranslatedCountryNameFromAlpha3Code(
				a.seconderCommitteeMember.representation.alpha3Code
			) ??
				a.seconderCommitteeMember.representation.name ??
				m.unknown()}
		</span>
	{/if}
	<!-- existing sponsors dropdown button -->
</div>
```

**Edit button (chair-only):** In the card header's left group, before the type icon (around line 477):

```svelte
<div class="flex items-center gap-1.5">
	{#if team}
		<button
			class="btn btn-ghost btn-xs"
			title={m.editProposerAndSeconder()}
			onclick={() => (editProposerSeconderId = a.id)}
		>
			<i class="fas fa-user-pen text-xs"></i>
		</button>
	{/if}
	<span class="flex items-center gap-1.5 font-mono text-sm font-semibold">
		<!-- existing type icon + document number -->
	</span>
</div>
```

**State:**

```ts
let editProposerSeconderId = $state<string | null>(null);
```

**Modal:**

```svelte
{#if editProposerSeconderId}
	{@const am = (amendments ?? []).find((x) => x.id === editProposerSeconderId)}
	{#if am}
		<EditProposerSeconderModal
			open={true}
			type="amendment"
			id={am.id}
			{committeeId}
			currentProposer={am.proposer}
			currentSeconder={am.seconderCommitteeMember}
			onClose={() => (editProposerSeconderId = null)}
		/>
	{/if}
{/if}
```

**Live query:** In the `amendments` query (line 148), add `seconderCommitteeMember` next to `proposer`:

```ts
proposer: {
  id: true,
  representation: { name: true, alpha2Code: true, alpha3Code: true, faIcon: true, type: true }
},
seconderCommitteeMember: {
  id: true,
  representation: { name: true, alpha2Code: true, alpha3Code: true, faIcon: true, type: true }
},
```

---

## 6. Projector Display

### Limitation

`PresentationResolutionPreview.svelte` uses `ResolutionPreview` from the external library `@deutschemodelunitednations/munify-resolution-editor`. That library renders its own header internally from `headerData`. We cannot inject the seconder literally between proposer and sponsors inside the library's header without modifying the library.

### Approach

In `PresentationResolutionPreview.svelte`:

**Normal mode** (lines 361-385): Add a custom header row directly above the `<ResolutionPreview>` component that renders: Proposer → Seconder → Sponsors. This row uses the same visual style as the existing active-amendment header. The library's own header is still rendered by `ResolutionPreview`, so there will be two header rows — the library's (proposer + sponsors) and our custom one (proposer + seconder + sponsors). To avoid duplication, we can suppress the library's authoring/sponsoring delegations by passing a `headerData` object without those fields, and render our own complete header above the preview.

```svelte
{#if paper}
	<div class="flex flex-wrap items-center gap-3 border-b-2 border-base-300 pb-3 mb-4">
		{#if paper.creatorCommitteeMember}
			<span class="badge badge-ghost gap-1">
				<Flag representation={paper.creatorCommitteeMember.representation} size="sm" />
				{getTranslatedCountryNameFromAlpha3Code(
					paper.creatorCommitteeMember.representation.alpha3Code
				) ?? paper.creatorCommitteeMember.representation.name}
			</span>
		{/if}
		{#if paper.seconderCommitteeMember}
			<span class="badge badge-ghost gap-1">
				<i class="fas fa-user-plus text-xs"></i>
				<Flag representation={paper.seconderCommitteeMember.representation} size="sm" />
				{getTranslatedCountryNameFromAlpha3Code(
					paper.seconderCommitteeMember.representation.alpha3Code
				) ?? paper.seconderCommitteeMember.representation.name}
			</span>
		{/if}
		{#each paper.sponsors as sponsor}
			<span class="badge badge-ghost gap-1">
				<Flag representation={sponsor.committeeMember.representation} size="sm" />
				{getTranslatedCountryNameFromAlpha3Code(
					sponsor.committeeMember.representation.alpha3Code
				) ?? sponsor.committeeMember.representation.name}
			</span>
		{/each}
	</div>
{/if}
```

Then pass `headerData` without `authoringDelegation` / `sponsoringDelegations` to `ResolutionPreview` so it renders only the document content, not a duplicate header.

**Active amendment mode** (lines 219-252): Add the seconder next to the proposer in the existing header row. Extend the `ActiveAmendment` interface with a `seconder` field and display it:

```svelte
{#if activeAmendment.seconder?.representation}
	<div class="ml-auto flex items-center gap-2 rounded-box bg-base-200 py-1 pl-1 pr-3 text-base">
		<Flag representation={activeAmendment.seconder.representation} size="sm" />
		<span class="font-medium">{getSeconderName(activeAmendment.seconder)}</span>
	</div>
{/if}
```

**Live query updates:** In `PresentationResolutionPreview.svelte`, add `seconderCommitteeMember` to the `papers` query and `alpha3Code` to the `proposer` representation in the `amendments` query (for name translation).

---

## 7. Anti-Glitch / No-Flash Measures

### Reactive data loading

- All live queries start as `undefined` and populate asynchronously. Conditional rendering (`{#if paper && paper.creatorCommitteeMember}`) ensures the UI shows nothing until data is ready — no flash of empty/broken content.
- Svelte's `$derived` updates are atomic; intermediate partial states are never rendered.

### Projector

- `PresentationResolutionPreview.svelte` is gated by `{#if resolution}` at the top level (line 218). Nothing renders until the Y.js client loads the document. No flash.
- When the paper or committee data arrives, the header row updates atomically via `$derived`. No layout thrashing.

### Modal

- The modal is conditionally rendered (`{#if open}` or `<dialog bind:open>`). It is not mounted until opened, so there is no hidden-element flash.
- The `committeeMembers` query inside the modal is a `liveQuery`; results populate reactively. The Combobox shows an empty state until members load.

### Avoided patterns

- Do NOT use `$effect` to imperatively set DOM state that causes layout shifts.
- Do NOT show skeleton loaders that swap content abruptly; instead, show nothing until data arrives (matching the existing codebase pattern).
- Do NOT use CSS transitions on data-driven visibility toggles inside the projector header.

---

## 8. i18n Messages

Add to all three `messages/*.json` files (en, de, pt):

```json
"editProposerAndSeconder": "Edit Proposer & Seconder",
"proposer": "Proposer",
"seconder": "Seconder",
"deselect": "Clear",
"selectProposer": "Select proposer",
"selectSeconder": "Select seconder",
"proposerAndSeconderUpdated": "Proposer & seconder updated",
"noSeconder": "No seconder",
"proposerAndSeconderMustDiffer": "Proposer and seconder must be different"
```

---

## 9. Tests

### 9a. Unit test

**New file:** `src/lib/components/resolutions/proposerSeconder.test.ts`

Test pure helper logic: member name resolution, validation that proposer !== seconder.

### 9b. Handler-level test (optional)

If the project has DB test infra, add a test for `updateAmendment` chair path and non-chair rejection. Otherwise mark as out-of-scope.

### 9c. Regression

Run `bun run test` after changes.

---

## 10. Formatting & Lint

```bash
bun run format
bun run lint
bun run typecheck
```

---

## 11. Implementation Order

1. Schema + migration (`schema.ts`, `relations.ts`, `db:migrate`)
2. Backend mutations (`resolutionPaper.ts`, `amendment.ts`)
3. `EditProposerSeconderModal.svelte`
4. Integrate into `PaperPage.svelte` (header chips + edit button + modal + liveQuery fields)
5. Integrate into `AmendmentList.svelte` (seconder display + edit button + modal + liveQuery fields)
6. Integrate into `PresentationResolutionPreview.svelte` (projector header + active amendment header)
7. i18n keys (en, de, pt)
8. Tests
9. Format + lint + typecheck

---

## Risks & Edge Cases

- **Same member as proposer and seconder:** Disallow in modal with inline error + disabled save.
- **Member belongs to different committee:** Validate server-side; Combobox is already scoped to the correct committee.
- **Status transitions:** Changing proposer/seconder is chair-only and allowed regardless of status.
- **Null handling:** Both columns are nullable; modal and display must handle `null` gracefully.
- **GraphQL client:** The `rumbleClient/schema.ts` and `client.ts` are auto-generated from handler definitions. After adding handler changes, restart the dev server to regenerate. Do not edit generated files manually.
- **Existing `updateResolutionPaper` ability scope:** Non-chair paper authors can call `updateResolutionPaper` on WORKING_PAPER. The resolver must explicitly reject `creatorCommitteeMemberId` / `seconderCommitteeMemberId` from non-chairs.
- **DaisyUI dialog close:** Use `<form method="dialog" class="modal-backdrop">` for ESC/backdrop handling, matching `AmendmentComposer.svelte`'s pattern.
- **Sponsor table independence:** Changing proposer/seconder does NOT update the `paperSponsor` / `amendmentSponsor` join tables. Proposers and sponsors are conceptually separate; the chair manages sponsors via existing sponsor panels.
- **Projector header duplication:** The external library's `ResolutionPreview` renders its own header from `headerData`. To avoid duplicate proposer/sponsor rows in the projector, pass `headerData` without `authoringDelegation` and `sponsoringDelegations`, and render a single custom header row above the preview that includes proposer, seconder, and sponsors.
- **External library type extension:** `ResolutionHeaderData` is defined in the external package. Locally extend it with `& { secondingDelegation?: string }` where needed, or use type assertion when constructing the object.
