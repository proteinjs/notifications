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
    `connect` and on the tab returning to visibility) and auto-reload. Do not mount it inside
    conditional chrome (ie. a collapsible toolbar) — chrome that unmounts takes the mechanism
    down with it.
    - The response to a stale client is biased toward actually reloading: a hidden or blurred
    tab reloads immediately, a visible tab reloads once its user has been idle for ~45s, and a
    tab returning from a 30s+ absence reloads on arrival. Only a tab in active use defers —
    there, render your update affordance (ie. a banner or toolbar button) from
    `useVersionCheckerContext().needToUpdate`, and the reload still fires at the next safe
    transition (hide/blur or the idle window opening).
    - Surfaces holding unsaved user state (an unsent composer draft, a streaming turn, an
    editor with a pending debounced save) register vetoes via
    `useVersionCheckerContext().registerReloadGuard(guard)`. A guard returning `true` blocks
    auto-reload in every state — even hidden — and defers it (the reload fires once the guard
    releases); it never cancels it.
