<script lang="ts">
	import { brand } from '#lib/brand.ts';
	import { LEGAL } from '#lib/legal.ts';
	import Seo from '#lib/components/marketing/Seo.svelte';
	import LegalPage from '#lib/components/marketing/LegalPage.svelte';

	const toc = [
		{ id: 'who', label: 'Who we are' },
		{ id: 'roles', label: 'Your dropzone’s records' },
		{ id: 'collect', label: 'What we collect' },
		{ id: 'why', label: 'Why, and on what basis' },
		{ id: 'cookies', label: 'Cookies' },
		{ id: 'share', label: 'Who else is involved' },
		{ id: 'abroad', label: 'Data outside South Africa' },
		{ id: 'security', label: 'Security' },
		{ id: 'retention', label: 'How long we keep it' },
		{ id: 'rights', label: 'Your rights' },
		{ id: 'complain', label: 'Complaints' },
		{ id: 'children', label: 'Children' },
		{ id: 'changes', label: 'Changes' },
		{ id: 'contact', label: 'Contact' }
	];
	const mail = `mailto:${brand.privacyEmail}`;
</script>

<Seo
	title="Privacy policy"
	description="How {brand.name} handles personal information under South Africa’s POPIA: what we collect, why, where it is stored, how long we keep it and your rights."
/>

<LegalPage
	eyebrow="Privacy"
	title="Privacy policy"
	intro="{brand.name} is a free logbook and dropzone management app. This page explains what personal information the hosted service collects, why, where it lives and what you can do about it, in line with South Africa’s Protection of Personal Information Act (POPIA)."
	{toc}
>
	<section id="who">
		<h2>Who we are</h2>
		<p>
			The hosted service at <strong>{brand.domain}</strong> (and {brand.name} addresses that redirect to it) is run by
			<strong>{brand.operator}</strong>, an individual in {brand.madeIn}. For your account, we are the
			<em>responsible party</em> under POPIA. The Information Officer is {brand.operator}, reachable at
			<a href={mail}>{brand.privacyEmail}</a>.
		</p>
		<p>
			{brand.name} is also open-source software that dropzones can run on their own servers. This policy covers only the
			hosted service at {brand.domain}. If you use a {brand.name} server at any other address, whoever runs that server
			is the responsible party for it, and their own policy applies.
		</p>
	</section>

	<section id="roles">
		<h2>Your dropzone’s records</h2>
		<p>Two kinds of information live in {brand.name}, and the responsibility differs:</p>
		<ul>
			<li>
				<strong>Your account and personal logbook</strong>: your profile, credentials, logbook, gear and settings. We
				are the responsible party.
			</li>
			<li>
				<strong>Records a dropzone keeps about the people who jump there</strong>: signed waivers and indemnities,
				manifest and load records, check-ins, wallet balances and ledger transactions, payment records and tandem
				bookings. The <strong>dropzone</strong> decides what it records and why, so the dropzone is the responsible
				party and we process that information on its behalf as its <em>operator</em>. Questions about those records
				go to the dropzone first; we will help it answer.
			</li>
		</ul>
	</section>

	<section id="collect">
		<h2>What we collect</h2>
		<h3>Your account</h3>
		<ul>
			<li>Name, email address and a password, which we store only as a salted PBKDF2 hash (never the password itself).</li>
			<li>Optional profile details: phone number, address, date of birth, emergency contact name and number, profile photo, and whether you want marketing messages from your dropzones.</li>
			<li>
				Jumper credentials: association (e.g. PASA, USPA), membership number and expiry, licence, ratings with expiry
				dates, number of jumps before you started this logbook, body weight and exit weight (used for manifest weight
				limits).
			</li>
			<li>If you verify your PASA membership: the public member details para.co.za returns for your number (name, licence, ratings, home dropzone, whether you are on the current members list).</li>
			<li>Your logbook: jump number, date, dropzone or location, aircraft, altitude, freefall time, jump type, notes, rig used, and sign-offs (the signer’s name, licence and drawn signature image).</li>
			<li>Your gear: rigs, container and canopies, reserve repack and AAD service dates, service history.</li>
			<li>Jump buddies, teams, dropzones you follow, in-app notifications and import history.</li>
		</ul>
		<h3>At a dropzone</h3>
		<ul>
			<li>Membership and roles (jumper, manifest, instructor, owner…), check-ins (day, weight, gear rental).</li>
			<li>Manifest slots: the load, jump type, extras, price, weight, and payment status.</li>
			<li>Wallet balances and an append-only ledger of top-ups, holds, charges, refunds and staff pay; records of payments made through the dropzone’s own payment provider (amount, status and the provider’s reference).</li>
			<li>Signed waivers and indemnities: the form text you agreed to, your answers, your name and details as signed, signature images (and a guardian’s, for minors), and a tamper-evident hash of the signed record.</li>
		</ul>
		<h3>Tandem passengers and online bookings</h3>
		<p>
			Tandem passengers often have no account. When someone books a tandem or a dropzone captures a passenger, we
			store what the dropzone’s form asks for: name, email, phone, ID or passport number, gender, date of birth,
			nationality, height, weight, address, emergency contact details, guardian details for minors, the booking,
			extras, payments and the signed indemnity. The dropzone is the responsible party for this information.
		</p>
		<h3>Uploads</h3>
		<p>Profile photos, dropzone photos and logos, signature images, and files you upload to import (deleted within a day).</p>
		<h3>Technical information</h3>
		<ul>
			<li>For each signed-in session: the IP address and browser user agent at sign-in, so you and we can spot sessions that aren’t yours.</li>
			<li>Our hosting provider’s request logs and our error logs, kept for a few days to keep the service running and secure.</li>
			<li>If you use “Near me” on the Dropzones page, your browser sends your location with that one request to sort the list. We don’t store it.</li>
		</ul>
		<p>
			We don’t use advertising, analytics or tracking scripts, and we don’t sell or rent personal information to
			anyone.
		</p>
	</section>

	<section id="why">
		<h2>Why, and on what basis</h2>
		<table>
			<thead><tr><th scope="col">Purpose</th><th scope="col">Basis under POPIA (section 11)</th></tr></thead>
			<tbody>
				<tr><td>Creating and running your account, logbook and gear tracking</td><td>Needed to provide the service you signed up for</td></tr>
				<tr><td>Manifest, check-in, wallets, payments, waivers and tandem bookings for a dropzone</td><td>The dropzone’s contract with you and its legal and financial record-keeping duties; we act on its instructions</td></tr>
				<tr><td>Weight, licence and currency checks before a jump</td><td>Safety: needed for the dropzone to run loads within aircraft and gear limits</td></tr>
				<tr><td>PASA membership verification, Jump Master import, linking a self-hosted dropzone account</td><td>Your request (consent); you can disconnect at any time</td></tr>
				<tr><td>Service emails (password reset, invitations, booking confirmations)</td><td>Needed to provide the service</td></tr>
				<tr><td>Marketing messages from your dropzones</td><td>Your opt-in on your profile; switch it off at any time</td></tr>
				<tr><td>Security, fraud prevention and keeping the service working</td><td>Our legitimate interest in a safe, working service</td></tr>
			</tbody>
		</table>
	</section>

	<section id="cookies">
		<h2>Cookies</h2>
		<p>We only set cookies the app needs to work. No advertising or tracking cookies.</p>
		<table>
			<thead><tr><th scope="col">Cookie</th><th scope="col">What it does</th><th scope="col">Lasts</th></tr></thead>
			<tbody>
				<tr><td><code>session</code></td><td>Keeps you signed in (a random token; we store only its hash)</td><td>30 days, renewed while you use the app</td></tr>
				<tr><td><code>theme</code></td><td>Remembers light or dark mode</td><td>1 year</td></tr>
				<tr><td><code>dz</code></td><td>Remembers which dropzone you are working in</td><td>1 year</td></tr>
				<tr><td><code>dz_photo_prompt</code></td><td>Hides the “add a profile photo” prompt once you dismiss it</td><td>1 year</td></tr>
				<tr><td><code>fed_link</code></td><td>Protects the account-linking step with a self-hosted dropzone</td><td>10 minutes</td></tr>
			</tbody>
		</table>
	</section>

	<section id="share">
		<h2>Who else is involved</h2>
		<ul>
			<li>
				<strong>Dropzones you join.</strong> Staff at a dropzone where you are a member, check in or get manifested can
				see the profile, credentials, gear status and records they need to run the day. Leaving a dropzone stops new
				sharing; it doesn’t erase what the dropzone already recorded.
			</li>
			<li>
				<strong>Cloudflare</strong> hosts the app, database and files (Cloudflare Workers, D1 and R2) and delivers every
				request.
			</li>
			<li>
				<strong>Your dropzone’s payment provider</strong> (PayFast, Paystack, Yoco or Stripe, chosen by the dropzone).
				When you pay online you are sent to the provider’s own page. Card details go only to the provider; {brand.name}
				never sees or stores them. The provider tells us whether the payment succeeded.
			</li>
			<li>
				<strong>PASA</strong> (para.co.za). When you ask us to verify your membership, our server looks up your number on
				PASA’s public member pages. We send only the number.
			</li>
			<li>
				<strong>Jump Master import.</strong> If you import from Jump Master, your browser signs in to Jump Master
				(Google Firebase) with your own credentials and reads your data there. Your Jump Master password never reaches
				our server; only the logbook, gear and profile you choose to import does.
			</li>
			<li>
				<strong>Self-hosted dropzones you link.</strong> If you link your {brand.domain} account to a dropzone running
				its own {brand.name} server, that server sends your jumps from its loads to your logbook here, and receives your
				name, email and licence details. You can unlink at any time.
			</li>
			<li>
				<strong>Resend</strong> delivers the service emails we send (password resets, invitations, booking
				confirmations). It receives the recipient’s address and the message.
			</li>
			<li>
				<strong>GitHub</strong> hosts the public source code. It receives no personal information from the app.
			</li>
			<li>Authorities, only when the law requires it, and only what is required.</li>
		</ul>
	</section>

	<section id="abroad">
		<h2>Data outside South Africa</h2>
		<p>
			The hosted service runs on Cloudflare’s global network, so your information is stored and processed on servers
			outside South Africa. Section 72 of POPIA allows this when the recipient is bound by law or a binding agreement
			that gives protection comparable to POPIA. Cloudflare processes data under its data processing terms, which
			include the EU Standard Contractual Clauses and commit it to security and confidentiality comparable to POPIA.
			Resend (email delivery, United States) processes recipient addresses and message content under its data
			processing agreement on the same basis.
			Payment providers and the other services above process data under their own terms; the payment providers in use
			include South African companies.
		</p>
		<p>By using the hosted service you understand that your information is transferred abroad for these purposes.</p>
	</section>

	<section id="security">
		<h2>Security</h2>
		<ul>
			<li>All traffic is encrypted with HTTPS (HSTS on); strict content-security and other security headers on every page.</li>
			<li>Passwords are salted and hashed (PBKDF2-SHA256); session and password-reset tokens are stored only as hashes; resets expire after an hour and sign out other sessions.</li>
			<li>Dropzones’ payment-provider keys are encrypted at rest (AES-GCM).</li>
			<li>Every staff action checks the person’s role at that dropzone; you only see other people’s data where your role needs it.</li>
			<li>Signed waivers carry a hash that shows if the record was changed after signing.</li>
			<li>Uploaded images are re-checked on the server and their location metadata (EXIF) is removed.</li>
		</ul>
		<p>
			No system is perfectly secure. If a breach puts your information at risk, we will tell you and the Information
			Regulator as section 22 of POPIA requires.
		</p>
	</section>

	<section id="retention">
		<h2>How long we keep it</h2>
		<ul>
			<li>Your account, logbook and gear: for as long as you have an account.</li>
			<li>Sessions: until they expire (30 days without use) or you sign out. Password-reset links: a day after use or expiry.</li>
			<li>Import uploads: deleted within a day.</li>
			<li>
				Dropzone records (waivers, manifest and load records, check-ins, wallet ledgers, payments, tandem bookings): as
				long as the dropzone needs them for its legal, insurance and financial duties. The dropzone decides; we keep them
				while it uses {brand.name}.
			</li>
		</ul>
		<h3 id="deletion">When you delete your account</h3>
		<p>We remove what is yours alone:</p>
		<ul>
			<li>your profile details, photo, credentials, ratings and PASA check;</li>
			<li>your logbook (including sign-off signatures on your own jumps), gear and service history;</li>
			<li>your sessions, linked accounts, notifications, buddies, personal teams, dropzone memberships and follows, and import history.</li>
		</ul>
		<p>
			What a dropzone must keep for its own legal and financial records stays with that dropzone: signed waivers,
			manifest slots, check-ins, wallet ledger entries, payments and tandem records. Those records keep the details as
			they were captured at the time (for example, the name on a signed waiver), but they are no longer linked to an
			account: your account is replaced by an anonymous placeholder, and your email address is freed so it can be used
			again. A sign-off you gave on someone else’s logbook stays in their logbook. To have dropzone records removed,
			ask the dropzone.
		</p>
		<p>
			Deleted information can remain in our hosting provider’s encrypted database backups for up to 30 days before it is
			gone for good.
		</p>
	</section>

	<section id="rights">
		<h2>Your rights</h2>
		<p>Under POPIA you can:</p>
		<ul>
			<li><strong>Access</strong> your information: Profile → Export your data downloads your logbook (CSV) and a full copy (JSON). Ask us for anything not in the export.</li>
			<li><strong>Correct</strong> it: edit your profile, credentials, logbook and gear yourself. Ask us to change your email address.</li>
			<li><strong>Delete</strong> it: Profile → Security → Delete account removes your account straight away, as described above. You can also email <a href={mail}>{brand.privacyEmail}</a>.</li>
			<li><strong>Object</strong> to processing based on our legitimate interests, and withdraw consent (unlink PASA, Jump Master or a self-hosted dropzone; switch off marketing) at any time.</li>
		</ul>
		<p>
			Email <a href={mail}>{brand.privacyEmail}</a> from the address on your account. We reply within 30 days. For
			records a dropzone keeps, contact the dropzone; if it doesn’t respond, tell us and we will help.
		</p>
	</section>

	<section id="complain">
		<h2>Complaints</h2>
		<p>
			Please tell us first at <a href={mail}>{brand.privacyEmail}</a> so we can fix it. You also have the right to
			complain to the {LEGAL.regulator.name}: <a href={LEGAL.regulator.url} rel="noopener">inforegulator.org.za</a>,
			<a href="mailto:{LEGAL.regulator.complaintsEmail}">{LEGAL.regulator.complaintsEmail}</a> (complaints, POPIA Form
			5) or <a href="mailto:{LEGAL.regulator.enquiriesEmail}">{LEGAL.regulator.enquiriesEmail}</a>.
		</p>
	</section>

	<section id="children">
		<h2>Children</h2>
		<p>
			Under POPIA a child is anyone under 18. If you are under 18, a parent or guardian must agree to you having an
			account and to us processing your information. Dropzones book tandem passengers aged 12 to 17 only with a parent
			or guardian’s details and signature on the indemnity; under 12 can’t be booked. If you believe a child’s
			information is here without a guardian’s consent, email us and we will remove it.
		</p>
	</section>

	<section id="changes">
		<h2>Changes</h2>
		<p>
			We will update this page when what we collect or how we use it changes, and change the effective date at the top.
			For significant changes we will tell account holders by email or in the app before they take effect.
		</p>
	</section>

	<section id="contact">
		<h2>Contact</h2>
		<p>
			Information Officer: {brand.operator}, {brand.madeIn} · <a href={mail}>{brand.privacyEmail}</a><br />
			General questions: <a href="mailto:{brand.supportEmail}">{brand.supportEmail}</a> · See also the
			<a href="/terms">Terms of use</a>.
		</p>
	</section>
</LegalPage>
