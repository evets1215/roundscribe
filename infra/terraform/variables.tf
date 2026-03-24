variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (e.g. staging, production)"
  type        = string
  default     = "production"
}

variable "app_name" {
  description = "Application name prefix used for resource naming"
  type        = string
  default     = "roundscribe"
}

variable "audio_bucket_name" {
  description = "Globally unique S3 bucket name for audio recordings"
  type        = string
}

variable "audio_s3_prefix" {
  description = "Key prefix for audio objects (e.g. 'audio')"
  type        = string
  default     = "audio"
}

variable "db_instance_class" {
  description = "RDS instance type"
  type        = string
  default     = "db.t3.medium"
}

variable "db_name" {
  description = "Postgres database name"
  type        = string
  default     = "roundscribe"
}

variable "db_username" {
  description = "Postgres master username"
  type        = string
  default     = "roundscribe"
}

variable "db_password" {
  description = "Postgres master password — set via TF_VAR_db_password or a secrets manager"
  type        = string
  sensitive   = true
}

variable "db_subnet_group_name" {
  description = "Name of an existing DB subnet group (must span at least 2 AZs)"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where the RDS instance and app will run"
  type        = string
}

variable "app_role_name" {
  description = "Name of the IAM role assumed by the application (ECS task role, EC2 instance profile, Lambda, etc.)"
  type        = string
  default     = "roundscribe-app-role"
}
