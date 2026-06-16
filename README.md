# Feishu GitHub Events

Send GitHub event notifications from GitHub Actions to a Feishu bot. This repository contains a single JavaScript Action that can be published from a public repository to GitHub Marketplace.

## Usage

Add a workflow to the target repository and store the Feishu bot webhook in GitHub Secrets.

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

See [examples/notify-all-events.yml](examples/notify-all-events.yml) for a workflow that listens to every supported event.

## Inputs

| input | required | default | description |
| --- | --- | --- | --- |
| `webhook` | yes | | Feishu group bot webhook URL |
| `secret` | no | | Feishu group bot signature secret |
| `template` | no | `default` | Message template name |
| `template-options` | no | `{}` | JSON options deep-merged into the selected template defaults |
| `show-repository` | no | `false` | Show `owner/repo` in the card body |

## Template Options

The first built-in template is `default`, rendered as a Feishu `interactive` card. It keeps the default body compact: event-specific refs are folded into titles when they matter, comment and review bodies keep Markdown formatting, GitHub usernames link to profiles, and the primary `View Detail` button is the single detail entry point.

Use `template-options` to tweak the title prefix, header colors, visible fields, and button text.

```yaml
- uses: owner/feishu-github-events@v1
  with:
    webhook: ${{ secrets.FEISHU_WEBHOOK }}
    secret: ${{ secrets.FEISHU_SECRET }}
    template-options: |
      {
        "titlePrefix": "Repo Notify",
        "eventHeaderTemplates": {
          "pull_request": "purple",
          "issues": "orange"
        },
        "show": {
          "sha": false,
          "workflow": false
        },
        "buttonText": "View Detail"
      }
```

Future templates can be added by registering another template implementation and passing its name through the `template` input.

## Local Mock

`npm test` sends one mock payload for every GitHub Actions event supported by this Action, in order, to the configured Feishu bot. Use it to inspect and tune card formatting.

Mock payloads live in [fixtures/events](fixtures/events). Each event has one JSON file, so you can edit the sample payload directly.

```bash
FEISHU_WEBHOOK="https://open.feishu.cn/open-apis/bot/v2/hook/xxx" \
FEISHU_SECRET="optional-secret" \
npm test
```

Optional environment variables:

| env | default | description |
| --- | --- | --- |
| `TEMPLATE` | `default` | Template used by local mock sends |
| `TEMPLATE_OPTIONS` | `{}` | Template JSON options used by local mock sends |
| `SHOW_REPOSITORY` | | Set to `true` to show `owner/repo` in local mock cards |
| `MOCK_DELAY_MS` | `300` | Delay between mock messages |

Pure logic tests do not access the network:

```bash
npm run test:unit
```

## Collect Real Payloads

To replace handwritten mocks with real GitHub event payloads, create a temporary test repository and copy [examples/collect-payloads.yml](examples/collect-payloads.yml) to `.github/workflows/collect-payloads.yml` in that repository. The workflow uploads the raw `GITHUB_EVENT_PATH` JSON as an artifact. It does not send Feishu messages or commit anything.

Collection flow:

1. Enable `collect-payloads.yml` in the temporary repository.
2. Trigger the events you want to collect, such as push, open a PR, open an issue, publish a release, or run workflow dispatch.
3. Download the `github-event-payload-...` artifact from the matching workflow run.
4. Unzip the artifact and import it into this repository:

```bash
npm run fixtures:import -- /path/to/downloaded-payloads
```

Preview before importing:

```bash
npm run fixtures:import -- /path/to/downloaded-payloads --dry-run
```

The import script detects the event name from the file name prefix and overwrites the matching JSON file under [fixtures/events](fixtures/events). Some events are hard to trigger naturally in a plain temporary repository: `workflow_call` needs another workflow to call it, `repository_dispatch` needs an API request, and `schedule` needs either time or a temporary high-frequency cron.

## Supported Events

The supported event list tracks GitHub Actions events that can trigger workflows:

`branch_protection_rule`, `check_run`, `check_suite`, `create`, `delete`, `deployment`, `deployment_status`, `discussion`, `discussion_comment`, `fork`, `gollum`, `image_version`, `issue_comment`, `issues`, `label`, `merge_group`, `milestone`, `page_build`, `public`, `pull_request`, `pull_request_review`, `pull_request_review_comment`, `pull_request_target`, `push`, `registry_package`, `release`, `repository_dispatch`, `schedule`, `status`, `watch`, `workflow_call`, `workflow_dispatch`, `workflow_run`

Note: GitHub Actions uses `issue_comment` for pull request comments.

## Marketplace Publishing

Before publishing to GitHub Marketplace, confirm:

- The repository is public.
- The repository root contains the single Marketplace-discoverable `action.yml`.
- The `name` in `action.yml` is unique in Marketplace.
- The repository owner has accepted the GitHub Marketplace Developer Agreement.

Publishing steps:

1. Create and push a version tag, such as `v1.0.0`.
2. Create a GitHub Release.
3. Check `Publish this Action to the GitHub Marketplace`.
4. Choose categories, fill in the release notes, and publish the release.

Marketplace makes the Action discoverable; the actual notification triggers still come from each consumer repository's workflow `on:` configuration.
