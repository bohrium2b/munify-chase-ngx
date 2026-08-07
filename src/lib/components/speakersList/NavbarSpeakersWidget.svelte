<script lang="ts">
	import dayjs from 'dayjs';
	import { client } from '$lib/api/rumbleClient/client';
	import Flag from '$lib/components/Flag.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getServerTime } from '$lib/state/serverTime.svelte';
	import { getTranslatedCountryNameFromAlpha3Code } from '$lib/utils/nationTranslationHelper.svelte';
	import hotkeys from 'hotkeys-js';
	import Kbd from '$lib/components/Kbd.svelte';
	import { compareSpeakers } from '$lib/helpers/speakerSort';
	import { latchWhileDisconnected } from '$lib/state/connection.svelte';
	import Popover from '$lib/components/Popover.svelte';
	import toast from 'svelte-french-toast';
	import { promiseToastStrings } from '$lib/utils/toast';
	import { nanoid } from '$lib/helpers/nanoid';

	type SpeakersList = {
		id: string;
		type: string;
		speakingTime: number;
		startTimestamp?: Date | null;
		timeLeft: number;
		phase?: string | null;
		speakers: Array<{
			id: string;
			position: number;
			overwriteName?: string | null;
			committeeMember?: {
				id: string;
				representation?: {
					name?: string | null;
					alpha2Code?: string | null;
					alpha3Code?: string | null;
					faIcon?: string | null;
					type?: string | null;
				} | null;
			} | null;
			conferenceMember?: {
				id: string;
				representation?: {
					name?: string | null;
					alpha2Code?: string | null;
					alpha3Code?: string | null;
					faIcon?: string | null;
					type?: string | null;
				} | null;
			} | null;
		}>;
	} | null;

	type MemberLike = {
		id: string;
		present?: boolean;
		representation?: {
			name?: string | null;
			alpha2Code?: string | null;
			alpha3Code?: string | null;
			faIcon?: string | null;
			type?: string | null;
		} | null;
	};

	interface Props {
		speakersList?: SpeakersList;
		commentList?: SpeakersList;
		committeeMembers: MemberLike[];
		conferenceMembers: MemberLike[];
	}

	let { speakersList, commentList, committeeMembers, conferenceMembers }: Props = $props();

	const getLatchedSpeakersList = latchWhileDisconnected(() => speakersList);
	const getLatchedCommentList = latchWhileDisconnected(() => commentList);
	let latchedSpeakersList = $derived(getLatchedSpeakersList());
	let latchedCommentList = $derived(getLatchedCommentList());

	let currentSpeaker = $derived(latchedSpeakersList?.speakers.toSorted(compareSpeakers).at(0));
	let currentQuestioner = $derived(latchedCommentList?.speakers.toSorted(compareSpeakers).at(0));

	let speakerRepresentation = $derived(
		currentSpeaker?.committeeMember?.representation ??
			currentSpeaker?.conferenceMember?.representation
	);
	let questionerRepresentation = $derived(
		currentQuestioner?.committeeMember?.representation ??
			currentQuestioner?.conferenceMember?.representation
	);

	let speechRunning = $derived(!!latchedSpeakersList?.startTimestamp);
	let questionRunning = $derived(!!latchedCommentList?.startTimestamp);
	let hasSpeaker = $derived(currentSpeaker != null);
	let hasQuestioner = $derived(currentQuestioner != null);

	type WidgetState =
		| 'speech_idle'
		| 'speech_running'
		| 'speech_stopped'
		| 'question_idle'
		| 'question_running'
		| 'answer_idle'
		| 'answer_running'
		| 'answer_stopped';

	let widgetState = $derived.by((): WidgetState => {
		const phase = latchedSpeakersList?.phase ?? 'SPEECH';
		if (phase === 'SPEECH_DONE') return 'speech_stopped';
		if (phase === 'ANSWER_DONE') return 'answer_stopped';
		if (phase === 'SPEECH') return speechRunning ? 'speech_running' : 'speech_idle';
		if (phase === 'QUESTION') return questionRunning ? 'question_running' : 'question_idle';
		if (phase === 'ANSWER') return speechRunning ? 'answer_running' : 'answer_idle';
		return 'speech_idle';
	});

	let buttonLabel = $derived.by(() => {
		switch (widgetState) {
			case 'speech_running':
				return m.stopSpeech();
			case 'speech_stopped':
				return hasQuestioner ? m.startQuestion() : m.nextSpeaker();
			case 'question_idle':
				return m.startQuestion();
			case 'question_running':
				return m.stopQuestion();
			case 'answer_idle':
				return m.startAnswer();
			case 'answer_running':
				return m.stopAnswer();
			case 'answer_stopped':
				return (latchedCommentList?.speakers.length ?? 0) > 1 ? m.nextQuestion() : m.nextSpeaker();
			case 'speech_idle':
			default:
				return m.startSpeech();
		}
	});

	let buttonIcon = $derived.by(() => {
		switch (widgetState) {
			case 'speech_running':
			case 'question_running':
			case 'answer_running':
				return 'fa-pause';
			case 'speech_stopped':
			case 'answer_stopped':
				return 'fa-diagram-next';
			default:
				return 'fa-play';
		}
	});

	let buttonClass = $derived.by(() => {
		switch (widgetState) {
			case 'speech_running':
			case 'question_running':
			case 'answer_running':
				return 'btn-error';
			case 'speech_stopped':
			case 'answer_stopped':
				return 'btn-info';
			default:
				return 'btn-success';
		}
	});

	let showQuestioner = $derived(
		hasQuestioner &&
			(widgetState === 'speech_stopped' ||
				widgetState === 'question_idle' ||
				widgetState === 'question_running' ||
				widgetState === 'answer_idle' ||
				widgetState === 'answer_running' ||
				widgetState === 'answer_stopped')
	);

	let activeTimerList = $derived(
		speechRunning ? latchedSpeakersList : questionRunning ? latchedCommentList : latchedSpeakersList
	);

	let timeLeft = $derived.by(() => {
		const list = activeTimerList;
		if (!list) return null;
		if (list.startTimestamp) {
			return Math.round(dayjs(list.startTimestamp).diff(getServerTime()) / 1000) + list.timeLeft;
		}
		return list.timeLeft;
	});

	let timeFormatted = $derived.by(() => {
		if (timeLeft === null) return '-:--';
		const abs = Math.abs(timeLeft);
		const d = dayjs.duration(abs, 'seconds');
		const prefix = timeLeft < 0 ? '+' : '';
		return `${prefix}${d.hours() ? d.format('H:mm:ss') : d.format('m:ss')}`;
	});

	let overtime = $derived((timeLeft ?? 0) < 0);

	const startSpeakersListTimer = async () => {
		if (!latchedSpeakersList) return;
		await client.mutate.updateSpeakersList({
			__args: {
				id: latchedSpeakersList.id,
				startTimestamp: getServerTime().toDate(),
				phase: 'SPEECH'
			},
			id: true,
			startTimestamp: true,
			phase: true
		});
	};

	const stopSpeakersListTimer = async () => {
		if (!latchedSpeakersList) return;
		await client.mutate.updateSpeakersList({
			__args: { id: latchedSpeakersList.id, stopTimer: true, phase: 'SPEECH_DONE' },
			id: true,
			timeLeft: true,
			startTimestamp: true,
			phase: true
		});
	};

	const startCommentListTimer = async () => {
		if (!latchedCommentList || !latchedSpeakersList) return;
		await Promise.all([
			client.mutate.updateSpeakersList({
				__args: { id: latchedCommentList.id, startTimestamp: getServerTime().toDate() },
				id: true,
				startTimestamp: true,
				phase: true
			}),
			client.mutate.updateSpeakersList({
				__args: { id: latchedSpeakersList.id, phase: 'QUESTION' },
				id: true,
				phase: true
			})
		]);
	};

	const stopCommentListTimer = async () => {
		if (!latchedCommentList || !latchedSpeakersList) return;
		await Promise.all([
			client.mutate.updateSpeakersList({
				__args: { id: latchedCommentList.id, stopTimer: true },
				id: true,
				timeLeft: true,
				startTimestamp: true,
				phase: true
			}),
			client.mutate.updateSpeakersList({
				__args: { id: latchedSpeakersList.id, phase: 'ANSWER' },
				id: true,
				phase: true
			})
		]);
	};

	const startAnswerTimer = async () => {
		if (!latchedSpeakersList || !latchedCommentList) return;
		await Promise.all([
			client.mutate.updateSpeakersList({
				__args: {
					id: latchedSpeakersList.id,
					timeLeft: latchedCommentList.speakingTime,
					startTimestamp: getServerTime().toDate(),
					phase: 'ANSWER'
				},
				id: true,
				timeLeft: true,
				startTimestamp: true,
				phase: true
			}),
			client.mutate.updateSpeakersList({
				__args: { id: latchedCommentList.id, stopTimer: true },
				id: true,
				timeLeft: true,
				startTimestamp: true,
				phase: true
			})
		]);
	};

	const advanceToNextSpeaker = async () => {
		if (!latchedSpeakersList || !currentSpeaker) return;
		const promises: Promise<unknown>[] = [
			client.mutate.removeSpeakerOnList({
				__args: { speakerOnListId: currentSpeaker.id },
				id: true,
				speakers: { id: true, position: true }
			}),
			client.mutate.updateSpeakersList({
				__args: {
					id: latchedSpeakersList.id,
					timeLeft: latchedSpeakersList.speakingTime,
					stopTimer: true,
					phase: 'SPEECH'
				},
				id: true,
				timeLeft: true,
				startTimestamp: true,
				phase: true
			})
		];
		if (latchedCommentList) {
			promises.push(
				client.mutate.updateSpeakersList({
					__args: {
						id: latchedCommentList.id,
						timeLeft: latchedCommentList.speakingTime,
						stopTimer: true,
						isClosed: false
					},
					id: true,
					timeLeft: true,
					startTimestamp: true,
					isClosed: true,
					phase: true
				}),
				client.mutate.clearSpeakersList({
					__args: { id: latchedCommentList.id },
					id: true,
					speakers: { id: true, position: true }
				})
			);
		}
		await Promise.all(promises);
	};

	const advanceQuestioner = async () => {
		if (!latchedCommentList || !currentQuestioner || !latchedSpeakersList) return;
		await Promise.all([
			client.mutate.removeSpeakerOnList({
				__args: { speakerOnListId: currentQuestioner.id },
				id: true,
				speakers: { id: true, position: true }
			}),
			client.mutate.updateSpeakersList({
				__args: {
					id: latchedCommentList.id,
					timeLeft: latchedCommentList.speakingTime,
					stopTimer: true
				},
				id: true,
				timeLeft: true,
				startTimestamp: true,
				phase: true
			}),
			client.mutate.updateSpeakersList({
				__args: { id: latchedSpeakersList.id, phase: 'QUESTION' },
				id: true,
				phase: true
			})
		]);
	};

	const handleButton = async () => {
		switch (widgetState) {
			case 'speech_idle':
				await startSpeakersListTimer();
				break;
			case 'speech_running':
				await stopSpeakersListTimer();
				break;
			case 'speech_stopped':
				if ((latchedCommentList?.speakers.length ?? 0) > 0) {
					await startCommentListTimer();
				} else {
					await advanceToNextSpeaker();
				}
				break;
			case 'question_idle':
				await startCommentListTimer();
				break;
			case 'question_running':
				await stopCommentListTimer();
				break;
			case 'answer_idle':
				await startAnswerTimer();
				break;
			case 'answer_running':
				await client.mutate.updateSpeakersList({
					__args: {
						id: latchedSpeakersList!.id,
						timeLeft: latchedSpeakersList!.speakingTime,
						stopTimer: true,
						phase: 'ANSWER_DONE'
					},
					id: true,
					timeLeft: true,
					startTimestamp: true,
					phase: true
				});
				break;
			case 'answer_stopped':
				if ((latchedCommentList?.speakers.length ?? 0) > 1) {
					await advanceQuestioner();
				} else {
					await advanceToNextSpeaker();
				}
				break;
		}
	};

	const speakerName = (speaker: typeof currentSpeaker) => {
		if (!speaker) return '';
		const rep = speaker.committeeMember?.representation ?? speaker.conferenceMember?.representation;
		return (
			speaker.overwriteName ||
			rep?.name ||
			getTranslatedCountryNameFromAlpha3Code(rep?.alpha3Code) ||
			''
		);
	};

	const getName = (member: MemberLike | undefined) =>
		member?.representation?.name
			? member?.representation.name
			: getTranslatedCountryNameFromAlpha3Code(member?.representation?.alpha3Code);

	const membersOnList = $derived(
		new Set(
			(latchedSpeakersList?.speakers ?? [])
				.concat(latchedCommentList?.speakers ?? [])
				.flatMap((s) => [s.committeeMember?.id, s.conferenceMember?.id].filter(Boolean))
		)
	);

	let availableMembers = $derived(
		[...committeeMembers, ...conferenceMembers].filter((m) => !membersOnList.has(m.id))
	);

	let addPopoverOpen = $state(false);

	const addSpeaker = async (member: MemberLike) => {
		if (!latchedSpeakersList?.id) return;
		await toast.promise(
			client.mutate.addSpeakerOnList({
				__args: {
					id: nanoid(),
					committeeMemberId: member.present === false ? undefined : member.id,
					conferenceMemberId: member.present === false ? member.id : undefined,
					speakersListId: latchedSpeakersList.id
				},
				id: true,
				position: true,
				speakersListId: true
			}),
			promiseToastStrings(getName(member), 'add')
		);
		addPopoverOpen = false;
	};

	$effect(() => {
		const handler = (event: KeyboardEvent) => {
			event.preventDefault();
			if (!hasSpeaker) return;
			handleButton();
		};
		hotkeys('shift+space', handler);
		return () => hotkeys.unbind('shift+space', handler);
	});
</script>

{#if hasSpeaker}
	<div class="flex items-center gap-3 px-2">
		<div
			class="flex w-36 items-center justify-end gap-2 rounded-lg px-2 py-1 transition-all duration-300 {speechRunning
				? 'bg-success/15 shadow-[0_0_8px_2px_oklch(var(--su)/0.25)]'
				: ''}"
		>
			<span class="hidden min-w-0 truncate text-right text-sm font-medium lg:block">
				{speakerName(currentSpeaker)}
			</span>
			<Flag representation={speakerRepresentation} size="xs" />
		</div>

		<div class="flex shrink-0 flex-col items-center gap-1">
			<span class="font-mono text-sm {overtime ? 'text-error' : ''}">{timeFormatted}</span>
			<button class="btn btn-xs {buttonClass} gap-1" onclick={handleButton}>
				<i class="fas {buttonIcon} text-xs"></i>
				{buttonLabel}
				<Kbd hotkey="shift+space" size="xs" class=" opacity-60" />
			</button>
		</div>

		<div
			class="flex w-36 items-center gap-2 rounded-lg px-2 py-1 transition-all duration-300 {showQuestioner
				? 'visible'
				: 'invisible'} {questionRunning
				? 'bg-warning/15 shadow-[0_0_8px_2px_oklch(var(--wa)/0.25)]'
				: ''}"
		>
			<Flag representation={questionerRepresentation} size="xs" />
			<span class="hidden min-w-0 truncate text-sm font-medium lg:block">
				{speakerName(currentQuestioner)}
			</span>
		</div>

		<Popover bind:open={addPopoverOpen}>
			{#snippet Trigger({ props })}
				<button
					{...props}
					class="btn btn-xs btn-square join-item btn-soft"
					aria-label="Add speaker"
					title="Add speaker"
				>
					<i class="fas fa-plus text-xs"></i>
				</button>
			{/snippet}
			{#snippet Content()}
				<div class="flex max-h-80 flex-col">
					<div class="p-2 pb-0 text-sm font-bold opacity-70">Add to speakers list</div>
					<div class="overflow-y-auto">
						{#if availableMembers.length === 0}
							<div class="p-3 text-sm opacity-60">No members available</div>
						{:else}
							{#each availableMembers as member (member.id)}
								{@const rep = member.representation}
								<button
									class="flex w-full items-center gap-2 p-2 text-left transition-colors hover:bg-base-200"
									onclick={() => addSpeaker(member)}
								>
									<Flag representation={rep ?? undefined} size="xs" />
									<span class="flex-1 truncate text-sm">
										{getName(member)}
									</span>
									{#if typeof member.present === 'boolean' && !member.present}
										<i class="fa-duotone fa-user-xmark opacity-50"></i>
									{/if}
								</button>
							{/each}
						{/if}
					</div>
				</div>
			{/snippet}
		</Popover>
	</div>
{:else if latchedSpeakersList}
	<Popover bind:open={addPopoverOpen}>
		{#snippet Trigger({ props })}
			<button {...props} class="btn btn-xs btn-soft" aria-label="Add speaker" title="Add speaker">
				<i class="fas fa-plus text-xs"></i>
				<span class="hidden sm:inline">Add Speaker</span>
			</button>
		{/snippet}
		{#snippet Content()}
			<div class="flex max-h-80 flex-col">
				<div class="p-2 pb-0 text-sm font-bold opacity-70">Add to speakers list</div>
				<div class="overflow-y-auto">
					{#if availableMembers.length === 0}
						<div class="p-3 text-sm opacity-60">No members available</div>
					{:else}
						{#each availableMembers as member (member.id)}
							{@const rep = member.representation}
							<button
								class="flex w-full items-center gap-2 p-2 text-left transition-colors hover:bg-base-200"
								onclick={() => addSpeaker(member)}
							>
								<Flag representation={rep ?? undefined} size="xs" />
								<span class="flex-1 truncate text-sm">
									{getName(member)}
								</span>
								{#if typeof member.present === 'boolean' && !member.present}
									<i class="fa-duotone fa-user-xmark opacity-50"></i>
								{/if}
							</button>
						{/each}
					{/if}
				</div>
			</div>
		{/snippet}
	</Popover>
{/if}
