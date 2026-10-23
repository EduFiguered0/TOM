import { S3Client } from '@aws-sdk/client-s3';
import { S3SnapshotStore } from '../src/index.js';
import { snapshotStoreContract } from '../../core/test/tournament/snapshot-store-contract.js';
import { awsConfig, testStackOutput } from './aws-env.js';

const client = new S3Client(awsConfig);
const bucket = await testStackOutput('SnapshotsBucketName');

snapshotStoreContract('S3 (TomTest)', () => new S3SnapshotStore(client, bucket));
