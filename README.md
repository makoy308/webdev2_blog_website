Site description AfterCredits — Anime Community

A responsive anime discussion community built with HTML, CSS, vanilla JavaScript, Express, and local JSON files. No database, accounts, or paid APIs are required.

## Run locally

Install dependencies with `npm install`, then start the app with `npm start`. The Express server runs at `http://localhost:3000` and supports discussion and comment creation.

## GitHub Pages

Pushing to `main` runs the GitHub Pages workflow, which publishes the site at `https://makoy308.github.io/webdev2_blog_website/`. The Pages build is static and read-only: it includes the checked-in JSON data, but cannot run the Express API or save new posts and comments. The local Express app retains its existing functionality.

API used: [Jikan API](https://docs.api.jikan.moe/)


