import nacl from 'tweetnacl';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({});

const RAW_IMAGES_BUCKET = process.env.RAW_IMAGES_BUCKET;
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

const INTERACTION_TYPE_PING = 1;
const INTERACTION_TYPE_APPLICATION_COMMAND = 2;
const RESPONSE_TYPE_PONG = 1;
const RESPONSE_TYPE_CHANNEL_MESSAGE = 4;
const MESSAGE_FLAG_EPHEMERAL = 64; // only visible to the person who ran the command

/**
 * API Gateway HTTP API (payload format 2.0) proxy handler for Discord's
 * interactions endpoint. Discord requires a response within 3 seconds, so
 * this does everything synchronously: verify signature, download the
 * attachment, write it to S3, reply. No deferred/follow-up webhook is used.
 */
export const handler = async (event) => {
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

  const downloadResponse = await fetch(attachment.url);
  if (!downloadResponse.ok) {
    throw new Error(`failed to download Discord attachment: ${downloadResponse.status}`);
  }
  const bytes = Buffer.from(await downloadResponse.arrayBuffer());

  const extension = (attachment.filename?.split('.').pop() || 'jpg').toLowerCase();
  const key = `${new Date().toISOString().replace(/[:.]/g, '-')}-${interaction.id}.${extension}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: RAW_IMAGES_BUCKET,
      Key: key,
      Body: bytes,
      ContentType: attachment.content_type || 'application/octet-stream',
    }),
  );

  return jsonResponse({
    type: RESPONSE_TYPE_CHANNEL_MESSAGE,
    data: { content: `Got it — transcribing \`${key}\`.`, flags: MESSAGE_FLAG_EPHEMERAL },
  });
}

function jsonResponse(body) {
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}
