<script lang="ts">
	import { type Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { client } from '$lib/api/rumbleClient/client';
	import ChairNavbar from './ChairNavbar.svelte';
	import * as m from '$lib/paraglide/messages';
	import StatusChangerModal from '$lib/components/committee/StatusChangerModal.svelte';
	import StateOfDebateChangerModal from '$lib/components/committee/StateOfDebateChangerModal.svelte';
	import dayjs from 'dayjs';
	import toast from 'svelte-french-toast';
	import { getCommitteeStatusText } from '$lib/utils/committeeStatus';
	import BellIcon from '$lib/components/toast/BellIcon.svelte';
	import { getServerTime } from '$lib/state/serverTime.svelte';
	import hotkeys from 'hotkeys-js';
	import VotingModal from '$lib/components/voting/VotingModal.svelte';
	import AdoptionConfetti from '$lib/components/AdoptionConfetti.svelte';
	import { openPresentationWindow } from '$lib/state/presentationWindow.svelte';

	// Inline tab components — kept as separate files so each tab's data
	// subscriptions stay isolated and the code stays navigable.
	import SetupTab from './tabs/SetupTab.svelte';
	import PresenceTab from './tabs/PresenceTab.svelte';
	import SpeakersListTab from './tabs/SpeakersListTab.svelte';
	import VotingTab from './tabs/VotingTab.svelte';
	import ResolutionsTab from './tabs/ResolutionsTab.svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	const committeeId = page.params.committeeId!;
	const conferenceId = page.params.conferenceId!;

	// Shared committee query — covers every field needed by all five tabs,
	// so no tab needs to re-query committee data. Reactive liveQuery proxy
	// auto-updates all tabs via WebSocket subscriptions.
	const committee = await client.liveQuery.committee({
		__args: { id: committeeId },
		id: true,
		abbreviation: true,
		name: true,
		activeDraftResolutionId: true,
		stateOfDebate: true,
		status: true,
		statusHeadline: true,
		statusUntil: true,
		totalPresent: true,
		simpleMajority: true,
		twoThirdsMajority: true,
		whiteboardContent: true,
		allowDelegationsToAddThemselvesToSpeakersList: true,
		amendmentSubmissionOpen: true,
		amendmentSponsoringOpen: true,
		supportReevaluationOpen: true,
		activeAgendaItem: {
			id: true,
			title: true,
			speakersList: {
				id: true,
				type: true,
				isClosed: true,
				speakingTime: true,
				startTimestamp: true,
				timeLeft: true,
				phase: true,
				agendaItem: {
					id: true,
					committee: {
						id: true,
						allowDelegationsToAddThemselvesToSpeakersList: true,
						conferenceId: true
					}
				},
				speakers: {
					id: true,
					position: true,
					speakersListId: true,
					overwriteName: true,
					committeeMember: {
						id: true,
						representation: {
							id: true,
							type: true,
							name: true,
							regionalGroup: true,
							alpha2Code: true,
							alpha3Code: true,
							faIcon: true
						},
						present: true
					},
					conferenceMember: {
						id: true,
						representation: {
							id: true,
							type: true,
							name: true,
							regionalGroup: true,
							alpha2Code: true,
							alpha3Code: true,
							faIcon: true
						}
					}
				}
			}
		},
		activeRollCallSession: {
			id: true,
			currentMemberIndex: true,
			committeeId: true
		},
		activeVotingSession: {
			id: true,
			mode: true,
			voteName: true,
			majority: true,
			withAbstentions: true,
			deviceVotingWindowSeconds: true
		},
		agendaItems: {
			id: true,
			title: true
		},
		members: {
			id: true,
			present: true,
			representation: {
				id: true,
				type: true,
				name: true,
				regionalGroup: true,
				alpha2Code: true,
				alpha3Code: true,
				faIcon: true
			}
		},
		lastResolutionAdoptionDate: true,
		conference: {
			id: true,
			title: true,
			hasModeratedCaucus: true,
			uniqueConferenceMembers: {
				id: true,
				representation: {
					id: true,
					type: true,
					name: true,
					regionalGroup: true,
					alpha2Code: true,
					alpha3Code: true,
					faIcon: true
				}
			}
		}
	});

	type TabKey = 'setup' | 'presence' | 'speakers-list' | 'voting' | 'resolutions';

	interface TabDef {
		key: TabKey;
		icon: string;
		label: () => string;
		href: string;
		component:
			| typeof SetupTab
			| typeof PresenceTab
			| typeof SpeakersListTab
			| typeof VotingTab
			| typeof ResolutionsTab;
	}

	// Determine active tab from current route. Sub-routes like
	// `resolutions/[paperId]` resolve to the parent `resolutions` tab.
	function getTabFromRoute(routeId: string | undefined): TabKey {
		if (!routeId) return 'setup';
		if (routeId.includes('setup')) return 'setup';
		if (routeId.includes('presence')) return 'presence';
		if (routeId.includes('speakers-list')) return 'speakers-list';
		if (routeId.includes('voting')) return 'voting';
		if (routeId.includes('resolutions')) return 'resolutions';
		return 'setup';
	}

	// Detect sub-routes (e.g. `resolutions/[paperId]`) that should be rendered
	// by SvelteKit's normal outlet rather than the inline tab shell.
	const isSubRoute = $derived(page.route.id?.includes('[paperId]') ?? false);

	// Only use inline tabs for the five main chair tabs; fall back to the
	// normal SvelteKit outlet for any sub-route.
	const useInlineTabs = $derived(!isSubRoute);

	let activeTab = $state<TabKey>(getTabFromRoute(page.route.id ?? undefined));

	// Sync active tab when navigating via browser back/forward.
	$effect(() => {
		const tab = getTabFromRoute(page.route.id ?? undefined);
		if (tab !== activeTab) activeTab = tab;
	});

	const dockItems = $derived<TabDef[]>([
		{
			icon: 'fa-gears',
			label: () => m.setup(),
			href: resolve('/app/[conferenceId]/[committeeId]/(chairs)/setup', {
				conferenceId,
				committeeId
			}),
			key: 'setup',
			component: SetupTab
		},
		{
			icon: 'fa-users',
			label: () => m.presence(),
			href: resolve('/app/[conferenceId]/[committeeId]/(chairs)/presence', {
				conferenceId,
				committeeId
			}),
			key: 'presence',
			component: PresenceTab
		},
		{
			icon: 'fa-users-line',
			label: () => m.speakersList(),
			href: resolve('/app/[conferenceId]/[committeeId]/(chairs)/speakers-list', {
				conferenceId,
				committeeId
			}),
			key: 'speakers-list',
			component: SpeakersListTab
		},
		{
			icon: 'fa-comments',
			label: () => m.voting(),
			href: resolve('/app/[conferenceId]/[committeeId]/(chairs)/voting', {
				conferenceId,
				committeeId
			}),
			key: 'voting',
			component: VotingTab
		},
		{
			icon: 'fa-file-lines',
			label: () => m.resolutions(),
			href: resolve('/app/[conferenceId]/[committeeId]/(chairs)/resolutions', {
				conferenceId,
				committeeId
			}),
			key: 'resolutions',
			component: ResolutionsTab
		}
	]);

	// Track which tabs have been pre-rendered (mounted at least once). A tab
	// that has been pre-rendered stays mounted (hidden) so switching to it is
	// instant — that's the page cache.
	let preloadedTabs: TabKey[] = $state([]);

	function ensurePreloaded(key: TabKey) {
		if (!preloadedTabs.includes(key)) {
			preloadedTabs = [...preloadedTabs, key];
		}
	}

	function switchTab(key: TabKey) {
		if (key === activeTab) return;
		activeTab = key;
		// Replace the URL so the back button stays intuitive, but don't
		// invalidate load data — everything is driven by the shared
		// liveQuery in this layout.
		goto(dockItems.find((t) => t.key === key)!.href, {
			replaceState: true,
			invalidateAll: false
		});
	}

	function handleTabHover(key: TabKey) {
		// Pre-render on first hover so the component mounts and its
		// liveQuery subscriptions start pulling data into the cache.
		ensurePreloaded(key);
	}

	function isActive(key: string) {
		return activeTab === key;
	}

	$effect(() => {
		hotkeys('alt+1, alt+2, alt+3, alt+4, alt+5', (event, handler) => {
			event.preventDefault();
			const map: Record<string, TabKey> = {
				'alt+1': 'setup',
				'alt+2': 'presence',
				'alt+3': 'speakers-list',
				'alt+4': 'voting',
				'alt+5': 'resolutions'
			};
			switchTab(map[handler.key] ?? 'setup');
		});
		return () => hotkeys.unbind('alt+1, alt+2, alt+3, alt+4, alt+5');
	});

	let speakersList = $derived(
		committee?.activeAgendaItem?.speakersList.find((item) => item.type === 'SPEAKERS_LIST')
	);
	let commentList = $derived(
		committee?.activeAgendaItem?.speakersList.find((item) => item.type === 'COMMENT_LIST')
	);

	let committeeStatusExpiredAlerted = $state(false);
	let speakersListOvertimeAlerted = $state(false);
	let commentListOvertimeAlerted = $state(false);

	$effect(() => {
		// Toast Effect
		if (!committee) return;

		const interval = setInterval(() => {
			if (dayjs(committee.statusUntil).diff(getServerTime()) < 0) {
				if (!committeeStatusExpiredAlerted) {
					toast.error(
						m.committeeStatusExpired({
							status: getCommitteeStatusText(committee.status, committee.statusHeadline)
						}),
						{
							icon: BellIcon,
							duration: 10000
						}
					);
					committeeStatusExpiredAlerted = true;
				}
			} else {
				committeeStatusExpiredAlerted = false;
			}

			for (const speakersList of committee.activeAgendaItem?.speakersList ?? []) {
				const overtime =
					dayjs(speakersList.startTimestamp).diff(getServerTime(), 'seconds') +
						speakersList.timeLeft <
					0;

				//	XAND only fire if both are false. Both true can be ignored, case should not happen.
				if (overtime && speakersListOvertimeAlerted === commentListOvertimeAlerted) {
					toast.error(m.speakersListOvertime(), {
						icon: BellIcon
					});
					if (speakersList.type === 'SPEAKERS_LIST') {
						speakersListOvertimeAlerted = true;
					} else if (speakersList.type === 'COMMENT_LIST') {
						commentListOvertimeAlerted = true;
					}
				} else if (!overtime) {
					if (speakersList.type === 'SPEAKERS_LIST') {
						speakersListOvertimeAlerted = false;
					} else if (speakersList.type === 'COMMENT_LIST') {
						commentListOvertimeAlerted = false;
					}
				}
			}
		}, 1000);
		return () => clearInterval(interval);
	});

	$effect(() => {
		hotkeys('alt+p', (event) => {
			event.preventDefault();
			openPresentationWindow(
				resolve('/app/[conferenceId]/[committeeId]/(presentation)', {
					conferenceId,
					committeeId
				}),
				committeeId
			);
		});
		return () => hotkeys.unbind('alt+p');
	});
</script>

<svelte:head>
	<title>{committee?.abbreviation ?? 'N/A'} {m.chairControls()} - MUNify CHASE</title>
</svelte:head>

<ChairNavbar
	title={committee?.abbreviation}
	conferenceTitle={committee?.conference?.title}
	{speakersList}
	{commentList}
	committeeMembers={committee?.members ?? []}
	conferenceMembers={committee?.conference?.uniqueConferenceMembers ?? []}
/>

{#if useInlineTabs}
	<!--
    Inline tab shell.

    Each tab component is mounted once and then hidden/shown. This gives
    us three performance properties:

      1. **Optimistic rendering**: switching tabs only toggles `display`,
         so the new content appears in the next paint — no mount delay.
      2. **Pre-loading on hover**: the first `mouseenter` on a dock item
         adds that tab to `preloadedTabs`, which causes Svelte to mount
         the component. Its `liveQuery` subscriptions start immediately,
         so by the time the user clicks the tab the data is already in
         the (IndexedDB-backed) GraphQL cache.
      3. **Page caching**: once mounted, a tab stays in the DOM forever
         (just `display:none`). Re-visiting is a single style toggle.
  -->
	<div class="pb-16">
		{#each dockItems as item (item.key)}
			{#if activeTab === item.key || preloadedTabs.includes(item.key)}
				<div
					style:display={activeTab === item.key ? 'block' : 'none'}
					aria-hidden={activeTab !== item.key}
				>
					{@const Component = item.component}
					{@const committeeAny = committee as any} // eslint-disable-line @typescript-eslint/no-explicit-any
					<Component committee={committeeAny} />
				</div>
			{/if}
		{/each}
	</div>
{:else}
	<!-- Sub-route (e.g. resolutions/[paperId]) — let SvelteKit render it. -->
	<div class="pb-16">
		{@render children()}
	</div>
{/if}

<StatusChangerModal
	{committeeId}
	oldStatus={committee?.status}
	oldUntil={committee?.statusUntil}
	oldCustomName={committee?.statusHeadline}
/>

<StateOfDebateChangerModal {committeeId} oldStateOfDebate={committee?.stateOfDebate} />

{#if committee}
	<VotingModal {committee} />
{/if}

<AdoptionConfetti
	lastAdoptionDate={committee?.lastResolutionAdoptionDate}
	confettiDurationSec={45}
/>

<!-- Bottom dock -->
<div class="dock dock-md lg:dock-lg md:justify-center md:gap-4">
	{#each dockItems as item, i (item.key)}
		<a
			href={item.href}
			class="group relative {isActive(item.key) &&
			!(
				item.key === 'resolutions' &&
				committee?.activeDraftResolutionId &&
				page.url.pathname.includes(committee.activeDraftResolutionId)
			)
				? 'dock-active'
				: ''}"
			onmouseenter={() => handleTabHover(item.key)}
			onclick={(e) => {
				// Intercept dock clicks so we switch tabs client-side instead
				// of doing a full SvelteKit navigation.
				if (item.key !== activeTab) {
					e.preventDefault();
					switchTab(item.key);
				}
			}}
		>
			<i class="fa-duotone {item.icon} size-[1.2em]"></i>
			<span class="dock-label">{item.label()}</span>
			<kbd
				class="kbd kbd-sm absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm bg-base-100/80 px-2 py-1 z-10"
				>⌥{i + 1}</kbd
			>
		</a>
	{/each}
	{#if committee?.activeDraftResolutionId}
		<a
			href={resolve('/app/[conferenceId]/[committeeId]/(chairs)/resolutions/[paperId]', {
				conferenceId,
				committeeId,
				paperId: committee.activeDraftResolutionId
			})}
			class="group relative {page.url.pathname.includes(committee.activeDraftResolutionId)
				? 'dock-active'
				: ''}"
		>
			<i class="fa-duotone fa-file-pen size-[1.2em]"></i>
			<span class="dock-label">{m.activeDraftResolution()}</span>
		</a>
	{/if}
</div>
