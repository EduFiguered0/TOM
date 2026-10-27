import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoEventStore } from '../src/index.js';
import { eventStoreContract } from '../../core/test/tournament/event-store-contract.js';
import { awsConfig, testStackOutput } from './aws-env.js';

const client = DynamoDBDocumentClient.from(new DynamoDBClient(awsConfig));
const tableName = await testStackOutput('EventsTableName');

eventStoreContract('DynamoDB (tom-test-data)', () => new DynamoEventStore(client, { tableName, retentionDays: 1 }));
