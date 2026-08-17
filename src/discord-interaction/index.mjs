import nacl from 'tweetnacl';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const s3 = new S3Client({});
const lambdaClient = new LambdaClient({});

const RAW_IMAGES_BUCKET = process.env.RAW_IMAGES_BUCKET;
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;
const FUNCTION_NAME = process.env.AWS_LAMBDA_FUNCTION_NAME;

const INTERACTION_TYPE_PING = 1;
const INTERACTION_TYPE_APPLICATION_COMMAND = 2;
const RESPONSE_TYPE_PONG = 1;
const RESPONSE_TYPE_CHANNEL_MESSAGE = 4;
const RESPONSE_TYPE_DEFERRED_CHANNEL_MESSAGE = 5;
const MESSAGE_FLAG_EPHEMERAL = 64; // only visible to the person who ran the command

/**
 * API Gateway HTTP API (payload format 2.0) proxy handler for Discord's
 * interactions endpoint. Discord requires an ACK within 3 seconds, which
 * isn't reliably enough time to download the attachment and write it to S3.
 * So /note replies immediately with a DEFERRED_CHANNEL_MESSAGE, then
 * re-invokes this same function asynchronously (InvocationType: 'Event')
 * to do the slow work and PATCH the deferred message once it's done.
 */
export const handler = async (event) => {
  // Async self-invocation carrying out the deferred follow-up work — not a
  // real API Gateway event, so it's checked before any signature handling.
  if (event.source === 'note-followup') {
    return processNoteUpload(event.attachment, event.interactionToken);
  }

  const signature = event.headers?.['x-signature-ed25519'];
  const timestamp = event.headers?.['x-signature-timestamp'];
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
    : event.body ?? '';

  if (!signature || !timestamp || !verifySignature(rawBody, signature, timestamp)) {
    return { statusCode: 401, body: 'invalid request signature' };
  }

  const interaction = JSON.parse(rawBody);

  if (interaction.type === INTERACTION_TYPE_PING) {
    return jsonResponse({ type: RESPONSE_TYPE_PONG });
  }

  if (interaction.type === INTERACTION_TYPE_APPLICATION_COMMAND && interaction.data?.name === 'note') {
    return handleNoteCommand(interaction);
  }

  return jsonResponse({
    type: RESPONSE_TYPE_CHANNEL_MESSAGE,
    data: { content: 'Unsupported interaction.', flags: MESSAGE_FLAG_EPHEMERAL },
  });
};

function verifySignature(rawBody, signature, timestamp) {
  try {
    return nacl.sign.detached.verify(
      Buffer.from(timestamp + rawBody),
      Buffer.from(signature, 'hex'),
      Buffer.from(DISCORD_PUBLIC_KEY, 'hex'),
    );
  } catch {
    return false;
  }
}

async function handleNoteCommand(interaction) {
  const attachments = interaction.data?.resolved?.attachments;
  const attachment = attachments ? Object.values(attachments)[0] : undefined;

  if (!attachment?.url) {
    return jsonResponse({
      type: RESPONSE_TYPE_CHANNEL_MESSAGE,
      data: { content: 'Attach a photo of your notes with /note.', flags: MESSAGE_FLAG_EPHEMERAL },
    });
  }

  // Kick off the slow work (download + S3 upload) in a separate async
  // invocation so we can ACK Discord well within its 3-second window.
  await lambdaClient.send(
    new InvokeCommand({
      FunctionName: FUNCTION_NAME,
      InvocationType: 'Event',
      Payload: Buffer.from(
        JSON.stringify({
          source: 'note-followup',
          attachment: {
            url: attachment.url,
            filename: attachment.filename,
            content_type: attachment.content_type,
          },
          interactionToken: interaction.token,
          interactionId: interaction.id,
        }),
      ),
    }),
  );

  return jsonResponse({
    type: RESPONSE_TYPE_DEFERRED_CHANNEL_MESSAGE,
    data: { flags: MESSAGE_FLAG_EPHEMERAL },
  });
}

async function processNoteUpload(attachment, interactionToken) {
  try {
    const downloadResponse = await fetch(attachment.url);
    if (!downloadResponse.ok) {
      throw new Error(`failed to download Discord attachment: ${downloadResponse.status}`);
    }
    const bytes = Buffer.from(await downloadResponse.arrayBuffer());

    const extension = (attachment.filename?.split('.').pop() || 'jpg').toLowerCase();
    const key = `${new Date().toISOString().replace(/[:.]/g, '-')}-${Date.now()}.${extension}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: RAW_IMAGES_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: attachment.content_type || 'application/octet-stream',
      }),
    );

    await editOriginalMessage(interactionToken, `Got it — transcribing \`${key}\`.`);
  } catch (err) {
    console.error('note-followup failed', err);
    await editOriginalMessage(interactionToken, 'Sorry, something went wrong uploading your note.');
  }
}

async function editOriginalMessage(interactionToken, content) {
  const url = `https://discord.com/api/v10/webhooks/${DISCORD_APPLICATION_ID}/${interactionToken}/messages/@original`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) {
    console.error(`failed to edit original message: ${response.status} ${await response.text()}`);
  }
}

function jsonResponse(body) {
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}
