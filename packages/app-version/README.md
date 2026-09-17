# Overview

These packages provide an implementation for notifying the client when the app bundle
needs to be updated. 


## Setup

1. Add a dependency to `@proteinjs/app-version-server` in your server package, or a package that is depended on by your server package.
2. Implement `LatestVersionRequiringUpdate` in your server package, or a package that is
depended on by your server package
    - Add a dependency on `@proteinjs/app-version-common`
    - Create and export a variable or class that implements `LatestVersionRequiringUpdate`
        - Note: you do not need to export this from your index
    - Set `LatestVersionRequiringUpdate.version` to be the version of your ui package that, if the client's current bundle version (ui package version) is lower, then you feel its worthy of notifying the user to reload the page
        - Note: this should be an explicit decision each release since you probably don't want to notify the user to reload their page for every minor version that you deploy.
3. Mount `VersionCheckerProvider` once at your app root (anywhere below your socket provider)
    - Add a dependency on `@proteinjs/app-version-ui`
    - The provider is headless and owns the whole mechanism: version checks (on socket
    `connect` and on the tab returning to visibility, while a session exists) and the reload.
    Do not mount it inside conditional chrome (ie. a collapsible toolbar) — chrome that
    unmounts takes the mechanism down with it.
    - A stale client RELOADS as soon as staleness is known, in every page state — there is no
    update affordance for the user to act on and no safe-moment heuristic (hidden, blurred,
    idle) to wait for. An app that wants to say something before the page goes may render a
    transient notice from `useVersionCheckerContext().needToUpdate`; nothing it renders is
    required for the reload to happen.
    - Surfaces with a request in flight the page could not recover from losing (a message sent
    and not yet acknowledged, an upload still landing, a live audio capture) register a guard via
    `useVersionCheckerContext().registerReloadGuard(guard)`. A guard returning `true` DEFERS the
    reload: it is re-asked every `RELOAD_RETRY_INTERVAL_MS` and the reload fires at the first
    release — and in any case `RELOAD_DEFER_MAX_MS` after staleness was detected. A guard never
    cancels a reload and never holds one indefinitely. State the page restores by itself after a
    reload (an unsent draft its editor persists) is not a reason to guard.
