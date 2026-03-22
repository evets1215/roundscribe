###############################################################################
# Roundscribe — AWS Infrastructure
# Scaffold only — run `terraform plan` and review before applying.
###############################################################################

terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Uncomment and configure for remote state (recommended for teams):
  # backend "s3" {
  #   bucket         = "your-tfstate-bucket"
  #   key            = "roundscribe/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "tfstate-lock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region
}

###############################################################################
# KMS — Customer-Managed Key for SSE-KMS (audio bucket + RDS storage)
###############################################################################

resource "aws_kms_key" "audio" {
  description             = "${var.app_name}-${var.environment}-audio-key"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = local.common_tags
}

resource "aws_kms_alias" "audio" {
  name          = "alias/${var.app_name}-${var.environment}-audio"
  target_key_id = aws_kms_key.audio.id
}

###############################################################################
# S3 — Private audio bucket (SSE-KMS, versioning, public-access block)
###############################################################################

resource "aws_s3_bucket" "audio" {
  bucket = var.audio_bucket_name

  tags = local.common_tags
}

resource "aws_s3_bucket_versioning" "audio" {
  bucket = aws_s3_bucket.audio.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "audio" {
  bucket = aws_s3_bucket.audio.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.audio.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "audio" {
  bucket = aws_s3_bucket.audio.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "audio" {
  bucket = aws_s3_bucket.audio.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

###############################################################################
# Security Group — RDS (placeholder; restrict ingress to your app SG/CIDR)
###############################################################################

resource "aws_security_group" "rds" {
  name        = "${var.app_name}-${var.environment}-rds-sg"
  description = "Allow inbound Postgres from the application layer"
  vpc_id      = var.vpc_id

  # TODO: Replace the cidr_blocks below with your actual app security group reference.
  ingress {
    description = "Postgres from app layer"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    # cidr_blocks = ["10.0.0.0/8"]  # or reference aws_security_group.app.id via security_groups
    cidr_blocks = ["0.0.0.0/0"] # PLACEHOLDER — restrict before applying
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

###############################################################################
# RDS — Postgres (basic single-AZ; upgrade to Multi-AZ for production)
###############################################################################

resource "aws_db_instance" "postgres" {
  identifier        = "${var.app_name}-${var.environment}-db"
  engine            = "postgres"
  engine_version    = "16.3"
  instance_class    = var.db_instance_class
  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true
  kms_key_id        = aws_kms_key.audio.arn

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = var.db_subnet_group_name
  vpc_security_group_ids = [aws_security_group.rds.id]

  # Disable public access — app connects via private network only
  publicly_accessible = false

  # Automated backups (7-day retention)
  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "mon:04:00-mon:05:00"

  # Prevent accidental destruction
  deletion_protection = true
  skip_final_snapshot = false
  final_snapshot_identifier = "${var.app_name}-${var.environment}-final"

  tags = local.common_tags
}

###############################################################################
# IAM — App role + least-privilege policy
###############################################################################

data "aws_iam_policy_document" "app_assume_role" {
  # Adjust the principal to match your compute type:
  #   - ECS: ecs-tasks.amazonaws.com
  #   - EC2: ec2.amazonaws.com
  #   - Lambda: lambda.amazonaws.com
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app" {
  name               = var.app_role_name
  assume_role_policy = data.aws_iam_policy_document.app_assume_role.json

  tags = local.common_tags
}

data "aws_iam_policy_document" "app_permissions" {
  # S3 — put/get on the audio prefix only
  statement {
    sid    = "AudioS3ReadWrite"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:DeleteObject",
    ]
    resources = [
      "${aws_s3_bucket.audio.arn}/${var.audio_s3_prefix}/*",
    ]
  }

  statement {
    sid    = "AudioS3ListBucket"
    effect = "Allow"
    actions = ["s3:ListBucket"]
    resources = [aws_s3_bucket.audio.arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["${var.audio_s3_prefix}/*"]
    }
  }

  # KMS — encrypt/decrypt for the audio key only
  statement {
    sid    = "AudioKMSUse"
    effect = "Allow"
    actions = [
      "kms:GenerateDataKey",
      "kms:Decrypt",
      "kms:DescribeKey",
    ]
    resources = [aws_kms_key.audio.arn]
  }

  # RDS — IAM authentication (optional; requires rds.generateDbAuthToken in app)
  statement {
    sid    = "RDSConnect"
    effect = "Allow"
    actions = ["rds-db:connect"]
    resources = [
      "arn:aws:rds-db:${var.aws_region}:*:dbuser:${aws_db_instance.postgres.resource_id}/${var.db_username}",
    ]
  }
}

resource "aws_iam_policy" "app" {
  name        = "${var.app_name}-${var.environment}-app-policy"
  description = "Least-privilege policy for the Roundscribe application role"
  policy      = data.aws_iam_policy_document.app_permissions.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "app" {
  role       = aws_iam_role.app.name
  policy_arn = aws_iam_policy.app.arn
}

###############################################################################
# Locals
###############################################################################

locals {
  common_tags = {
    Project     = var.app_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
