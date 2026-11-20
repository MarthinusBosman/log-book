/**
 * Sample sections a new dropzone can start its waiver from (Waivers → "Start from sample
 * wording"). Plain, country-neutral clauses: the owner reads and edits them (and checks them
 * against local law) before activating the form. Client-safe: no server imports.
 */
import type { IndemnityAudience, IndemnitySectionType } from './constants.ts';

export type StarterSection = { title: string; content: string; type: IndemnitySectionType };

export const WAIVER_STARTER: Record<IndemnityAudience, readonly StarterSection[]> = {
	tandem: [
		{
			title: 'Medical declaration',
			type: 'acknowledgement',
			content:
				'I am in good health. I have no heart, lung, back, neck or other condition, and I am not pregnant or under the influence of alcohol or drugs. If anything changes before my jump I will tell the instructor.'
		},
		{
			title: 'Weight and age',
			type: 'acknowledgement',
			content: 'The weight and age I gave the dropzone are correct. I understand the instructor may refuse the jump if they are not.'
		},
		{
			title: 'Assumption of risk',
			type: 'acknowledgement',
			content:
				'I understand that tandem skydiving is a dangerous activity. Equipment can fail and people can make mistakes, and I may be seriously injured or killed. I take part of my own free will and accept these risks.'
		},
		{
			title: 'Instructions',
			type: 'acknowledgement',
			content: 'I will follow the briefing and every instruction from my instructor and the dropzone staff, on the ground and in the air.'
		},
		{
			title: 'Release of liability',
			type: 'initials',
			content:
				'To the extent the law allows, I release the dropzone, its owners, staff, instructors and pilots from claims for injury, death or loss arising from my jump.'
		},
		{
			title: 'Photos and video',
			type: 'acknowledgement',
			content: 'I agree that photos and video of my jump may be taken, and that the dropzone may use them to promote skydiving.'
		}
	],
	sport: [
		{
			title: 'Assumption of risk',
			type: 'acknowledgement',
			content:
				'I understand that skydiving is a dangerous activity that may result in serious injury or death. I take part of my own free will and accept these risks.'
		},
		{
			title: 'Fitness to jump',
			type: 'acknowledgement',
			content: 'I am fit to jump and not under the influence of alcohol or drugs. I will not jump if that changes.'
		},
		{
			title: 'Equipment',
			type: 'acknowledgement',
			content: 'Any equipment I jump is airworthy: my reserve is in date, my AAD is serviced and my gear has been checked before every jump.'
		},
		{
			title: 'Rules and currency',
			type: 'acknowledgement',
			content: 'I will follow the dropzone rules, my national association’s regulations and the instructions of manifest and the jumpmaster, and I will keep my licence and currency up to date.'
		},
		{
			title: 'Release of liability',
			type: 'initials',
			content:
				'To the extent the law allows, I release the dropzone, its owners, staff and pilots from claims for injury, death or loss arising from my skydiving here.'
		}
	]
};
