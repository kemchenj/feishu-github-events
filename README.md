# Feishu GitHub Events

Send GitHub event notifications from GitHub Actions to a Feishu group bot.

This repository contains a single TypeScript JavaScript Action. The published Action entry is the Rollup bundle at `dist/index.js`, so consumers can use it directly from a tag such as `v1`.

## Usage

Store the Feishu bot webhook in GitHub Secrets, then call the Action from a workflow.

```yaml
name: Notify Feishu

on:
  push:
  pull_request:
  issues:
  issue_comment:
  release:
  workflow_run:

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: owner/feishu-github-events@v1
        with:
          webhook: ${{ secrets.FEISHU_WEBHOOK }}
          secret: ${{ secrets.FEISHU_SECRET }}
```

For a full workflow that listens to every supported event, see this repository's dogfood workflow: [.github/workflows/notify-feishu.yml](.github/workflows/notify-feishu.yml).

## Inputs

| input | required | default | description |
| --- | --- | --- | --- |
| `webhook` | yes | | Feishu group bot webhook URL |
| `secret` | no | | Feishu group bot signature secret |
| `template` | no | `default` | Message template name |
| `template-options` | no | `{}` | JSON options deep-merged into the selected template defaults |
| `show-repository` | no | `false` | Show `owner/repo` in the card body |

## Template Options

The built-in `default` template renders a compact Feishu `interactive` card. It keeps detail in the GitHub link instead of repeating context in the body: titles carry the key event signal, comment and review bodies keep Markdown formatting, GitHub usernames link to profiles, and every card uses a single `View Detail` button.

Use `template-options` to tweak title prefix, header colors, visible fields, and button text.

```yaml
- uses: owner/feishu-github-events@v1
  with:
    webhook: ${{ secrets.FEISHU_WEBHOOK }}
    secret: ${{ secrets.FEISHU_SECRET }}
    template-options: |
      {
        "titlePrefix": "GitHub",
        "eventHeaderTemplates": {
          "pull_request": "purple",
          "issues": "orange"
        },
        "show": {
          "repository": true,
          "sha": false
        },
        "buttonText": "View Detail"
      }
```

Future templates can be added by registering another template implementation and passing its name through the `template` input.

## Local Mock

Set `FEISHU_WEBHOOK` and run the mock sender to inspect the real Feishu card output.

```bash
FEISHU_WEBHOOK="https://open.feishu.cn/open-apis/bot/v2/hook/xxx" npm test
```

Useful mock commands:

```bash
npm test
npm run test:mock -- push
npm run test:mock -- deployment_status --case failure
npm run test:mock:all
```

`npm test` sends the primary fixture for every supported event. `test:mock` narrows the run to one event or one case. `test:mock:all` sends every fixture variant and is better suited for staged review.

Optional environment variables:

| env | default | description |
| --- | --- | --- |
| `FEISHU_SECRET` | | Feishu bot signature secret |
| `TEMPLATE` | `default` | Template used by local mock sends |
| `TEMPLATE_OPTIONS` | `{}` | Template JSON options used by local mock sends |
| `SHOW_REPOSITORY` | | Set to `true` to show `owner/repo` in local mock cards |
| `MOCK_DELAY_MS` | `300` | Delay between mock messages |

Pure logic tests do not access the network:

```bash
npm run test:unit
```

## Fixtures

Fixtures live under `fixtures/events/<event>/<case>.json`. `fixtures/events.json` is the manifest used by the mock runner and tests. Each entry records the event, case, source, and whether it is the primary case.

The first fixture set is local and intentionally complete enough for formatting work. The sync script can pull available examples from Octokit's public webhook payload examples, then local cases can fill gaps that are Actions-only, hard to trigger, or status-specific.

```bash
npm run fixtures:sync -- --dry-run
npm run fixtures:sync -- push
```

To collect real payloads yourself, create a temporary workflow that uploads the raw `GITHUB_EVENT_PATH` JSON as an artifact after the events you want to inspect are triggered.

## Development

The Action source is TypeScript, but Marketplace consumers run the bundled JavaScript file.

```bash
npm ci
npm run verify
```

`npm run verify` runs typecheck, unit tests, and Rollup build. Commit `dist/index.js` whenever source changes; CI checks that the bundle is up to date.

## Dogfood

This repository includes two workflows:

- `.github/workflows/ci.yml` runs `npm run verify` and checks the generated bundle.
- `.github/workflows/notify-feishu.yml` calls this Action with `uses: ./` for supported events. It skips the notification step when `FEISHU_WEBHOOK` is not configured.

`workflow_run` notifications are limited to the `CI` workflow completing, so notification runs do not recursively notify themselves.

## Supported Events

The supported event list tracks GitHub Actions events that can trigger workflows:

`branch_protection_rule`, `check_run`, `check_suite`, `create`, `delete`, `deployment`, `deployment_status`, `discussion`, `discussion_comment`, `fork`, `gollum`, `image_version`, `issue_comment`, `issues`, `label`, `merge_group`, `milestone`, `page_build`, `public`, `pull_request`, `pull_request_review`, `pull_request_review_comment`, `pull_request_target`, `push`, `registry_package`, `release`, `repository_dispatch`, `schedule`, `status`, `watch`, `workflow_call`, `workflow_dispatch`, `workflow_run`

GitHub Actions uses `issue_comment` for pull request comments.

## Marketplace Publishing

Before publishing to GitHub Marketplace, confirm:

- The repository is public.
- The repository root contains the single Marketplace-discoverable `action.yml`.
- `action.yml` points to the committed `dist/index.js` bundle.
- The `name` in `action.yml` is unique in Marketplace.
- The repository owner has accepted the GitHub Marketplace Developer Agreement.

Publishing steps:

1. Run `npm run verify`.
2. Commit the source and `dist/index.js`.
3. Create and push a version tag, such as `v1.0.0`.
4. Create a GitHub Release.
5. Check `Publish this Action to the GitHub Marketplace`.
6. Choose categories, fill in the release notes, and publish the release.

Marketplace makes the Action discoverable; notification triggers still come from each consumer repository's workflow `on:` configuration.
