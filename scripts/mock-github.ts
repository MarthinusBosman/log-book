/**
 * Local stand-in for the GitHub Issues API used by in-app Feedback (src/lib/server/feedback) for
 * browser demos and e2e tests. Nothing reaches github.com.
 *
 *   PORT=4319 bun scripts/mock-github.ts
 *   # then run the app with GITHUB_FEEDBACK_TOKEN=mock FEEDBACK_API_BASE=http://localhost:4319
 *
 * POST /repos/:owner/:repo/issues → 201 { number, html_url } (html_url points back at this mock).
 * A body containing "mock:github-down" answers 503; labels containing "mock-bad-label" answer 422.
 * GET /__issues lists what was received (title, body, labels, auth header).
 */
const port = Number(process.env.PORT ?? 4319);
const issues: { number: number; repo: string; title: string; body: string; labels: string[] | null; authorization: string | null }[] = [];
let next = 101;

Bun.serve({
	port,
	async fetch(req) {
		const url = new URL(req.url);
		if (req.method === 'GET' && url.pathname === '/__issues') return Response.json(issues);
		const m = /^\/repos\/([\w.-]+\/[\w.-]+)\/issues$/.exec(url.pathname);
		if (req.method !== 'POST' || !m) return Response.json({ message: 'Not Found' }, { status: 404 });
		if (!req.headers.get('authorization')?.startsWith('Bearer ')) return Response.json({ message: 'Requires authentication' }, { status: 401 });
		const body = (await req.json()) as { title?: string; body?: string; labels?: string[] };
		if (body.body?.includes('mock:github-down')) return Response.json({ message: 'Service unavailable' }, { status: 503 });
		if (body.labels?.includes('mock-bad-label')) return Response.json({ message: 'Validation Failed' }, { status: 422 });
		const number = next++;
		issues.push({ number, repo: m[1], title: body.title ?? '', body: body.body ?? '', labels: body.labels ?? null, authorization: req.headers.get('authorization') });
		return Response.json({ number, html_url: `${url.origin}/${m[1]}/issues/${number}` }, { status: 201 });
	}
});
console.log(`mock GitHub issues API on http://localhost:${port}`);
