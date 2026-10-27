import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoAccountRepository } from '../src/index.js';
import { accountRepositoryContract } from '../../core/test/identity/account-repository-contract.js';
import { awsConfig, testStackOutput } from './aws-env.js';

const client = DynamoDBDocumentClient.from(new DynamoDBClient(awsConfig));
const tableName = await testStackOutput('AccountsTableName');

accountRepositoryContract('DynamoDB (tom-test-data)', () => new DynamoAccountRepository(client, { tableName, retentionDays: 1 }));
