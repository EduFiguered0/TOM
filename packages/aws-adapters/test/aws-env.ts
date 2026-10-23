import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';

/** Testes reais usam a stack descartável TomTest. Perfil padrão: tom (sobrescreva com AWS_PROFILE). */
export const awsConfig = { region: 'us-east-2', profile: process.env['AWS_PROFILE'] ?? 'tom' };

export const testStackOutput = async (key: string): Promise<string> => {
  const cfn = new CloudFormationClient(awsConfig);
  const { Stacks } = await cfn.send(new DescribeStacksCommand({ StackName: 'TomTest' }));
  const value = Stacks?.[0]?.Outputs?.find((o) => o.OutputKey === key)?.OutputValue;
  if (!value) throw new Error(`Output ${key} não encontrado na stack TomTest. Rode o deploy da infra.`);
  return value;
};
