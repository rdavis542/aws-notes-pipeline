# aws-notes-pipeline

Terraform infrastructure for transcribing photos of handwritten notes into text files on an existing static website.

## Architecture

```
[Discord: /note + photo] ──signed webhook──▶ [API Gateway HTTP API]
                                                       │
                                                       ▼
                                    [Lambda: discord-interaction]
                                       verifies Ed25519 signature,
                                       downloads the attachment,
                                       PutObject → raw-images bucket
                                                       │
                                                       │ S3 ObjectCreated
                                                       ▼
                                        [Lambda: transcribe]
                                       Textract DetectDocumentText,
                                       joins LINE blocks, PutObject →
                                       website bucket's transcripts/ prefix,
                                       CreateInvalidation on that path
                                                       │
                                                       ▼
                                      [aws-static-site's S3 + CloudFront]
```

- **S3 (raw-images)** — private bucket this project owns; landing zone for phone photos, objects expire after `raw_image_retention_days`.
- **Lambda (discord-interaction)** — verifies Discord's Ed25519 request signature with `tweetnacl`, acknowledges `/note` immediately with a deferred response, then re-invokes itself asynchronously to download the attachment from Discord's CDN, write it to S3, and edit the original message via Discord's webhook API once done.
- **Lambda (transcribe)** — calls Amazon Textract's `DetectDocumentText` (which classifies each line `PRINTED` or `HANDWRITING`), joins the `LINE` blocks in reading order, and writes a `.txt` file.
- **Website bucket + CloudFront** — not managed here. This project reads the bucket name and distribution ID from [`aws-static-site`](../aws-static-site)'s Terraform state via `terraform_remote_state`, so it never hardcodes them.

## Prerequisites

- [Terraform](https://www.terraform.io/downloads) >= 1.0
- Node.js 20.x and npm (to install Lambda dependencies before packaging)
- AWS CLI configured with appropriate credentials
- A [Discord Application](https://discord.com/developers/applications) (free) with its Public Key
- `aws-static-site` already applied — this project reads its state outputs

## One-time Discord setup

1. Create an Application at the [Discord Developer Portal](https://discord.com/developers/applications).
2. Copy its **Public Key** from *General Information* — this becomes `discord_public_key`.
3. Invite the bot to a private server (or your own account, if enabling user-installable apps) with the `applications.commands` scope only — it never needs to read messages.
4. Register the `/note` slash command with an `ATTACHMENT` option, once, via Discord's REST API:

   ```bash
   curl -X POST "https://discord.com/api/v10/applications/<APPLICATION_ID>/commands" \
     -H "Authorization: Bot <BOT_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "note",
       "description": "Transcribe a photo of handwritten notes",
       "options": [
         { "name": "photo", "description": "Photo of your notes", "type": 11, "required": true }
       ]
     }'
   ```

5. After `terraform apply` (below), set the Application's **Interactions Endpoint URL** to the `interactions_endpoint_url` output. Discord sends a `PING` immediately to verify it — the Lambda must be deployed first.

## Usage

```bash
# Install Lambda dependencies so they're included in the deployment zips
(cd src/discord-interaction && npm install --omit=dev)
(cd src/transcribe && npm install --omit=dev)

cd terraform
terraform init
terraform plan -var="discord_public_key=<your-discord-public-key>"
terraform apply -var="discord_public_key=<your-discord-public-key>"
```

## Variables

| Name | Description | Type | Default |
|------|-------------|------|---------|
| `region` | AWS region | `string` | `us-east-1` |
| `project_name` | Name prefix used for resource naming | `string` | `notes-pipeline` |
| `discord_public_key` | Discord Application's Public Key, for signature verification | `string` | *required* |
| `raw_image_retention_days` | Days to retain raw photos before S3 expires them | `number` | `30` |
| `transcripts_prefix` | Key prefix in the website bucket for transcript files | `string` | `transcripts/` |
| `lambda_runtime` | Node.js runtime for both Lambdas | `string` | `nodejs20.x` |
| `website_state_bucket` | S3 bucket holding `aws-static-site`'s Terraform state | `string` | `tf-state-replication-source-350726165848` |
| `website_state_key` | State file key for `aws-static-site` | `string` | `terraform-aws-static-site.tfstate` |
| `website_state_region` | Region of the `aws-static-site` state backend | `string` | `us-east-2` |

## Outputs

| Name | Description |
|------|-------------|
| `interactions_endpoint_url` | URL to register as the Discord Application's Interactions Endpoint URL |
| `raw_images_bucket_name` | S3 bucket that raw phone photos land in |
| `discord_interaction_function_name` | Lambda function name for the Discord interaction handler |
| `transcribe_function_name` | Lambda function name for the Textract transcription handler |
| `website_bucket_name` | Website bucket (from `aws-static-site` state) transcripts are written into |

## Known limitations (v1)

- **No index/manifest**: transcripts are written as standalone `.txt` files with no generated list of past notes. Add a manifest (JSON or DynamoDB) later if the site needs to browse/list them.
- **Textract handwriting accuracy**: works best on clear printed handwriting; cursive is noticeably less reliable. Worth testing against real note pages before relying on it.

## CI/CD

GitHub Actions workflows are provided:

- **tf-create.yml** — Plans on push/PR, applies on manual dispatch
- **tf-destroy.yml** — Manual destroy with confirmation
- **tfsec.yml** — Security scanning with tfsec

`discord_public_key` is sensitive and intentionally has no default — set it as a repository secret and pass it via `tf_vars` (or a `.tfvars` file referenced by `var_file`) before enabling automated apply.
