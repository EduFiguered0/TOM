import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoPhotoStore } from '../src/index.js';
import { photoStoreContract } from '../../core/test/identity/photo-store-contract.js';
import { awsConfig, testStackOutput } from './aws-env.js';

const client = DynamoDBDocumentClient.from(new DynamoDBClient(awsConfig));
const tableName = await testStackOutput('TournamentsTableName');

photoStoreContract('DynamoDB (tom-test-data)', () => new DynamoPhotoStore(client, { tableName, retentionDays: 1 }));
