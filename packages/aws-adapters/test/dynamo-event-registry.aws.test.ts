import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoEventRegistry } from '../src/index.js';
import { eventRegistryContract } from '../../core/test/tournament/event-registry-contract.js';
import { awsConfig, testStackOutput } from './aws-env.js';

const client = DynamoDBDocumentClient.from(new DynamoDBClient(awsConfig));
const tableName = await testStackOutput('TournamentsTableName');

eventRegistryContract('DynamoDB (TomTest)', () => new DynamoEventRegistry(client, { tableName, retentionDays: 1 }));
