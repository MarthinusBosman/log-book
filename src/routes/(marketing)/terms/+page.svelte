<script lang="ts">
	import { brand } from '#lib/brand.ts';
	import Seo from '#lib/components/marketing/Seo.svelte';
	import LegalPage from '#lib/components/marketing/LegalPage.svelte';

	const toc = [
		{ id: 'about', label: 'About these terms' },
		{ id: 'service', label: 'The service' },
		{ id: 'safety', label: 'Skydiving safety' },
		{ id: 'account', label: 'Your account' },
		{ id: 'dropzones', label: 'Dropzone accounts' },
		{ id: 'use', label: 'Acceptable use' },
		{ id: 'content', label: 'Your content' },
		{ id: 'source', label: 'Source code' },
		{ id: 'liability', label: 'Liability' },
		{ id: 'ending', label: 'Ending' },
		{ id: 'law', label: 'Law and changes' },
		{ id: 'contact', label: 'Contact' }
	];
</script>

<Seo
	title="Terms of use"
	description="The terms for using the hosted {brand.name} service: a free logbook and dropzone management tool, provided as-is, governed by South African law."
/>

<LegalPage
	eyebrow="Terms"
	title="Terms of use"
	intro="The rules for using the hosted {brand.name} service. Short version: it's free, it's a record-keeping tool and not a safety system, look after your account, and dropzones are responsible for the records they keep and the payment accounts they connect."
	{toc}
>
	<section id="about">
		<h2>About these terms</h2>
		<p>
			These terms are an agreement between you and {brand.operator} ({brand.madeIn}), who runs the hosted service at
			<strong>{brand.domain}</strong> (“we”). By creating an account or using the service you accept them, along with
			the <a href="/privacy">Privacy policy</a>. If you use {brand.name} on behalf of a dropzone, you accept them for
			the dropzone too and confirm you may do so.
		</p>
		<p>
			They apply to the hosted service only. A {brand.name} server run by a dropzone or anyone else is that operator’s
			service under their own terms.
		</p>
	</section>

	<section id="service">
		<h2>The service</h2>
		<p>
			{brand.name} is free for jumpers and dropzones. There are no subscriptions and we take no cut of payments. We
			provide it <strong>as is and as available</strong>: we work to keep it running and accurate, but we don’t promise
			it will always be available, error-free or suitable for a particular purpose, and we may change, add or remove
			features. Export your logbook regularly if it matters to you (Profile → Export your data).
		</p>
	</section>

	<section id="safety">
		<h2>Skydiving safety</h2>
		<p>
			Skydiving is dangerous and can cause serious injury or death. {brand.name} is a <strong>record-keeping tool</strong>.
			It is not a substitute for your dropzone’s safety procedures, briefings, gear checks, rigger inspections, your
			training, or the rules of PASA, USPA or any other association or aviation authority.
		</p>
		<ul>
			<li>Reserve repack, AAD, membership and currency reminders depend on dates people enter. Always check your gear and documents yourself.</li>
			<li>Load weights, slot counts and wing loading are calculations from entered data, not a weight-and-balance or airworthiness check. The pilot and dropzone decide.</li>
			<li>A signed waiver or a logbook sign-off in the app records what was agreed or signed; it doesn’t replace any check the dropzone is required to do.</li>
		</ul>
	</section>

	<section id="account">
		<h2>Your account</h2>
		<ul>
			<li>Give accurate information, particularly anything a dropzone relies on for safety: weight, licence, ratings, membership and gear dates.</li>
			<li>Keep your password to yourself and tell us at <a href="mailto:{brand.supportEmail}">{brand.supportEmail}</a> if you think someone else has used your account. You are responsible for what happens under your account.</li>
			<li>One account per person. If you are under 18, a parent or guardian must agree to these terms for you.</li>
			<li>Only sign other jumpers’ logbooks when you hold the licence or rating to do so and actually witnessed the jump.</li>
		</ul>
	</section>

	<section id="dropzones">
		<h2>Dropzone accounts</h2>
		<p>If you set up or manage a dropzone in {brand.name}, the dropzone:</p>
		<ul>
			<li>is responsible for the records it keeps about its jumpers, staff and passengers (manifest, waivers, wallets, payments, tandem bookings), including having a lawful reason to collect them, keeping them accurate and answering people’s requests about them under POPIA. We process them on the dropzone’s behalf as described in the <a href="/privacy#roles">Privacy policy</a>;</li>
			<li>is responsible for its waiver and indemnity wording, prices, refunds and the services it sells;</li>
			<li>connects its <strong>own</strong> payment provider account (PayFast, Paystack, Yoco or Stripe) and is bound by that provider’s agreement. Payments go straight from the customer to the dropzone; we are not a party to them and don’t handle the money;</li>
			<li>keeps at least one owner on the account. Staff access ends when an owner or admin removes the role.</li>
		</ul>
	</section>

	<section id="use">
		<h2>Acceptable use</h2>
		<p>Don’t use {brand.name} to:</p>
		<ul>
			<li>break the law, or collect or share other people’s information without a lawful reason;</li>
			<li>impersonate someone, falsify jumps, sign-offs, waivers or payment records;</li>
			<li>upload malware, or content that is unlawful, abusive or infringes someone else’s rights;</li>
			<li>try to get into accounts or data that aren’t yours, probe or overload the service, or scrape it in bulk;</li>
			<li>send spam through invitations, bookings or notifications.</li>
		</ul>
		<p>Security issues found in good faith: please report them privately to <a href="mailto:{brand.supportEmail}">{brand.supportEmail}</a>.</p>
	</section>

	<section id="content">
		<h2>Your content</h2>
		<p>
			What you enter and upload stays yours. You give us permission to store, process and display it only as needed to
			run the service for you and the dropzones you deal with. You confirm you have the right to upload it (for example,
			photos and logos).
		</p>
	</section>

	<section id="source">
		<h2>Source code</h2>
		<p>
			{brand.name} is free software licensed under the
			<a href="https://www.gnu.org/licenses/agpl-3.0.html" rel="noopener">GNU Affero General Public License</a>
			({brand.license}). The source code of the version running here is at
			<a href={brand.sourceUrl} rel="noopener">{brand.sourceUrl.replace('https://', '')}</a>. The licence governs the
			code; these terms govern your use of the hosted service. The {brand.name} name and logo are not licensed for use
			as the name of another service.
		</p>
	</section>

	<section id="liability">
		<h2>Liability</h2>
		<p>
			To the extent South African law allows, we are not liable for indirect or consequential loss, lost data, lost
			income, or for injury, death or damage arising from skydiving activities, decisions made using information in
			the app, a dropzone’s records or conduct, or a payment provider’s service. Because the service is free and provided as
			is, we accept no liability for any other loss connected with it either.
		</p>
		<p>
			Nothing in these terms limits rights you have under the Consumer Protection Act or other law that can’t be
			excluded, or our liability for gross negligence, fraud or anything else the law doesn’t allow us to exclude. Where
			the Consumer Protection Act applies, these terms are to be read so they comply with it.
		</p>
	</section>

	<section id="ending">
		<h2>Ending</h2>
		<p>
			You can stop using {brand.name} and delete your account at any time; see the
			<a href="/privacy#deletion">Privacy policy</a> for what is removed and what dropzones keep. We may suspend or close
			an account that breaks these terms or puts others at risk, normally after telling you why. If we ever shut the
			hosted service down, we will give at least 60 days’ notice so you can export your data.
		</p>
	</section>

	<section id="law">
		<h2>Law and changes</h2>
		<p>
			These terms are governed by the law of the Republic of South Africa, and South African courts have jurisdiction.
			If part of them is unenforceable, the rest still applies. We may update them; the effective date at the top will
			change, and we will tell account holders about significant changes before they take effect. Continuing to use the
			service after that means you accept the new terms.
		</p>
	</section>

	<section id="contact">
		<h2>Contact</h2>
		<p>
			{brand.operator}, {brand.madeIn} · <a href="mailto:{brand.supportEmail}">{brand.supportEmail}</a> · privacy
			questions: <a href="mailto:{brand.privacyEmail}">{brand.privacyEmail}</a>
		</p>
	</section>
</LegalPage>
