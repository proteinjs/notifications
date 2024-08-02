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
3. Implement a component in your ui package (ie. a banner) that is conditionally rendered if the server determines the current bundle version on the client is lower than the version specified in `LatestVersionRequiringUpdate.version`
    - Add a dependency on `@proteinjs/app-version-ui`
    - Use the `useVersionChecker` hook in your notification (ie. banner) component
