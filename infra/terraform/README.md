# Roundscribe — Terraform Infrastructure

> **Scaffold only** — review and customise variables before running `terraform apply`.

## Resources

| Resource | Description |
|---|---|
| `aws_kms_key.audio` | CMK for SSE-KMS encryption of audio files and RDS storage |
| `aws_s3_bucket.audio` | Private bucket for audio recordings (versioned, SSE-KMS) |
| `aws_db_instance.postgres` | RDS Postgres 16 (single-AZ by default) |
| `aws_security_group.rds` | Placeholder SG for RDS — **restrict before applying** |
| `aws_iam_role.app` | App role (attach to ECS task / EC2 profile / Lambda) |
| `aws_iam_policy.app` | Least-privilege: S3 put/get on prefix, KMS use, RDS IAM connect |

## Prerequisites

1. [Terraform ≥ 1.6](https://developer.hashicorp.com/terraform/install)
2. AWS credentials configured (`aws configure` or environment variables)
3. An existing VPC with at least two private subnets
4. An existing **DB subnet group** spanning those subnets

## Quick start

```bash
cd infra/terraform

# Copy and fill in your values
cp terraform.tfvars.example terraform.tfvars

terraform init
terraform plan   # Review — do NOT apply blindly
terraform apply
```

## Required variables

Create `terraform.tfvars` (never commit this file):

```hcl
aws_region           = "us-east-1"
environment          = "production"
audio_bucket_name    = "roundscribe-prod-audio-<unique-suffix>"
vpc_id               = "vpc-xxxxxxxx"
db_subnet_group_name = "my-private-subnet-group"
db_password          = "change-me-strong-password"
```

Sensitive variables can also be passed via env:

```bash
export TF_VAR_db_password="$(aws secretsmanager get-secret-value ...)"
```

## Environment variables to set after apply

Run `terraform output` then populate your `.env.local` / ECS task definition:

| App Env Var | Terraform Output |
|---|---|
| `ROUNDSCRIBE_S3_BUCKET` | `audio_bucket_name` |
| `ROUNDSCRIBE_KMS_KEY_ID` | `kms_key_arn` |
| `DATABASE_URL` | `database_url_template` (fill in password) |

## Manual steps after `terraform apply`

1. **DB subnet group** — Create one in the AWS console (VPC → Subnets → DB Subnet Groups) if you don't have one. It must span ≥ 2 AZs.

2. **Security group** — Replace the `0.0.0.0/0` CIDR placeholder in `aws_security_group.rds` with your actual app SG or private CIDR range before applying.

3. **Multi-AZ** — For production, add `multi_az = true` to `aws_db_instance.postgres` and increase `allocated_storage`.

4. **Remote state** — Uncomment the `backend "s3"` block in `main.tf` and provision the S3 state bucket + DynamoDB lock table first.

5. **Compute** — Attach `app_role_arn` to your compute:
   - **ECS**: set as the `task_role_arn` in your Task Definition
   - **EC2**: create an instance profile wrapping the role
   - **Lambda**: set as `role` in the function resource

6. **Prisma migration** — After RDS is running, run:
   ```bash
   DATABASE_URL="$(terraform output -raw database_url_template)" npx prisma migrate deploy
   ```

7. **VPC Endpoints** (recommended for HIPAA) — Add S3 and KMS gateway/interface endpoints to your VPC to keep traffic off the public internet.

## Security notes

- S3 bucket blocks all public access and uses SSE-KMS with key rotation enabled.
- RDS has `deletion_protection = true` and `publicly_accessible = false`.
- IAM policy scopes S3 access to `audio/<prefix>/*` only.
- Do not store `db_password` in version control — use AWS Secrets Manager or Parameter Store.
