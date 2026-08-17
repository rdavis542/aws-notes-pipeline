import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { TextractClient, DetectDocumentTextCommand } from '@aws-sdk/client-textract';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';

const s3 = new S3Client({});
const textract = new TextractClient({});
const cloudfront = new CloudFrontClient({});

const WEBSITE_BUCKET = process.env.WEBSITE_BUCKET;
const TRANSCRIPTS_PREFIX = process.env.TRANSCRIPTS_PREFIX || 'transcripts/';
const CLOUDFRONT_DISTRIBUTION_ID = process.env.CLOUDFRONT_DISTRIBUTION_ID;

/**
 * S3 ObjectCreated handler. For each new raw photo: run Textract
 * DetectDocumentText, join the detected LINE blocks in reading order, and
 * write the result as a .txt file into the website bucket's transcripts
 * prefix. Textract tags each line PRINTED or HANDWRITING; we keep both
 * since notes are usually a mix.
 */
export const handler = async (event) => {
  for (const record of event.Records ?? []) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    await transcribeImage(bucket, key);
  }
};

async function transcribeImage(bucket, key) {
  const { Blocks } = await textract.send(
    new DetectDocumentTextCommand({
      Document: { S3Object: { Bucket: bucket, Name: key } },
    }),
  );

  const text = (Blocks ?? [])
    .filter((block) => block.BlockType === 'LINE')
    .map((block) => block.Text)
    .join('\n');

  const baseName = key.split('/').pop().replace(/\.[^.]+$/, '');
  const transcriptKey = `${TRANSCRIPTS_PREFIX}${baseName}.txt`;

  await s3.send(
    new PutObjectCommand({
      Bucket: WEBSITE_BUCKET,
      Key: transcriptKey,
      Body: text,
      ContentType: 'text/plain; charset=utf-8',
    }),
  );

  if (CLOUDFRONT_DISTRIBUTION_ID) {
    await cloudfront.send(
      new CreateInvalidationCommand({
        DistributionId: CLOUDFRONT_DISTRIBUTION_ID,
        InvalidationBatch: {
          CallerReference: `${transcriptKey}-${Date.now()}`,
          Paths: { Quantity: 1, Items: [`/${transcriptKey}`] },
        },
      }),
    );
  }
}
