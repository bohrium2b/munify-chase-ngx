import type { CommitteestatusEnum } from '$lib/api/rumbleClient/client';

export interface CommitteeMember {
	id: string;
	present: boolean;
	representation: {
		id: string;
		type: string;
		name: string | null;
		regionalGroup: string | null;
		alpha2Code: string | null;
		alpha3Code: string | null;
		faIcon: string | null;
	} | null;
}

export interface ConferenceMember {
	id: string;
	representation: {
		id: string;
		type: string;
		name: string | null;
		regionalGroup: string | null;
		alpha2Code: string | null;
		alpha3Code: string | null;
		faIcon: string | null;
	} | null;
}

export interface SpeakersListSpeaker {
	id: string;
	position: number;
	overwriteName: string | null;
	committeeMember?: {
		id: string;
		representation?: {
			id: string;
			type: string;
			name: string | null;
			regionalGroup: string | null;
			alpha2Code: string | null;
			alpha3Code: string | null;
			faIcon: string | null;
		} | null;
	} | null;
	conferenceMember?: {
		id: string;
		representation?: {
			id: string;
			type: string;
			name: string | null;
			regionalGroup: string | null;
			alpha2Code: string | null;
			alpha3Code: string | null;
			faIcon: string | null;
		} | null;
	} | null;
}

export interface SpeakersList {
	id: string;
	type: string;
	isClosed: boolean;
	speakingTime: number;
	startTimestamp: Date | null;
	timeLeft: number;
	phase: string | null;
	speakers: SpeakersListSpeaker[];
}

export interface AgendaItem {
	id: string;
	title: string;
	speakersList: SpeakersList[];
	agendaItem: {
		id: string;
		committee: {
			id: string;
			allowDelegationsToAddThemselvesToSpeakersList: boolean;
			conferenceId: string;
		};
	};
}

export interface RollCallSession {
	id: string;
	currentMemberIndex: number;
	committeeId: string;
}

export interface VotingSession {
	id: string;
	mode: string;
	voteName: string;
	majority: string;
	withAbstentions: boolean;
	deviceVotingWindowSeconds: number;
}

export interface ConferenceInfo {
	id: string;
	title: string;
	hasModeratedCaucus: boolean;
	uniqueConferenceMembers: ConferenceMember[];
}

export interface CommitteeWithRelations {
	id: string;
	abbreviation: string;
	name: string;
	activeDraftResolutionId: string | null;
	stateOfDebate: string | null;
	status: CommitteestatusEnum;
	statusHeadline: string;
	statusUntil: Date;
	totalPresent: number;
	simpleMajority: number;
	twoThirdsMajority: number;
	whiteboardContent: string | null;
	allowDelegationsToAddThemselvesToSpeakersList: boolean;
	amendmentSubmissionOpen: boolean;
	amendmentSponsoringOpen: boolean;
	supportReevaluationOpen: boolean;
	activeAgendaItem: AgendaItem | null;
	activeRollCallSession: RollCallSession | null;
	activeVotingSession: VotingSession | null;
	agendaItems: Array<{ id: string; title: string }>;
	members: CommitteeMember[];
	lastResolutionAdoptionDate: Date | null;
	conference: ConferenceInfo;
}
