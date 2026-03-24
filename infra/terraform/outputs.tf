output "audio_bucket_name" {
  description = "S3 bucket name for audio recordings"
  value       = aws_s3_bucket.audio.id
}

output "audio_bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.audio.arn
}

output "kms_key_id" {
  description = "KMS key ID for SSE-KMS (use as ROUNDSCRIBE_KMS_KEY_ID)"
  value       = aws_kms_key.audio.id
}

output "kms_key_arn" {
  description = "KMS key ARN"
  value       = aws_kms_key.audio.arn
}

output "rds_endpoint" {
  description = "RDS instance endpoint (host:port — use to build DATABASE_URL)"
  value       = aws_db_instance.postgres.endpoint
}

output "rds_resource_id" {
  description = "RDS resource ID (needed for IAM auth connection string)"
  value       = aws_db_instance.postgres.resource_id
}

output "app_role_arn" {
  description = "ARN of the app IAM role to attach to your compute (ECS task role, EC2 instance profile, etc.)"
  value       = aws_iam_role.app.arn
}

output "database_url_template" {
  description = "Template DATABASE_URL — fill in the password before use"
  value       = "postgresql://${var.db_username}:<PASSWORD>@${aws_db_instance.postgres.endpoint}/${var.db_name}?sslmode=require"
  sensitive   = true
}
