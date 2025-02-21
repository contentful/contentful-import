We appreciate any community contributions to this project, whether in the form of issues or Pull Requests.

This document outlines the steps we'd like you to follow in terms of commit messages and code style.

It also explains what to do in case you want to set up the project locally and run tests.

# Setup

This project is written in TypeScript and transpiled to using vite, to the `dist` directory. This should generally only happen at publishing time, or for testing purposes only.

## Node.js Version

This project requires Node.js LTS (v22 or higher). You can manage your Node.js version in two ways:

1. Using volta (recommended). All this requires is volta be setup on your machine as per https://docs.volta.sh/guide/getting-started
2. Using nvm. As per https://github.com/nvm-sh/nvm. Once its installed, run `nvm use` in the project root to switch to the correct version.


Run `npm install` to install all necessary dependencies. When running `npm install` locally, `dist` is not compiled.

# Code style

This project uses [standard](https://github.com/feross/standard). Install a relevant editor plugin if you'd like.

Everywhere where it isn't applicable, follow a style similar to the existing code.

# Commit messages and issues

This project uses the [Angular JS Commit Message Conventions](https://docs.google.com/document/d/1QrDFcIiPjSLDn3EL15IJygNPiHORgU1_OOAqWjiDU5Y/edit), via semantic-release. See the semantic-release [Default Commit Message Format](https://github.com/semantic-release/semantic-release#default-commit-message-format) section for more details.

# Running tests

This project has unit and integration tests.

- `npm test` runs all tests and generates a coverage report.
- `npm run test:unit` runs Node.js unit tests without coverage. `npm run test:cover` to run Node.js unit tests with coverage. `npm run test:debug` runs babel-node in debug mode (same as running `node debug`).

NOTE: to run the integration tests, you need to have a Contentful account and a management token. Create a `.env` file based on the `.env.test.example` file and fill in the necessary values.