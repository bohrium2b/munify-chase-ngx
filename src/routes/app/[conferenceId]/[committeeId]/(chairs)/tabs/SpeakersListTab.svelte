<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { page } from '$app/state';
	import { client } from '$lib/api/rumbleClient/client';
	import question from '$assets/undraw/question.svg';

	import UndrawError from '$lib/components/UndrawError.svelte';
	import BasicCard from '$lib/components/BasicCard.svelte';
	import ChairControls from '$lib/components/speakersList/chairControls/ChairControls.svelte';
	import CurrentSpeaker from '$lib/components/speakersList/CurrentSpeaker.svelte';
	import SpeakersQueuePresentation from '$lib/components/speakersList/ChairSpeakersQueue.svelte';
	import StatusWidget from '../StatusWidget.svelte';
	import Majorities from '$lib/components/Majorities.svelte';
	import { latchWhileDisconnected } from '$lib/state/connection.svelte';

	interface Props {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		committee: any;
	}

	let { committee }: Props = $props();

	const minAmendmentSponsors = $derived(Math.ceil((committee.totalPresent ?? 0) * 0.1));

	// Freeze the last-known agenda item while the WS is confirmed disconnected, so a
	// transient network blip doesn't flash "no agenda item selected" over the page —
	// only a genuine agenda item change (selected/cleared) does.
	const getActiveAgendaItem = latchWhileDisconnected(() => committee.activeAgendaItem);
	let activeAgendaItem = $derived(getActiveAgendaItem());

	let speakersList = $derived(
		activeAgendaItem?.speakersList.find((item: any) => item.type === 'SPEAKERS_LIST')
	);
	let commentList = $derived(
		activeAgendaItem?.speakersList.find((item: any) => item.type === 'COMMENT_LIST')
	);
</script>

{#if !activeAgendaItem}
	<UndrawError
		undrawImage={question}
		title={m.noAgendaItemSelected()}
		description={m.noAgendaItemSelectedDescription()}
		buttonText={m.gotoSettings()}
		buttonLink="./setup"
	/>
{:else}
	<div
		class="flex w-full flex-col items-center justify-center gap-6 p-6 lg:flex-row lg:items-start"
	>
		<div class="top-22 hidden h-full w-lg flex-col gap-4 2xl:sticky 2xl:flex">
			<BasicCard>
				<StatusWidget {committee} />
			</BasicCard>
			<BasicCard>
				<Majorities
					totalPresent={committee.totalPresent}
					simpleMajority={committee.simpleMajority}
					twoThirdsMajority={committee.twoThirdsMajority}
					{minAmendmentSponsors}
				/>
			</BasicCard>
		</div>
		<BasicCard title={m.speakersList()} className="min-h-[calc(100vh-8rem)] max-w-xl w-full">
			<div class="flex flex-col gap-8">
				<CurrentSpeaker {speakersList} />
				<ChairControls
					{speakersList}
					committeeMembers={committee.members}
					conferenceMembers={committee.conference?.uniqueConferenceMembers ?? []}
					type="SPEAKERS_LIST"
					childList={commentList}
				/>
				<SpeakersQueuePresentation
					rawSpeakers={speakersList?.speakers}
					closed={speakersList?.isClosed}
				/>
			</div>
		</BasicCard>
		<BasicCard title={m.commentList()} className="min-h-[calc(100vh-8rem)] max-w-xl  w-full">
			<div class="flex flex-col gap-8">
				<CurrentSpeaker speakersList={commentList} />
				<ChairControls
					committeeMembers={committee.members}
					conferenceMembers={committee.conference?.uniqueConferenceMembers ?? []}
					speakersList={commentList}
					otherList={speakersList}
					type="COMMENT_LIST"
				/>
				<SpeakersQueuePresentation
					rawSpeakers={commentList?.speakers}
					closed={commentList?.isClosed}
				/>
			</div>
		</BasicCard>
	</div>
{/if}
