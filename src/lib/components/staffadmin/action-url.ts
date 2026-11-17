/**
 * Should `update()` follow the action's URL? Kit 3 navigates to the action's location (the page
 * URL without its query) whenever it differs from the current URL. On a list page whose URL holds
 * view state (`?service=<id>`, `?edit=<id>`, `?q=…`) that is a full navigation: the page jumps to
 * the top and focus resets after every save. Same-page actions stay put (the data still refreshes,
 * `syncViewToUrl` tidies the query); an action on another route keeps Kit's default.
 */
export function followsActionUrl(action: URL, here: URL): boolean {
	return action.pathname !== here.pathname;
}
