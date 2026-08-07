<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { client } from '$lib/api/rumbleClient/client';
	import toast from 'svelte-french-toast';
	import Combobox from '$lib/components/Combobox.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import { getTranslatedCountryNameFromAlpha3Code } from '$lib/utils/nationTranslationHelper.svelte';
	import Fuse, { type IFuseOptions } from 'fuse.js';

	interface Props {
		open: boolean;
		close: () => void;
		kind: 'paper' | 'amendment';
		id: string;
		committeeId: string;
		currentProposerId: string | null | undefined;
		currentSeconderId: string | null | undefined;
	}

	let {
		open = $bindable(),
		close,
		kind,
		id,
		committeeId,
		currentProposerId,
		currentSeconderId
	}: Props = $props();

	const members = await client.liveQuery.committeeMembers({
		__args: { where: { committee: { id: committeeId } } },
		id: true,
		representation: { name: true, alpha2Code: true, alpha3Code: true, faIcon: true, type: true }
	});

	function getMemberName(member: (typeof members)[number] | undefined) {
		return (
			getTranslatedCountryNameFromAlpha3Code(member?.representation?.alpha3Code) ??
			member?.representation?.name ??
			''
		);
	}

	type MemberItem = NonNullable<(typeof members)[number]>;
	type FuseItem = MemberItem & { label: string };
	const fuseOptions: IFuseOptions<FuseItem> = {
		keys: ['label'],
		ignoreFieldNorm: true,
		ignoreDiacritics: true,
		shouldSort: true
	};
	const fuse = new Fuse<FuseItem>([], fuseOptions);

	const filterMembers = (allMembers: (typeof members)[number][], search: string) => {
		const plain = (allMembers ?? []) as MemberItem[];
		if (search.length > 0) {
			fuse.setCollection(plain.map((x) => ({ ...x, label: getMemberName(x) })));
			return fuse.search(search).map((r) => r.item as MemberItem);
		}
		return [...plain].sort((a, b) => getMemberName(a).localeCompare(getMemberName(b)));
	};

	let proposerValue = $state('');
	let seconderValue = $state('');
	let saving = $state(false);

	const selectedProposer = $derived(
		(members ?? []).find((mem) => getMemberName(mem) === proposerValue) ?? null
	);
	const selectedSeconder = $derived(
		(members ?? []).find((mem) => getMemberName(mem) === seconderValue) ?? null
	);

	$effect(() => {
		if (open) {
			const proposer = (members ?? []).find((m) => m.id === currentProposerId);
			const seconder = (members ?? []).find((m) => m.id === currentSeconderId);
			proposerValue = proposer ? getMemberName(proposer) : '';
			seconderValue = seconder ? getMemberName(seconder) : '';
		}
	});

	const isPaper = $derived(kind === 'paper');

	async function submit() {
		saving = true;
		try {
			if (isPaper) {
				await client.mutate.updateResolutionPaper({
					__args: {
						id,
						creatorCommitteeMemberId: selectedProposer?.id ?? null,
						seconderCommitteeMemberId: selectedSeconder?.id ?? null
					},
					id: true
				});
			} else {
				await client.mutate.updateAmendment({
					__args: {
						id,
						proposerCommitteeMemberId: selectedProposer?.id ?? null,
						seconderCommitteeMemberId: selectedSeconder?.id ?? null
					},
					id: true
				});
			}
			toast.success(m.changesSaved());
			close();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to update');
		} finally {
			saving = false;
		}
	}
</script>

<dialog class="modal" {open}>
	<div class="modal-box bg-base-200 flex w-11/12 max-w-lg flex-col gap-4">
		<h3 class="text-lg font-bold">{m.editProposerSeconder()}</h3>

		<div class="flex flex-col gap-3">
			<div class="flex flex-col gap-1">
				<span class="label-text text-sm font-medium">{m.proposer()}</span>
				{#if selectedProposer}
					<div class="bg-base-100 flex items-center gap-2 rounded-lg px-3 py-2">
						<Flag representation={selectedProposer.representation} size="xs" />
						<span class="flex-1 text-sm font-medium">{getMemberName(selectedProposer)}</span>
						<button
							class="btn btn-ghost btn-xs btn-circle"
							aria-label={m.deselect()}
							onclick={() => (proposerValue = '')}
						>
							<i class="fas fa-xmark text-xs"></i>
						</button>
					</div>
				{:else}
					<Combobox
						bind:value={proposerValue}
						options={members ?? []}
						filter={filterMembers}
						getStringValue={getMemberName}
						getKey={(mem) => mem.id}
						placeholder={m.selectMember()}
						triggerClass="input-lg join-item flex items-center justify-center px-3 text-base-content/40 hover:text-base-content transition-colors"
					>
						{#snippet ListItem(option)}
							<Flag size="xs" representation={option.representation} />
							<span class="ml-2 flex-1">{getMemberName(option)}</span>
						{/snippet}
					</Combobox>
				{/if}
			</div>

			<div class="flex flex-col gap-1">
				<span class="label-text text-sm font-medium">{m.seconder()}</span>
				{#if selectedSeconder}
					<div class="bg-base-100 flex items-center gap-2 rounded-lg px-3 py-2">
						<Flag representation={selectedSeconder.representation} size="xs" />
						<span class="flex-1 text-sm font-medium">{getMemberName(selectedSeconder)}</span>
						<button
							class="btn btn-ghost btn-xs btn-circle"
							aria-label={m.deselect()}
							onclick={() => (seconderValue = '')}
						>
							<i class="fas fa-xmark text-xs"></i>
						</button>
					</div>
				{:else}
					<Combobox
						bind:value={seconderValue}
						options={members ?? []}
						filter={filterMembers}
						getStringValue={getMemberName}
						getKey={(mem) => mem.id}
						placeholder={m.selectMember()}
						triggerClass="input-lg join-item flex items-center justify-center px-3 text-base-content/40 hover:text-base-content transition-colors"
					>
						{#snippet ListItem(option)}
							<Flag size="xs" representation={option.representation} />
							<span class="ml-2 flex-1">{getMemberName(option)}</span>
						{/snippet}
					</Combobox>
				{/if}
			</div>
		</div>

		<div class="modal-action">
			<button class="btn btn-ghost" onclick={() => close()}>{m.cancel()}</button>
			<button class="btn btn-primary" disabled={saving} onclick={submit}>
				{#if saving}<i class="fas fa-spinner fa-spin"></i>{/if}
				{m.save()}
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button onclick={() => close()}>close</button>
	</form>
</dialog>
