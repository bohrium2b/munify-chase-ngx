<script lang="ts">
	import { browser } from '$app/environment';
	import { getCurrentUser } from '$lib/state/currentUser.svelte';

	let { children } = $props();

	let reauthenticating = $state(false);

	// On client-side SPA navigation into /app the server's OIDC handle hook never
	// runs, so an unauthenticated visitor would just see a broken page. Probe the
	// session by requesting the current user; on failure, force a full document
	// navigation so the server hook can start the OIDC flow. Use replace() so
	// the failed attempt doesn't pollute browser history.
	if (browser) {
		(async () => {
			try {
				await getCurrentUser();
			} catch {
				reauthenticating = true;
				window.location.replace(window.location.pathname + window.location.search);
			}
		})();
	}
</script>

{@render children()}

{#if reauthenticating}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-base-100">
		<div class="text-center">
			<span class="loading loading-spinner loading-lg"></span>
			<p class="mt-4 text-lg">Re-authenticating…</p>
		</div>
	</div>
{/if}
