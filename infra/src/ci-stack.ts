import { CfnOutput, Stack, Validations, type StackProps } from 'aws-cdk-lib';
import { PolicyStatement, Role, WebIdentityPrincipal } from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

export interface CiStackProps extends StackProps {
  /** `dono/repositório` no GitHub. */
  repository: string;
  branch: string;
}

const GITHUB = 'token.actions.githubusercontent.com';
export const DEPLOY_ROLE = 'tom-github-deploy';

/**
 * Deploy pelo GitHub Actions: a cada merge na main, o GitHub recebe credenciais temporárias (OIDC), sem chave guardada.
 * A função só aciona os papéis do CDK (bootstrap) e publica o site. Gratuito: IAM não cobra.
 */
export class CiStack extends Stack {
  constructor(scope: Construct, id: string, { repository, branch, ...props }: CiStackProps) {
    super(scope, id, props);
    const { account, region } = this;

    // O provedor do GitHub é criado uma vez à mão (README): o papel de execução do CloudFormation não cria provedores OIDC.
    const provider = `arn:aws:iam::${account}:oidc-provider/${GITHUB}`;
    const role = new Role(this, 'Deploy', {
      // Nome fixo: o workflow monta o ARN sem depender de saída da stack.
      roleName: DEPLOY_ROLE,
      description: `Deploy do ${repository} (${branch}) pelo GitHub Actions`,
      assumedBy: new WebIdentityPrincipal(provider, {
        StringEquals: { [`${GITHUB}:aud`]: 'sts.amazonaws.com', [`${GITHUB}:sub`]: `repo:${repository}:ref:refs/heads/${branch}` },
      }),
    });

    // cdk deploy: o CLI só assume os papéis criados pelo bootstrap; quem altera os recursos é o CloudFormation.
    role.addToPolicy(new PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: ['deploy', 'file-publishing', 'lookup'].map((r) => `arn:aws:iam::${account}:role/cdk-hnb659fds-${r}-role-${account}-${region}`),
    }));
    // npm run web:deploy: lê as saídas das stacks, envia o site e limpa o cache. Curingas só no que o CloudFormation gera.
    const wildcards = {
      stacks: ['TomWeb', 'TomAuth'].map((s) => `arn:aws:cloudformation:${region}:${account}:stack/${s}/*`),
      bucket: 'arn:aws:s3:::tomweb-site*',
      objects: 'arn:aws:s3:::tomweb-site*/*',
      distributions: `arn:aws:cloudfront::${account}:distribution/*`,
    };
    role.addToPolicy(new PolicyStatement({ actions: ['cloudformation:DescribeStacks'], resources: wildcards.stacks }));
    role.addToPolicy(new PolicyStatement({ actions: ['s3:ListBucket'], resources: [wildcards.bucket] }));
    role.addToPolicy(new PolicyStatement({ actions: ['s3:PutObject', 's3:DeleteObject'], resources: [wildcards.objects] }));
    role.addToPolicy(new PolicyStatement({ actions: ['cloudfront:CreateInvalidation'], resources: [wildcards.distributions] }));

    const reasons: [string, string][] = [
      ...wildcards.stacks.map((arn): [string, string] => [arn, 'O sufixo do ARN da stack é um id gerado; só DescribeStacks.']),
      [wildcards.bucket, 'O nome do bucket do site é gerado pelo CloudFormation (tomweb-site…); só ListBucket.'],
      [wildcards.objects, 'Arquivos do site, recriados a cada deploy; só PutObject e DeleteObject.'],
      [wildcards.distributions, 'Id da distribuição gerado pelo CloudFormation; só CreateInvalidation (limpar o cache).'],
    ];
    for (const [arn, reason] of reasons) Validations.of(role).acknowledge({ id: `AwsSolutions-IAM5[Resource::${arn}]`, reason });

    new CfnOutput(this, 'RoleArn', { value: role.roleArn });
  }
}
