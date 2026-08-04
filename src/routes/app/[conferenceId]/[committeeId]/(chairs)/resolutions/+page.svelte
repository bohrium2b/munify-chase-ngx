<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { client } from '$lib/api/rumbleClient/client';
	import { nanoid } from '$lib/helpers/nanoid';
	import { workingPaperName } from '$lib/helpers/paperName';
	import { m } from '$lib/paraglide/messages';
	import BasicCard from '$lib/components/BasicCard.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import CommitteePhaseToggles from '$lib/components/resolutions/CommitteePhaseToggles.svelte';
	import { getTranslatedCountryNameFromAlpha3Code } from '$lib/utils/nationTranslationHelper.svelte';
	import {
		statusLabel,
		statusBadgeClass,
		PAPER_STATUS_ORDER,
		type PaperStatus
	} from '$lib/components/resolutions/paperContext';
	import toast from 'svelte-french-toast';

	const conferenceId = $derived(page.params.conferenceId!);
	const committeeId = $derived(page.params.committeeId!);

	const committee = await client.liveQuery.committee({
		__args: { id: committeeId },
		id: true,
		name: true,
		activeDraftResolutionId: true,
		amendmentSubmissionOpen: true,
		amendmentSponsoringOpen: true,
		supportReevaluationOpen: true,
		activeAgendaItem: { id: true, title: true }
	});

	const committeeMembers = await client.liveQuery.committeeMembers({
		__args: { where: { committee: { id: committeeId } } },
		id: true,
		representation: {
			name: true,
			alpha2Code: true,
			alpha3Code: true,
			faIcon: true,
			type: true
		}
	});

	function getMemberName(member: (typeof committeeMembers)[number] | undefined) {
		return (
			getTranslatedCountryNameFromAlpha3Code(member?.representation?.alpha3Code) ??
			member?.representation?.name ??
			''
		);
	}

	const sortedCommitteeMembers = $derived(
		[...(committeeMembers ?? [])].sort((a, b) => getMemberName(a).localeCompare(getMemberName(b)))
	);

	let settingActiveId = $state<string | null>(null);
	async function setActive(paperId: string) {
		const unset = committee?.activeDraftResolutionId === paperId;
		settingActiveId = paperId;
		try {
			await client.mutate.setActiveDraftResolution({
				__args: { committeeId, paperId: unset ? undefined : paperId },
				id: true,
				activeDraftResolutionId: true
			});
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed');
		} finally {
			settingActiveId = null;
		}
	}

	const papers = await client.liveQuery.resolutionPapers({
		__args: { where: { committee: { id: committeeId } } },
		id: true,
		title: true,
		status: true,
		documentNumber: true,
		createdAt: true,
		creatorCommitteeMember: {
			id: true,
			representation: {
				id: true,
				name: true,
				type: true,
				alpha2Code: true,
				let createDialogOpen = $state(false);
				let proposerCommitteeMemberId = $state('');
				let seconderCommitteeMemberId = $state('');

				function openCreateDialog() {
					if (!sortedCommitteeMembers.length) {
						toast.error(m.noCommitteeMembers());
						return;
					}
					const firstMember = sortedCommitteeMembers[0]?.id ?? '';
					proposerCommitteeMemberId = firstMember;
					seconderCommitteeMemberId = '';
					createDialogOpen = true;
				}

				$effect(() => {
					if (proposerCommitteeMemberId && seconderCommitteeMemberId === proposerCommitteeMemberId) {
						seconderCommitteeMemberId = '';
					}
				});

				async function createPaper() {
				faIcon: true
			}
		},
		sponsors: { id: true },
					if (!proposerCommitteeMemberId) {
						toast.error(m.selectMember());
						return;
					}
		agendaItem: { id: true, title: true }
	});
		const activeAgendaItemId = committee?.activeAgendaItem?.id;
						const created = await client.mutate.createResolutionPaper({
			(p) => !activeAgendaItemId || p.agendaItem?.id === activeAgendaItemId
		);
		const filtered = activeFilter === 'ALL' ? list : list.filter((p) => p.status === activeFilter);
		return [...filtered].sort((a, b) => (b.sponsors?.length ?? 0) - (a.sponsors?.length ?? 0));
								creatorCommitteeMemberId: proposerCommitteeMemberId,
								seconderCommitteeMemberId: seconderCommitteeMemberId || undefined,

							} as any,
		return resolve('/app/[conferenceId]/[committeeId]/(chairs)/resolutions/[paperId]', {
						} as any);
			committeeId,
						createDialogOpen = false;
			paperId
		});
	}

	let creating = $state(false);
	async function createPaper() {
		if (!committee?.activeAgendaItem) {
			toast.error(m.selectActiveAgendaItemFirst());
			return;
		}
		creating = true;
		try {
			const members = await client.query.committeeMembers({
				__args: { where: { committee: { id: committeeId } } },
				id: true
			});
			if (!members?.length) {
				toast.error(m.noCommitteeMembers());
				return;
			}
			const newId = nanoid();
			const created = await client.mutate.createResolutionPaper({
				__args: {
					id: newId,
					committeeId,
					agendaItemId: committee.activeAgendaItem.id,
					creatorCommitteeMemberId: members[0].id,
					status: 'WORKING_PAPER'
				},
				id: true
			});
			if (created) await goto(paperHref(created.id));
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to create paper');
		} finally {
			creating = false;
		}
	}

	let promotingId = $state<string | null>(null);
	async function promote(paperId: string) {
		promotingId = paperId;
		try {
			await client.mutate.updateResolutionPaper({
				__args: {
					id: paperId,
					status: 'DRAFT_RESOLUTION'
				},
				id: true
			});
			toast.success(m.promotedToDr());
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to promote');
		} finally {
			promotingId = null;
		}
	}
</script>

<div class="flex h-full w-full flex-col items-center">
	<div class="flex w-full max-w-screen-xl flex-col gap-6 p-6">
		<header class="flex flex-wrap items-center justify-between gap-4">
			<h1 class="text-3xl font-bold">{m.resolutions()}</h1>
			<button
				class="btn btn-primary"
				disabled={creating || !committee?.activeAgendaItem || !sortedCommitteeMembers.length}
				onclick={openCreateDialog}
			>
				<i class="fas fa-plus"></i>
				{m.createPaper()}
			</button>
		</header>

		{#if committee}
			<div class="bg-base-100 rounded-box p-4">
				<CommitteePhaseToggles
					{committeeId}
					amendmentSubmissionOpen={committee.amendmentSubmissionOpen}
					amendmentSponsoringOpen={committee.amendmentSponsoringOpen}
					supportReevaluationOpen={committee.supportReevaluationOpen}
				/>
			</div>
		{/if}

		<div class="overflow-x-auto">
			<div role="tablist" class="tabs tabs-boxed w-max min-w-full">
				{#each statusFilters as filter (filter.key)}
					<button
						role="tab"
						class="tab"
						class:tab-active={activeFilter === filter.key}
						onclick={() => (activeFilter = filter.key)}
					>
						{filter.label()}
					</button>
				{/each}
			</div>
		</div>

		{#if !filteredPapers.length}
			<BasicCard>
				<div class="flex flex-col items-center gap-2 py-12 text-center opacity-70">
					<i class="fas fa-file-lines text-5xl"></i>
					<p class="text-lg font-semibold">{m.noPapersYet()}</p>
					<p>{m.createFirstPaper()}</p>
				</div>
			</BasicCard>
		{:else}
			<div class="grid gap-3">
				{#each filteredPapers as paper (paper.id)}
					{@const isActive = committee?.activeDraftResolutionId === paper.id}
					{@const isSubmitted = paper.status === 'SUBMITTED'}
					<div class="card bg-base-100 hover:bg-base-200 transition">
						<div class="card-body flex-row flex-wrap items-center gap-4 p-4">
							<a href={paperHref(paper.id)} class="flex min-w-0 flex-1 flex-col">
								<div class="flex flex-wrap items-center gap-2">
									<span class="font-semibold">
										{paper.documentNumber || paper.title || workingPaperName(paper.id)}
									</span>
									<span class="badge badge-sm {statusBadgeClass(paper.status as PaperStatus)}">
										{statusLabel(paper.status as PaperStatus)}
									</span>
								</div>
								<div class="text-base-content/60 flex flex-wrap items-center gap-x-2 text-sm">
									{#if paper.creatorCommitteeMember?.representation}
										{@const rep = paper.creatorCommitteeMember.representation}
										<div class="my-2 flex items-center gap-1">
											<Flag size="xs" representation={rep} />
											<span>
												{rep.name ?? getTranslatedCountryNameFromAlpha3Code(rep.alpha3Code)}
											</span>
										</div>
										·
									{/if}
									{paper.sponsors.length}
									{paper.sponsors.length === 1 ? m.sponsor() : m.sponsors()}
								</div>
							</a>
							{#if isSubmitted}
								<button
									class="btn btn-primary btn-sm"
									disabled={promotingId === paper.id}
									onclick={() => promote(paper.id)}
								>
									{#if promotingId === paper.id}<i class="fas fa-spinner fa-spin"></i>{/if}
									{m.promoteToDraftResolution()}
								</button>
							{/if}
							<button
								class="btn btn-sm btn-circle"
								class:btn-secondary={isActive}
								class:btn-ghost={!isActive}
								disabled={settingActiveId === paper.id}
								title={isActive ? m.activeDraftResolution() : m.setActiveDr()}
								aria-label={m.setActiveDr()}
								onclick={() => setActive(paper.id)}
							>
								{#if settingActiveId === paper.id}
									<i class="fas fa-spinner fa-spin"></i>
								{:else}
									<i class="fas fa-star"></i>
								{/if}
							</button>
							<a href={paperHref(paper.id)} aria-label={m.open()}>
								<i class="fas fa-chevron-right opacity-50"></i>
							</a>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	{#if createDialogOpen}
		<dialog class="modal" open>
			<div class="modal-box bg-base-100 flex max-w-lg flex-col gap-4">
				<h3 class="text-lg font-bold">{m.createPaper()}</h3>
				<div class="flex flex-col gap-1">
					<span class="label-text text-sm font-medium">{m.selectProposerDelegation()}</span>
					<select class="select select-bordered w-full" bind:value={proposerCommitteeMemberId}>
						{#each sortedCommitteeMembers as member (member.id)}
							<option value={member.id}>{getMemberName(member)}</option>
						{/each}
					</select>
				</div>
				<div class="flex flex-col gap-1">
					<span class="label-text text-sm font-medium">Seconder</span>
					<select class="select select-bordered w-full" bind:value={seconderCommitteeMemberId}>
						<option value="">No seconder</option>
						{#each sortedCommitteeMembers.filter((member) => member.id !== proposerCommitteeMemberId) as member (member.id)}
							<option value={member.id}>{getMemberName(member)}</option>
						{/each}
					</select>
				</div>
				<div class="modal-action">
					<button class="btn btn-ghost" onclick={() => (createDialogOpen = false)}>
						Cancel
					</button>
					<button class="btn btn-primary" disabled={creating} onclick={createPaper}>
						{#if creating}<span class="loading loading-spinner loading-xs"></span>{/if}
						{m.createPaper()}
					</button>
				</div>
			</div>
			<form method="dialog" class="modal-backdrop">
				<button onclick={() => (createDialogOpen = false)}>close</button>
			</form>
		</dialog>
	{/if}
</div>
